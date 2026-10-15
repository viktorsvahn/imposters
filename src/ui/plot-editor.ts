/* The plot editor: opens in place of the poster.

   Quick first: a new plot starts from a gallery of chart types drawn with your
   table; then only the basics are shown (chart, table, the columns that matter
   for that chart). Everything else sits in small categories — titles, axes,
   look, error bars, hover, reference lines, size — one open at a time, each a
   handful of settings. Clicking a part of the preview opens its category.
   "Advanced" has all panels and layers, filters and the Vega-Lite spec. */

import { notify } from '../editor/hooks';
import { editor } from '../editor/store';
import type { Table } from '../model/data';
import { FONT_LIST } from '../model/design';
import { paletteById, paletteOfColors, PALETTES } from '../model/palettes';
import {
  alignRole, applyChartType, CHART_TYPES, compilePlot, defaultPlot, isDataLayer, isNumeric, LAYER_KINDS, mainLayer, newLayer,
  newPanel, panelList, valuesOf, type LayerKind, type PlotLayer, type PlotPanel, type PlotSpec, type TextRole, type TextStyle,
} from '../model/plot';
import type { AssetEntry } from '../model/project';
import { workspace } from '../project/data';
import { readPlot, renderPlot, savePlot, workspaceTables } from '../project/plots';
import { project } from '../project/session';
import { escapeHtml, uid } from '../util';
import { $ } from '../view/dom';
import { closeDataEditor } from './data-editor';
import { setFormatTarget, type FormatTarget, type TargetAction } from './formatbar';

type Category = 'titles' | 'axes' | 'look' | 'errors' | 'hover' | 'refs' | 'size' | 'advanced';

const pe = {
  spec: null as PlotSpec | null,
  name: '',
  asset: null as AssetEntry | null,
  dirty: false,
  /** the chart gallery is showing */
  gallery: false,
  /** the open category */
  open: null as Category | null,
  /** advanced: the panel and layer being edited; the spec shown as JSON */
  panel: 0,
  layer: null as string | null,
  json: false,
  root: null as string | null,
  version: -1, // workspace version the form was drawn for
  timer: 0 as ReturnType<typeof setTimeout> | 0,
  drawNo: 0,
  /** the text selected in the preview (the toolbar formats it) */
  sel: null as TextRef | null,
  /** start typing in this text once the preview shows it */
  editNext: null as TextRef | null,
};

/** A text in the preview: its role, the panel it belongs to (as drawn; -1 = the figure), and for axis titles which axis. */
interface TextRef {
  role: TextRole;
  panel: number;
  axis?: 'x' | 'y';
}

export const plotEditorOpen = (): boolean => !!pe.spec;

/* ---- form controls (data-k = what they change, data-t = how to read the value) ---- */

const esc = escapeHtml;
const field = (label: string, control: string, cls = ''): string => `<label class="pf ${cls}"><span>${label}</span>${control}</label>`;
const text = (k: string, v: string | null, ph = ''): string => `<input data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
const num = (k: string, v: number | null, ph = '', step = 'any'): string =>
  `<input type="number" data-k="${k}" data-t="num" value="${v ?? ''}" placeholder="${esc(ph)}" step="${step}">`;
const check = (k: string, v: boolean, label: string, title = ''): string =>
  `<label class="pc" title="${esc(title)}"><input type="checkbox" data-k="${k}" data-t="bool"${v ? ' checked' : ''}>${label}</label>`;
const select = (k: string, v: string, opts: [string, string][]): string =>
  `<select data-k="${k}">${opts.map(([o, l]) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const color = (k: string, v: string): string => `<input type="color" data-k="${k}" value="${esc(v || '#4477aa')}">`;
/** A column picker; with a table, numbers are marked # and text Aa. */
const columns = (k: string, v: string, cols: string[], none = '—', t?: Table): string =>
  select(k, v, [['', none], ...cols.map((c): [string, string] => [c, t ? `${isNumeric(t, c) ? '#' : 'Aa'}  ${c}` : c])]);
const row = (...parts: string[]): string => `<div class="prow">${parts.join('')}</div>`;

/* ---- the plot as it is ---- */

const tables = (): Record<string, Table> => workspaceTables();
const panel0 = (): PlotPanel => pe.spec!.panels[0];
const main = (): PlotLayer | undefined => mainLayer(pe.spec!);
const mainTable = (): Table | undefined => tables()[main()?.data ?? ''];
const chartLabel = (id: string): string => CHART_TYPES.find((c) => c.id === id)?.label ?? 'Custom';

/* ---- basics: always shown ---- */

function basics(): string {
  const s = pe.spec!, l = main(), t = mainTable(), cols = t?.columns ?? [];
  let h = `<button data-pa="gallery" class="pchart" title="Choose another kind of chart">` +
    `<span class="muted">Chart</span><b>${esc(chartLabel(s.chart))}</b><span class="muted">change ▾</span></button>`;
  if (!l) return h + '<p class="muted">This plot has no data layer. Pick a chart, or add layers under Advanced.</p>';
  h += row(field('Table', columns('main.data', l.data, Object.keys(tables()), 'choose…')));
  if (l.kind === 'hist') h += row(field('Values', columns('main.x', l.x, cols, '—', t)));
  else if (s.chart === 'dots') h += row(field('Value', columns('main.x', l.x, cols, '—', t)), field('Rows', columns('main.y', l.y, cols, '—', t)));
  else h += row(field('X', columns('main.x', l.x, cols, '—', t)), field('Y', columns('main.y', l.y, cols, '—', t)));
  h += row(field('Colour by', columns('main.color', l.color, cols, 'one colour', t)),
    field('One panel per', columns('panels.0.split', panel0().split, cols, 'one panel', t)));
  return h;
}

/* ---- categories: small groups of settings, one open at a time ---- */

function summary(c: Category): string {
  const s = pe.spec!, p = panel0(), l = main();
  const axis = (a: PlotPanel['x'], n: string) => `${n} ${a.scale}${a.min !== null || a.max !== null ? ` ${a.min ?? '…'}–${a.max ?? '…'}` : ''}`;
  switch (c) {
    case 'titles': return s.title || p.title || (p.split ? `panels named by ${p.split}` : 'no title');
    case 'axes': return `${axis(p.x, 'x')} · ${axis(p.y, 'y')}`;
    case 'look': return l ? (l.color ? `colours by ${l.color}` : 'one colour') : '';
    case 'errors': return l && (l.xerr || l.yerr || l.lo) ? [l.xerr && `± ${l.xerr}`, l.yerr && `± ${l.yerr}`, l.lo && `${l.lo}–${l.hi}`].filter(Boolean).join(', ') : 'none';
    case 'hover': return l?.hover.length ? `+ ${l.hover.join(', ')}` : 'the plotted values';
    case 'refs': { const n = p.layers.filter((x) => !isDataLayer(x)).length; return n ? `${n}` : 'none'; }
    case 'size': return `${s.width} × ${s.height} mm, ${s.font} pt`;
    case 'advanced': return s.raw ? 'hand-written Vega-Lite' : `${s.panels.length} panel${s.panels.length > 1 ? 's' : ''}, ${s.panels.reduce((n, x) => n + x.layers.length, 0)} layers`;
  }
}

function titles(): string {
  const s = pe.spec!, p = panel0(), l = main();
  const axisTitle = (n: 'x' | 'y', col: string | undefined) =>
    row(field(`${n.toUpperCase()} axis title`, text(`panels.0.${n}.title`, p[n].title === '' ? '' : p[n].title, col || 'column name'), 'grow'),
      check(`panels.0.${n}.hideTitle`, p[n].title === '', 'none'));
  let h = row(field('Title', text('title', s.title)), field('Subtitle', text('subtitle', s.subtitle)));
  h += axisTitle('x', l?.x) + axisTitle('y', l?.kind === 'hist' ? 'Count' : l?.y);
  if (p.split) {
    h += `<h4>Panels <span class="muted">— one per ${esc(p.split)}</span></h4>` + valuesOf(p, p.split, tables()).map((v) => row(
      field(esc(v), `<input data-k="split-title" data-v="${esc(v)}" value="${esc(p.splitTitles[v]?.title ?? '')}" placeholder="${esc(v)}">`),
      field('subtitle', `<input data-k="split-sub" data-v="${esc(v)}" value="${esc(p.splitTitles[v]?.subtitle ?? '')}" placeholder="e.g. units">`))).join('');
  } else h += row(field('Panel title', text('panels.0.title', p.title)), field('Panel subtitle', text('panels.0.subtitle', p.subtitle)));
  return h;
}

function axes(): string {
  const p = panel0(), l = main(), t = mainTable();
  return (['x', 'y'] as const).map((n) => {
    const a = p[n], col = n === 'x' ? l?.x : l?.y;
    const numeric = (!!t && !!col && isNumeric(t, col) && l?.kind !== 'bar') || (n === 'y' && (l?.kind === 'hist' || l?.kind === 'bar'));
    return `<h4>${n.toUpperCase()} axis <span class="muted">${esc(col || '')}</span></h4>` + (numeric
      ? row(field('Scale', select(`panels.0.${n}.scale`, a.scale, [['linear', 'Linear'], ['log', 'Log'], ['sqrt', 'Square root']])),
        field('From', num(`panels.0.${n}.min`, a.min, 'auto')), field('To', num(`panels.0.${n}.max`, a.max, 'auto'))) +
        row(check(`panels.0.${n}.grid`, a.grid, 'Grid lines'), check(`panels.0.${n}.zero`, a.zero, 'Include 0'))
      : row(check(`panels.0.${n}.grid`, a.grid, 'Grid lines'),
        check(`panels.0.${n}.colorLabels`, a.colorLabels, 'Colour labels by group', 'Each category label gets the colour of its group'),
        check(`panels.0.${n}.groupGap`, !!a.groupGap, 'Gap between groups', 'Leave space between the groups of rows (e.g. periodic, then cluster)')));
  }).join('');
}

function look(): string {
  const s = pe.spec!, l = main();
  if (!l) return '';
  let h = l.color
    ? row(field('Colour scheme', select('paletteScheme', paletteOfColors(s.palette)?.id ?? '', [
      ...PALETTES.filter((p) => p.kind === 'qualitative').map((p) => [p.id, `${p.name} (Paul Tol)`] as [string, string]),
      ...(paletteOfColors(s.palette) ? [] : [['', 'Own colours'] as [string, string]]),
    ]))) +
      `<h4>Group colours <span class="muted">— in order</span></h4><div class="palette">${s.palette.map((c, i) => color(`palette.${i}`, c)).join('')}</div>`
    : row(field('Colour', color('main.fill', l.fill || s.palette[0])));
  const size = l.kind === 'scatter' ? 'Marker size (pt)' : l.kind === 'line' ? 'Line width (pt)' : '';
  h += row(size ? field(size, num('main.size', l.size, '', '0.5')) : '', field('Opacity', num('main.opacity', l.opacity, '', '0.05')),
    l.kind === 'hist' ? field('Bins (max)', num('main.bins', l.bins, '', '1')) : '');
  h += row(l.kind === 'scatter' ? check('main.outline', l.outline, 'White ring') : '',
    l.kind === 'line' ? check('main.points', l.points, 'Markers') + check('main.dash', l.dash, 'Dashed') : '',
    ['bar', 'area', 'hist'].includes(l.kind) ? check('main.stack', l.stack, 'Stacked') : '');
  return h;
}

function errors(): string {
  const l = main(), t = mainTable(), cols = t?.columns ?? [];
  if (!l) return '';
  const band = pe.spec!.chart === 'band';
  if (l.kind === 'hist' || (l.kind === 'area' && !band)) return '<p class="muted">This chart has no error bars.</p>';
  if (band) return `<p class="muted">The shaded band: ± a column around the line.</p>${row(field('Band ±', columns('main.yerr', panel0().layers.find((x) => x.kind === 'area')?.yerr ?? '', cols, 'none', t)))}`;
  return '<p class="muted">Bars of ± a column, or from one column to another.</p>' +
    row(field('X ±', columns('main.xerr', l.xerr, cols, 'none', t)), field('Y ±', columns('main.yerr', l.yerr, cols, 'none', t))) +
    row(field('or from', columns('main.lo', l.lo, cols, '—', t)), field('to', columns('main.hi', l.hi, cols, '—', t)));
}

function hover(): string {
  const l = main(), cols = mainTable()?.columns ?? [];
  if (!l) return '';
  const always = new Set([l.x, l.y, l.color, l.xerr, l.yerr].filter(Boolean));
  return `<p class="muted">Hovering over a mark shows its ${[...always].map(esc).join(', ')}. Also show:</p>` +
    `<div class="phover">${cols.filter((c) => !always.has(c)).map((c) =>
      `<label class="pc"><input type="checkbox" data-k="main.hover" data-t="list" data-v="${esc(c)}"${l.hover.includes(c) ? ' checked' : ''}>${esc(c)}</label>`).join('') || '<span class="muted">(no other columns)</span>'}</div>`;
}

function refs(): string {
  const p = panel0(), t = tables();
  const items = p.layers.map((l, i) => ({ l, i })).filter(({ l }) => !isDataLayer(l));
  const h = items.map(({ l, i }) => {
    const k = `panels.0.layers.${i}`, band = l.kind === 'hspan' || l.kind === 'vspan';
    const cols = (t[l.data]?.columns ?? []).filter((c) => isNumeric(t[l.data], c));
    const where = band ? 'From the values in' : 'At the mean of';
    return `<div class="pref">` +
      row(field('', select(`${k}.kind`, l.kind, [['vline', 'Vertical line'], ['hline', 'Horizontal line'], ['vspan', 'Vertical band'], ['hspan', 'Horizontal band']]), 'grow'),
        field('', color(`${k}.fill`, l.fill)), `<button data-pa="ref-del" data-i="${i}" title="Remove">×</button>`) +
      row(field(where, columns(`${k}.data`, l.data, Object.keys(t), 'a number I type'), 'grow'),
        l.data ? field('column', columns(`${k}.valueField`, l.valueField, cols))
          : band ? field('From', num(`${k}.from`, l.from)) + field('To', num(`${k}.to`, l.to)) : field('At', num(`${k}.value`, l.value))) +
      (l.data ? row(field('Only rows where', columns(`${k}.filter.field`, l.filter?.field ?? '', t[l.data]?.columns ?? [], 'all rows')),
        l.filter ? field('is', text(`${k}.filter.value`, l.filter.value)) : '') : '') +
      (band ? '' : row(check(`${k}.dash`, l.dash, 'Dashed'))) + '</div>';
  }).join('');
  return (h || '<p class="muted">Mark a reference value (an experiment, a target) with a line, or a range with a shaded band.</p>') +
    row('<button data-pa="ref-add" data-v="line">+ Line</button><button data-pa="ref-add" data-v="band">+ Band</button>') +
    (p.split && items.length ? `<p class="muted">A line or band from a table with a “${esc(p.split)}” column uses each panel's own rows.</p>` : '');
}

function size(): string {
  const s = pe.spec!;
  return row(field('Panel width (mm)', num('width', s.width, '', '1')), field('Panel height (mm)', num('height', s.height, '', '1'))) +
    row(field('Text size (pt)', num('font', s.font, '', '1')), field('Font', select('fontFamily', s.fontFamily, [
      ...FONT_LIST.filter((f) => f.group !== 'web').map((f) => [f.css, f.label] as [string, string]),
      ...(FONT_LIST.some((f) => f.css === s.fontFamily) ? [] : [[s.fontFamily, s.fontFamily.split(',')[0].replace(/"/g, '')] as [string, string]]),
    ]))) +
    row(field('Panels per row', num('columns', s.columns, '', '1')), field('Legend', select('legend', s.legend, [['bottom', 'Below'], ['right', 'Right'], ['top', 'Above'], ['none', 'None']]))) +
    row(check('frame', s.frame, 'Frame around panels'));
}

/* ---- advanced: every panel and layer, and the spec itself ---- */

const SIZE_LABEL: Partial<Record<LayerKind, string>> = {
  scatter: 'Marker (pt)', line: 'Line width (pt)', errorbar: 'Line width (pt)', text: 'Text (pt)', hline: 'Line width (pt)', vline: 'Line width (pt)',
};

function layerSummary(l: PlotLayer): string {
  const kind = LAYER_KINDS.find((k) => k.kind === l.kind)!.label.split(' (')[0];
  if (!isDataLayer(l)) return `${kind}${l.valueField ? ` from ${l.data}.${l.valueField}` : l.value !== null ? ` at ${l.value}` : ''}`;
  return `${kind} · ${l.data || '?'}: ${l.kind === 'hist' ? l.x : `${l.y} vs ${l.x}`}${l.color ? ` by ${l.color}` : ''}`;
}

function layerForm(k: string, l: PlotLayer): string {
  const t = tables(), cols = t[l.data]?.columns ?? [], data = isDataLayer(l);
  let h = row(field('Type', select(k + '.kind', l.kind, LAYER_KINDS.map((x): [string, string] => [x.kind, x.label]))),
    field('Data', columns(k + '.data', l.data, Object.keys(t), data ? 'choose…' : 'none (numbers)')));
  if (data) {
    h += row(field(l.kind === 'hist' ? 'Values' : 'X', columns(k + '.x', l.x, cols)), l.kind === 'hist' ? '' : field('Y', columns(k + '.y', l.y, cols)),
      l.kind === 'text' ? field('Label text', columns(k + '.text', l.text, cols, 'Y values')) : '');
    h += row(field('Colour by', columns(k + '.color', l.color, cols, 'one colour')), l.color ? '' : field('Colour', color(k + '.fill', l.fill || pe.spec!.palette[0])));
    if (['scatter', 'line', 'bar', 'errorbar', 'area'].includes(l.kind)) {
      h += row(field('X ±', columns(k + '.xerr', l.xerr, cols)), field('Y ±', columns(k + '.yerr', l.yerr, cols))) +
        row(field('or from', columns(k + '.lo', l.lo, cols)), field('to', columns(k + '.hi', l.hi, cols)));
    }
  } else {
    h += row(l.data ? field('Column', columns(k + '.valueField', l.valueField, cols, 'a number')) : '',
      !l.valueField ? (l.kind.endsWith('span') ? field('From', num(k + '.from', l.from)) + field('To', num(k + '.to', l.to)) : field('At', num(k + '.value', l.value))) : '',
      field('Colour', color(k + '.fill', l.fill)));
  }
  h += row(SIZE_LABEL[l.kind] ? field(SIZE_LABEL[l.kind]!, num(k + '.size', l.size, '', '0.5')) : '', field('Opacity', num(k + '.opacity', l.opacity, '', '0.05')));
  if (l.data) h += row(field('Only rows where', columns(k + '.filter.field', l.filter?.field ?? '', cols, 'all rows')), l.filter ? field('is', text(k + '.filter.value', l.filter.value)) : '');
  return h;
}

function advanced(): string {
  const s = pe.spec!;
  if (pe.json) {
    const { vl } = compilePlot(s, tables());
    const shown = { ...vl };
    delete shown.datasets;
    return `<p class="muted">The plot as a <a href="https://vega.github.io/vega-lite/docs/" target="_blank">Vega-Lite</a> spec, for anything the settings can't do. ` +
      `Apply replaces the settings with it. Tables are named data, e.g. <code>{"data": {"name": "${esc(Object.keys(tables())[0] ?? 'table')}"}}</code>.</p>` +
      `<textarea class="pe-json" spellcheck="false">${esc(JSON.stringify(s.raw ?? shown, null, 2))}</textarea>` +
      row('<button data-pa="json-apply" class="primary">Apply</button><button data-pa="json-close">Close</button>',
        s.raw ? '<button data-pa="json-drop">Drop it, use the settings again</button>' : '');
  }
  const i = Math.min(pe.panel, s.panels.length - 1), p = s.panels[i], k = `panels.${i}`;
  const allCols = [...new Set(p.layers.flatMap((l) => tables()[l.data]?.columns ?? []))];
  const tabs = s.panels.map((x, j) => `<button data-pa="panel" data-i="${j}" class="${j === i ? 'on' : ''}">${esc(x.title || `Panel ${j + 1}`)}</button>`).join('');
  const layers = p.layers.map((l, j) => {
    const open = l.id === pe.layer;
    return `<div class="player${open ? ' open' : ''}"><div class="player-head" data-pa="layer" data-i="${j}">` +
      `<span class="pnum">${j + 1}</span><span class="psum">${esc(layerSummary(l))}</span>` +
      `<button data-pa="layer-up" data-i="${j}" title="Draw earlier (below)">↑</button><button data-pa="layer-down" data-i="${j}" title="Draw later (on top)">↓</button>` +
      `<button data-pa="layer-copy" data-i="${j}" title="Duplicate">⧉</button><button data-pa="layer-del" data-i="${j}" title="Delete">×</button></div>` +
      (open ? `<div class="player-body">${layerForm(`${k}.layers.${j}`, l)}</div>` : '') + '</div>';
  }).join('');
  return `<p class="muted">A plot is panels (subplots) of layers drawn on top of each other. The settings above change the first panel's main layer.</p>` +
    `<h4>Panels</h4><div class="ptabs">${tabs}<button data-pa="panel-add" title="Add a panel">+</button></div>` +
    row(field('Panel shows rows where', columns(k + '.filter.field', p.filter?.field ?? '', allCols, 'all rows')), p.filter ? field('is', text(k + '.filter.value', p.filter.value)) : '') +
    row(`<button data-pa="panel-copy">Duplicate panel</button><button data-pa="panel-del"${s.panels.length < 2 ? ' disabled' : ''}>Delete panel</button>`) +
    `<h4>Layers <span class="muted">— last on top</span></h4>${layers || '<p class="muted">No layers.</p>'}` +
    row(field('Add a layer', select('add-layer', '', [['', 'choose a type…'], ...LAYER_KINDS.map((x): [string, string] => [x.kind, x.label])]))) +
    row('<button data-pa="json-open">Edit as Vega-Lite…</button>');
}

const CATEGORIES: { id: Category; label: string; body: () => string }[] = [
  { id: 'titles', label: 'Titles', body: titles },
  { id: 'axes', label: 'Axes', body: axes },
  { id: 'look', label: 'Colours & style', body: look },
  { id: 'errors', label: 'Error bars', body: errors },
  { id: 'hover', label: 'Hover info', body: hover },
  { id: 'refs', label: 'Reference lines & bands', body: refs },
  { id: 'size', label: 'Size & layout', body: size },
  { id: 'advanced', label: 'Advanced', body: advanced },
];

function renderForm(): void {
  const s = pe.spec!, el = $('#plotEditor .pe-form');
  pe.version = workspace.version;
  if (s.raw && !pe.json) {
    el.innerHTML = `<section class="pbasics"><p>This plot uses a hand-written Vega-Lite spec.</p>` +
      row('<button data-pa="json-open">Edit it</button><button data-pa="json-drop">Drop it, use the settings</button>') + '</section>';
    return;
  }
  const cats = CATEGORIES.map((c) => {
    const open = pe.open === c.id;
    return `<div class="pcat${open ? ' open' : ''}" data-cat="${c.id}"><button class="pcat-head" data-pa="cat" data-v="${c.id}">` +
      `<span class="pcat-arrow">${open ? '▾' : '▸'}</span><b>${c.label}</b><span class="pcat-sum">${esc(summary(c.id))}</span></button>` +
      (open ? `<div class="pcat-body">${c.body()}</div>` : '') + '</div>';
  }).join('');
  el.innerHTML = `<section class="pbasics">${basics()}</section><section class="pcats">${cats}</section>`;
}

function renderHead(): void {
  $('#plotEditor .pe-head').innerHTML = `<input class="pe-name" value="${esc(pe.name)}" title="Name in the image library" spellcheck="false">` +
    `<span class="muted">${pe.asset ? esc(pe.asset.src.replace(/\.svg$/, '.plot.json')) : 'new plot — not saved yet'}</span><span class="pe-dirty"></span><span class="spacer"></span>` +
    `<button data-pa="save" class="primary" title="Save the plot and its picture (Ctrl+S)">Save</button><button data-pa="close" title="Back to the poster (Esc)">Close</button>`;
  setDirty(pe.dirty);
}

function setDirty(v: boolean): void {
  pe.dirty = v;
  const mark = $('#plotEditor .pe-dirty');
  if (mark) mark.textContent = v ? '● unsaved changes' : '';
}

/* ---- the preview and the gallery ---- */

function schedulePreview(): void {
  clearTimeout(pe.timer || undefined);
  pe.timer = setTimeout(() => void drawPreview(), 120);
}

async function drawPreview(): Promise<void> {
  if (!pe.spec || pe.gallery) return;
  const n = ++pe.drawNo;
  const { svg, errors } = await renderPlot(pe.spec);
  if (n !== pe.drawNo || !pe.spec || pe.gallery) return;
  $('#plotEditor .pe-errors').innerHTML = errors.map((e) => `<div>${esc(e)}</div>`).join('');
  $('#plotEditor .pe-canvas').innerHTML = svg ? `<div class="plot-svg">${svg}</div>` : '';
  $('#plotEditor .pe-addtitle').hidden = !!pe.spec.title || !!pe.spec.raw;
  if (pe.editNext) { const r = pe.editNext; pe.editNext = null; selectText(r, true); }
  else if (pe.sel) markSelection();
}

/** The chart gallery: every chart type, drawn small from the plot's table. */
async function drawGallery(): Promise<void> {
  const l = main(), t = mainTable(), box = $('#plotEditor .pe-gallery');
  if (!pe.spec || !l || !t) { box.innerHTML = '<p class="muted">Choose a table first.</p>'; return; }
  const n = ++pe.drawNo;
  box.innerHTML = `<h3>What kind of chart? <span class="muted">— drawn from ${esc(l.data)}</span></h3><div class="pgal">${CHART_TYPES.map((c) =>
    `<button class="pgal-card${c.id === pe.spec!.chart ? ' on' : ''}" data-pa="chart" data-v="${c.id}" title="${esc(c.hint)}">` +
    `<div class="pgal-pic"></div><b>${c.label}</b><span>${esc(c.hint)}</span></button>`).join('')}</div>` +
    (pe.asset ? row('<button data-pa="gallery">Keep the chart as it is</button>') : '');
  for (const c of CHART_TYPES) {
    const thumb = JSON.parse(JSON.stringify(pe.spec)) as PlotSpec;
    Object.assign(thumb, { title: '', subtitle: '', width: 42, height: 26, font: 6, legend: 'none', raw: null });
    thumb.panels = [{ ...thumb.panels[0], title: '', subtitle: '' }];
    applyChartType(thumb, c.id, l.data, t);
    thumb.panels[0].split = ''; // small: one panel
    const { svg } = await renderPlot(thumb);
    if (n !== pe.drawNo || !pe.gallery) return;
    const pic = box.querySelector(`[data-v="${c.id}"] .pgal-pic`);
    if (pic) pic.innerHTML = svg;
  }
}

function showGallery(on: boolean): void {
  pe.gallery = on;
  $('#plotEditor .pe-gallery').hidden = !on;
  $('#plotEditor .pe-canvas').hidden = on;
  $('#plotEditor .pe-errors').hidden = on;
  $('#plotEditor .pe-hint').hidden = on;
  if (on) void drawGallery();
  else void drawPreview();
}

/* ---- changing the plot ---- */

const COLUMN_PROPS = ['data', 'x', 'y', 'color', 'xerr', 'yerr', 'lo', 'hi', 'hover'];
const ERROR_PROPS = ['xerr', 'yerr', 'lo', 'hi'];

/** The layers a "main.<prop>" setting changes: columns go to every data layer of the first panel (they
    share them), error columns of a band chart to its band, the look to the main layer. */
function mainTargets(prop: string): PlotLayer[] {
  const data = panel0().layers.filter(isDataLayer);
  if (pe.spec!.chart === 'band' && ERROR_PROPS.includes(prop)) return data.filter((l) => l.kind === 'area');
  if (COLUMN_PROPS.includes(prop)) return data;
  const m = main();
  return m ? [m] : [];
}

function valueOf(input: HTMLInputElement | HTMLSelectElement, current: unknown): unknown {
  const t = input.dataset.t, raw = input.value;
  if (t === 'list') {
    const list = current as string[], v = input.dataset.v!;
    return (input as HTMLInputElement).checked ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v);
  }
  if (t === 'bool') return (input as HTMLInputElement).checked;
  if (t === 'num') return raw === '' ? null : Number(raw);
  return raw;
}

/** After a layer gets another table: keep the columns that table has, choose others. */
function fitColumns(l: PlotLayer): void {
  const t = tables()[l.data];
  if (!t) return;
  const nums = t.columns.filter((c) => isNumeric(t, c));
  if (!t.columns.includes(l.x)) l.x = (l.kind === 'hist' ? nums[0] : t.columns[0]) ?? '';
  if (!t.columns.includes(l.y)) l.y = nums.find((c) => c !== l.x) ?? '';
  for (const c of ['color', 'xerr', 'yerr', 'lo', 'hi', 'text', 'valueField'] as const) if (!t.columns.includes(l[c])) l[c] = '';
  if (l.filter && !t.columns.includes(l.filter.field)) l.filter = null;
  l.hover = l.hover.filter((c) => t.columns.includes(c));
}

/** Apply a control: data-k is "main.<prop>", "split-title" / "split-sub", or a path in the plot. */
function setPath(path: string, input: HTMLInputElement | HTMLSelectElement): void {
  const s = pe.spec!;
  if (path.startsWith('main.')) {
    const prop = path.slice(5) as keyof PlotLayer;
    for (const l of mainTargets(prop)) {
      (l as unknown as Record<string, unknown>)[prop] = valueOf(input, l[prop]);
      if (prop === 'data') fitColumns(l);
    }
    if (prop === 'data' && !mainTable()?.columns.includes(panel0().split)) panel0().split = '';
    return;
  }
  if (path === 'paletteScheme') {
    const p = PALETTES.find((x) => x.id === input.value);
    if (p) s.palette = [...p.colors];
    return;
  }
  if (path === 'split-title' || path === 'split-sub') {
    const p = panel0(), v = input.dataset.v!;
    const e = (p.splitTitles[v] ??= { title: '', subtitle: '' });
    if (path === 'split-title') e.title = input.value; else e.subtitle = input.value;
    return;
  }
  const keys = path.split('.'), last = keys.pop()!;
  let obj = s as unknown as Record<string, unknown>;
  for (const k of keys) obj = (obj[k] ?? {}) as Record<string, unknown>;

  if (keys.at(-1) === 'filter') { // a filter's column / value: no column = no filter
    let parent = s as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) parent = parent[k] as Record<string, unknown>;
    if (last === 'field') parent.filter = input.value ? { field: input.value, value: (parent.filter as { value?: string } | null)?.value ?? '' } : null;
    else if (parent.filter) (parent.filter as { value: string }).value = input.value;
    return;
  }
  if (last === 'hideTitle') { obj.title = (input as HTMLInputElement).checked ? '' : null; return; }
  if (last === 'title' && /^[xy]$/.test(keys.at(-1) ?? '')) { obj.title = input.value === '' ? null : input.value; return; }
  obj[last] = valueOf(input, obj[last]);
  if (last === 'data' && keys.at(-2) === 'layers') fitColumns(obj as unknown as PlotLayer);
}

function currentPanel(): PlotPanel {
  return pe.spec!.panels[Math.min(pe.panel, pe.spec!.panels.length - 1)];
}

function action(a: string, i: number, v: string): void {
  const s = pe.spec!, p = currentPanel();
  const move = (from: number, to: number) => { if (to < 0 || to >= p.layers.length) return; const [l] = p.layers.splice(from, 1); p.layers.splice(to, 0, l); };
  switch (a) {
    case 'cat': pe.open = pe.open === v ? null : v as Category; renderForm(); return;
    case 'add-title': s.title = 'Title'; pe.editNext = { role: 'title', panel: -1 }; break;
    case 'gallery': showGallery(!pe.gallery); return;
    case 'chart': {
      const l = main(), t = mainTable();
      if (!l || !t) return;
      applyChartType(s, v, l.data, t);
      setDirty(true);
      renderForm();
      showGallery(false);
      return;
    }
    case 'ref-add': {
      // across the value axis: vertical for dots, horizontal for most others
      const across = s.chart === 'dots' || main()?.kind === 'hist' ? 'v' : 'h';
      const l = newLayer((v === 'line' ? `${across}line` : `${across}span`) as LayerKind);
      const first = panel0().layers.findIndex(isDataLayer);
      panel0().layers.splice(first < 0 ? panel0().layers.length : first, 0, l); // below the data
      break;
    }
    case 'ref-del': panel0().layers.splice(i, 1); break;
    case 'panel': pe.panel = i; renderForm(); return;
    case 'panel-add': {
      const first = p.layers.find((l) => l.data);
      s.panels.push(newPanel(first ? [newLayer(first.kind, first.data, first.x, first.y)] : []));
      pe.panel = s.panels.length - 1;
      break;
    }
    case 'panel-copy': {
      const c = JSON.parse(JSON.stringify(p)) as PlotPanel;
      c.id = uid();
      c.layers.forEach((l) => { l.id = uid(); });
      s.panels.splice(pe.panel + 1, 0, c);
      pe.panel++;
      break;
    }
    case 'panel-del': if (s.panels.length > 1) { s.panels.splice(pe.panel, 1); pe.panel = Math.max(0, pe.panel - 1); } break;
    case 'layer': pe.layer = pe.layer === p.layers[i].id ? null : p.layers[i].id; renderForm(); return;
    case 'layer-up': move(i, i - 1); break;
    case 'layer-down': move(i, i + 1); break;
    case 'layer-copy': { const c = { ...JSON.parse(JSON.stringify(p.layers[i])), id: uid() }; p.layers.splice(i + 1, 0, c); pe.layer = c.id; break; }
    case 'layer-del': p.layers.splice(i, 1); break;
    case 'json-open': pe.open = 'advanced'; pe.json = true; renderForm(); return;
    case 'json-close': pe.json = false; renderForm(); return;
    case 'json-apply': {
      try {
        const raw = JSON.parse($<HTMLTextAreaElement>('#plotEditor .pe-json').value);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The spec must be a JSON object');
        s.raw = raw;
      } catch (err) {
        notify('Not valid: ' + (err as Error).message);
        return;
      }
      break;
    }
    case 'json-drop':
      if (!confirm('Drop the hand-written spec and use the settings again?')) return;
      s.raw = null;
      pe.json = false;
      break;
    case 'save': void save(); return;
    case 'close': closePlotEditor(); return;
    default: return;
  }
  setDirty(true);
  renderForm();
  schedulePreview();
}

/** Clicking a part of the preview opens its settings. */
function categoryAt(target: Element): Category | null {
  const cls = target.closest('[class*="role-"]')?.getAttribute('class') ?? '';
  if (/role-axis-title|role-title/.test(cls)) return 'titles';
  if (/role-axis/.test(cls)) return 'axes';
  if (/role-legend/.test(cls) || target.closest('[aria-label]')) return 'look';
  return null;
}

async function save(): Promise<void> {
  if (!pe.spec) return;
  const name = $<HTMLInputElement>('#plotEditor .pe-name').value.trim() || pe.name || 'Plot';
  const asset = await savePlot(pe.spec, name, pe.asset);
  if (!asset) { notify('Could not save the plot'); return; }
  pe.asset = asset;
  pe.name = asset.name;
  pe.dirty = false;
  renderHead();
  notify(`Saved ${asset.name} — it is in the image library under Plots`);
}

/* ---- texts on the plot: click to edit, the toolbar formats them ---- */

const EDITABLE = new Set<TextRole>(['title', 'subtitle', 'panelTitle', 'panelSubtitle', 'axisTitle']);
const ROLE_CATEGORY: Record<TextRole, Category> = {
  title: 'titles', subtitle: 'titles', panelTitle: 'titles', panelSubtitle: 'titles', axisTitle: 'titles', axisLabel: 'axes', legend: 'look',
};
/** Default look of each text (as compilePlot draws it): size as a share of the plot's text size, bold, colour. */
const TEXT_DEFAULT: Record<TextRole, [number, boolean, string]> = {
  title: [1.3, true, '#111111'], subtitle: [0.975, false, '#444444'], panelTitle: [1.05, true, '#111111'],
  panelSubtitle: [0.7875, false, '#555555'], axisTitle: [0.85, false, '#222222'], axisLabel: [0.8, false, '#333333'], legend: [0.8, false, '#222222'],
};

/** Which text of the plot an element of the preview is. */
function textRefOf(el: Element): TextRef | null {
  const text = el.closest('text');
  if (!text) return null;
  const cls = text.closest('[class*="role-"]')?.getAttribute('class') ?? '';
  const m = /concat_(\d+)_group/.exec(text.closest('[class*="concat_"]')?.getAttribute('class') ?? '');
  const panel = m ? +m[1] : -1;
  // a plot of one panel without a figure title shows the panel's title on top
  const top = panel < 0 && !!pe.spec!.title;
  if (/role-title-text/.test(cls)) return top ? { role: 'title', panel: -1 } : { role: 'panelTitle', panel: Math.max(0, panel) };
  if (/role-title-subtitle/.test(cls)) return top ? { role: 'subtitle', panel: -1 } : { role: 'panelSubtitle', panel: Math.max(0, panel) };
  if (/role-axis-title/.test(cls)) return { role: 'axisTitle', panel: Math.max(0, panel), axis: /rotate\(/.test(text.getAttribute('transform') ?? '') ? 'y' : 'x' };
  if (/role-axis-label/.test(cls)) return { role: 'axisLabel', panel: Math.max(0, panel) };
  if (/role-legend/.test(cls)) return { role: 'legend', panel: -1 };
  return null;
}

const sameRef = (a: TextRef, b: TextRef): boolean => a.role === b.role && a.panel === b.panel && a.axis === b.axis;

/** The element(s) of a text in the preview (axis labels and legends: their whole group). */
function textEls(ref: TextRef): Element[] {
  const found = [...$('#plotEditor .pe-canvas').querySelectorAll('text')].filter((t) => { const r = textRefOf(t); return r && sameRef(r, ref); });
  if (ref.role === 'axisLabel' || ref.role === 'legend') {
    const groups = new Set(found.map((t) => t.closest('[class*="role-axis-label"], [class*="role-legend"]')!.closest('g[class*="role-legend"], g[class*="role-axis"]') ?? t));
    return [...groups];
  }
  return found.slice(0, 1);
}

/** The text's words as stored, and where to store new ones. */
function textAccess(ref: TextRef): { get: () => string; set: (v: string) => void } | null {
  const s = pe.spec!;
  if (ref.role === 'title') return { get: () => s.title, set: (v) => { s.title = v; } };
  if (ref.role === 'subtitle') return { get: () => s.subtitle, set: (v) => { s.subtitle = v; } };
  const item = panelList(s, tables())[ref.panel];
  if (!item) return null;
  const p = s.panels[item.panel];
  if (ref.role === 'axisTitle') {
    const a = p[ref.axis!], l = main();
    return { get: () => a.title ?? (ref.axis === 'x' ? l?.x : l?.kind === 'hist' ? 'Count' : l?.y) ?? '', set: (v) => { a.title = v; } };
  }
  const sub = ref.role === 'panelSubtitle';
  if (item.value === null) return { get: () => (sub ? p.subtitle : p.title), set: (v) => { if (sub) p.subtitle = v; else p.title = v; } };
  const v0 = item.value;
  const e = () => (p.splitTitles[v0] ??= { title: '', subtitle: '' });
  return { get: () => (sub ? p.splitTitles[v0]?.subtitle ?? '' : p.splitTitles[v0]?.title || v0), set: (v) => { if (sub) e().subtitle = v; else e().title = v; } };
}

/** The toolbar's view of a text: its look now, and how to change it. */
function formatTarget(ref: TextRef): FormatTarget {
  const style = (r: TextRole): TextStyle => (pe.spec!.text[r] ??= {});
  const state = () => {
    const s = pe.spec!, t = s.text[ref.role] ?? {}, [k, bold, color] = TEXT_DEFAULT[ref.role];
    return {
      font: FONT_LIST.find((f) => f.css === t.font)?.id ?? '', size: t.size ?? s.font * k, bold: t.bold ?? bold, italic: !!t.italic,
      align: s.text[alignRole(ref.role)]?.align ?? 'left', color: t.color ?? color,
    };
  };
  return {
    state,
    apply: (what: TargetAction, value?: string | number) => {
      const st = state();
      const t = style(ref.role);
      if (what === 'bold') t.bold = !st.bold;
      else if (what === 'italic') t.italic = !st.italic;
      else if (what === 'align') style(alignRole(ref.role)).align = value as TextStyle['align'];
      else if (what === 'size') t.size = Number(value);
      else if (what === 'font') t.font = (value as string) || undefined;
      else if (what === 'color') t.color = (value as string) || undefined;
      setDirty(true);
      schedulePreview();
    },
  };
}

/** Select a text: outline it, point the toolbar at it, open its settings; editable texts get a text box. */
function selectText(ref: TextRef, edit: boolean): void {
  pe.sel = ref;
  setFormatTarget(formatTarget(ref));
  if (pe.open !== ROLE_CATEGORY[ref.role]) { pe.open = ROLE_CATEGORY[ref.role]; renderForm(); }
  markSelection();
  if (edit) startEdit(ref);
}

function deselectText(): void {
  if (!pe.sel) return;
  pe.sel = null;
  $('#plotEditor .pe-canvas').querySelector('.pe-selbox')?.remove();
  setFormatTarget('off');
}

/** Outline the selected text (after every redraw too). */
function markSelection(): void {
  const canvas = $('#plotEditor .pe-canvas');
  canvas.querySelector('.pe-selbox')?.remove();
  const els = pe.sel ? textEls(pe.sel) : [];
  if (!els.length) return;
  const c = canvas.getBoundingClientRect(), r = els[0].getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'pe-selbox';
  Object.assign(box.style, { left: r.left - c.left - 3 + 'px', top: r.top - c.top - 2 + 'px', width: r.width + 6 + 'px', height: r.height + 4 + 'px' });
  canvas.appendChild(box);
}

/** Type over a text, right where it is. Enter or clicking elsewhere keeps it, Esc doesn't. */
function startEdit(ref: TextRef): void {
  const access = textAccess(ref), el = textEls(ref)[0] as SVGTextElement | undefined;
  if (!access || !el) return;
  const canvas = $('#plotEditor .pe-canvas'), c = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const input = document.createElement('input');
  input.className = 'pe-edit';
  input.value = access.get();
  input.spellcheck = false;
  const vertical = ref.axis === 'y';
  const h = vertical ? r.width : r.height;
  Object.assign(input.style, {
    left: r.left - c.left - 4 + 'px', top: (vertical ? r.top + r.height / 2 - h / 2 : r.top) - c.top - 3 + 'px',
    minWidth: Math.max(140, vertical ? r.height : r.width + 40) + 'px', fontSize: h * 0.85 + 'px',
    fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, fontFamily: cs.fontFamily, color: cs.fill,
  });
  el.style.visibility = 'hidden';
  canvas.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (keep: boolean) => {
    if (done) return;
    done = true;
    input.remove();
    el.style.visibility = '';
    if (keep && input.value !== access.get()) {
      access.set(input.value);
      setDirty(true);
      renderForm();
      schedulePreview();
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

/* ---- opening and closing ---- */

function open(spec: PlotSpec, name: string, asset: AssetEntry | null, dirty: boolean, gallery: boolean): void {
  if (!closePlotEditor() || !closeDataEditor()) return;
  Object.assign(pe, {
    spec, name, asset, dirty, gallery: false, open: spec.raw ? 'advanced' : null, panel: 0, json: !!spec.raw,
    root: project.root, layer: spec.panels[0]?.layers[0]?.id ?? null,
  });
  document.body.classList.add('plot-open');
  setFormatTarget('off');
  $('#plotEditor').hidden = false;
  $('#plotEditor').innerHTML = '<div class="pe-head"></div><div class="pe-main"><div class="pe-form"></div>' +
    '<div class="pe-preview"><div class="pe-gallery" hidden></div><div class="pe-errors"></div>' +
    '<button class="pe-addtitle" data-pa="add-title" hidden title="Give the plot a title">+ Title</button><div class="pe-canvas"></div>' +
    '<p class="muted pe-hint">Hover over the marks to see their data. Click an axis, a title or the legend to change it.</p></div></div>';
  renderHead();
  renderForm();
  showGallery(gallery);
}

/** A new plot of a table (the selected one, else the first): starts at the chart gallery. */
export function newPlot(dataName?: string): void {
  const t = tables();
  const name = dataName && t[dataName] ? dataName : Object.keys(t)[0];
  if (!name) { notify('Add a table in the Data sidebar first (Import… or New table)'); return; }
  const spec = defaultPlot(name, t[name]);
  spec.palette = [...paletteById(editor.doc.design.palette).colors]; // the poster's colour scheme
  open(spec, `${name} plot`, null, true, true);
}

export async function editPlot(a: AssetEntry): Promise<void> {
  try {
    open(await readPlot(a), a.name, a, false, false);
  } catch (err) {
    notify(`Could not open ${a.name}: ${(err as Error).message}`);
  }
}

export function closePlotEditor(force = false): boolean {
  if (!pe.spec) return true;
  if (!force && pe.dirty && !confirm(`Discard unsaved changes to the plot “${pe.name}”?`)) return false;
  pe.spec = null;
  pe.asset = null;
  pe.sel = pe.editNext = null;
  pe.drawNo++;
  document.body.classList.remove('plot-open');
  setFormatTarget(null);
  $('#plotEditor').hidden = true;
  $('#plotEditor').innerHTML = '';
  return true;
}

/** Keep up with the project: new data redraws; another project closes the editor. */
export function syncPlotEditor(): void {
  if (!pe.spec) return;
  if (project.root !== pe.root) { closePlotEditor(true); return; }
  if (pe.version !== workspace.version) {
    if (!$('#plotEditor .pe-form').contains(document.activeElement)) renderForm();
    else pe.version = workspace.version;
    if (pe.gallery) void drawGallery(); else schedulePreview();
  }
}

export function bindPlotEditor(): void {
  const el = $('#plotEditor');
  el.addEventListener('click', (e) => {
    const target = e.target as Element;
    const b = target.closest<HTMLElement>('[data-pa]');
    if (b && !target.closest('input, select')) { action(b.dataset.pa!, +(b.dataset.i ?? 0), b.dataset.v ?? ''); return; }
    if (target.closest('.pe-canvas') && !target.closest('.pe-edit')) {
      const ref = textRefOf(target);
      if (ref) { selectText(ref, EDITABLE.has(ref.role)); return; }
      deselectText();
      const cat = categoryAt(target);
      if (cat && pe.open !== cat) { pe.open = cat; renderForm(); }
    }
  });
  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.classList.contains('pe-name')) { pe.name = t.value; setDirty(true); return; }
    if (!t.dataset.k || t.tagName === 'SELECT' || t.type === 'checkbox') return;
    setPath(t.dataset.k, t);
    setDirty(true);
    schedulePreview();
  });
  el.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const k = t.dataset.k;
    if (!k || !pe.spec) return;
    if (k === 'add-layer') {
      const p = currentPanel(), prev = p.layers.find((l) => l.data);
      const l = newLayer(t.value as LayerKind, prev?.data ?? Object.keys(tables())[0] ?? '', prev?.x ?? '', prev?.y ?? '');
      if (!isDataLayer(l)) { l.data = ''; l.x = l.y = ''; }
      p.layers.push(l);
      pe.layer = l.id;
    } else {
      if (t.tagName !== 'SELECT' && (t as HTMLInputElement).type !== 'checkbox' && (t as HTMLInputElement).type !== 'color') return; // typed: done on input
      setPath(k, t);
    }
    setDirty(true);
    renderForm();
    if (pe.gallery) void drawGallery(); else schedulePreview();
  });
  // while it is open, keys belong to the editor (not the poster behind it)
  document.addEventListener('keydown', (e) => {
    if (!pe.spec || (e.target as Element).closest?.('.pe-edit')) return; // typing over a text: its box handles the keys
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    else if (e.key === 'Escape' && !document.querySelector('dialog[open], .popmenu, .colormenu')) {
      if (pe.sel) deselectText();
      else if (pe.gallery) showGallery(false);
      else closePlotEditor();
    }
    e.stopImmediatePropagation();
  }, true);
}
