/* Plots, built the way matplotlib / MATLAB figures are: a figure holds panels
   (subplots); each panel has an x and a y axis and a stack of layers —
   scatter, line, bar, area, histogram, error bars, reference lines and bands,
   text — drawn from tables in the data workspace. compilePlot() turns this
   into a Vega-Lite spec. Every data mark carries a hover description (its x, y,
   group and chosen extra columns), which ends up in the SVG as aria-label. */

import { uid } from '../util';
import type { Cell, Table } from './data';

export type LayerKind =
  | 'scatter' | 'line' | 'bar' | 'area' | 'hist' | 'errorbar' | 'hline' | 'vline' | 'hspan' | 'vspan' | 'text';

/** Keep only the rows whose `field` equals `value` (compared as text). */
export interface RowFilter {
  field: string;
  value: string;
}

export interface PlotLayer {
  id: string;
  kind: LayerKind;
  /** workspace name of the table */
  data: string;
  x: string;
  y: string;
  /** column that splits the layer into coloured groups ('' = one colour) */
  color: string;
  /** fixed colour when there are no groups ('' = first palette colour) */
  fill: string;
  /** ± error columns */
  xerr: string;
  yerr: string;
  /** interval columns: error bars from lo to hi, or an area between them */
  lo: string;
  hi: string;
  /** reference line / band position: numbers, or taken from a column (line: mean; band: min–max) */
  value: number | null;
  from: number | null;
  to: number | null;
  valueField: string;
  /** marker size / line width (pt) */
  size: number;
  opacity: number;
  dash: boolean;
  /** white ring around markers */
  outline: boolean;
  /** markers on lines */
  points: boolean;
  stack: boolean;
  bins: number;
  /** column with the text of text labels */
  text: string;
  /** extra columns shown when hovering over a mark */
  hover: string[];
  filter: RowFilter | null;
}

export interface PlotAxis {
  /** null = the column name */
  title: string | null;
  scale: 'linear' | 'log' | 'sqrt';
  min: number | null;
  max: number | null;
  grid: boolean;
  /** start the scale at zero */
  zero: boolean;
  /** colour category labels like the groups they belong to */
  colorLabels: boolean;
  /** leave a gap between the groups of categories (e.g. periodic rows, then cluster rows) */
  groupGap?: boolean;
}

export interface PlotPanel {
  id: string;
  title: string;
  subtitle: string;
  /** applied to every layer of the panel */
  filter: RowFilter | null;
  /** one panel per value of this column (small multiples, '' = one panel) */
  split: string;
  /** titles of the split panels, by value (default: the value) */
  splitTitles: Record<string, { title: string; subtitle: string }>;
  x: PlotAxis;
  y: PlotAxis;
  layers: PlotLayer[];
}

/** The texts of a plot, each styled as a whole (all panel titles alike, all axis titles alike …). */
export type TextRole = 'title' | 'subtitle' | 'panelTitle' | 'panelSubtitle' | 'axisTitle' | 'axisLabel' | 'legend';

export interface TextStyle {
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  /** pt */
  size?: number;
  color?: string;
  /** CSS font family */
  font?: string;
}

export interface PlotSpec {
  version: number;
  title: string;
  subtitle: string;
  /** size of one panel, mm */
  width: number;
  height: number;
  /** base font size, pt */
  font: number;
  fontFamily: string;
  /** panels per row */
  columns: number;
  legend: 'bottom' | 'right' | 'top' | 'none';
  /** frame around each panel */
  frame: boolean;
  palette: string[];
  panels: PlotPanel[];
  /** a hand-written Vega-Lite spec (replaces everything above); tables are available as named datasets */
  raw: Record<string, unknown> | null;
  /** the chart type it was made as (see CHART_TYPES) */
  chart: string;
  /** text styles that differ from the defaults */
  text: Partial<Record<TextRole, TextStyle>>;
}

export const LAYER_KINDS: { kind: LayerKind; label: string }[] = [
  { kind: 'scatter', label: 'Scatter (points)' },
  { kind: 'line', label: 'Line' },
  { kind: 'bar', label: 'Bar' },
  { kind: 'area', label: 'Area / fill between' },
  { kind: 'hist', label: 'Histogram' },
  { kind: 'errorbar', label: 'Error bars' },
  { kind: 'hline', label: 'Horizontal line' },
  { kind: 'vline', label: 'Vertical line' },
  { kind: 'hspan', label: 'Horizontal band' },
  { kind: 'vspan', label: 'Vertical band' },
  { kind: 'text', label: 'Text labels' },
];

/** Paul Tol's "bright" scheme: distinct, and readable for colour-blind viewers. */
export const PALETTE = ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB'];

const PX_PER_MM = 96 / 25.4;
const PX_PER_PT = 96 / 72;

export const newAxis = (): PlotAxis =>
  ({ title: null, scale: 'linear', min: null, max: null, grid: true, zero: false, colorLabels: false });

export function newLayer(kind: LayerKind, data = '', x = '', y = ''): PlotLayer {
  return {
    id: uid(), kind, data, x, y, color: '', xerr: '', yerr: '', lo: '', hi: '',
    fill: kind === 'hline' || kind === 'vline' ? '#222222' : kind === 'hspan' || kind === 'vspan' ? '#c7d3e3' : '',
    value: null, from: null, to: null, valueField: '',
    size: kind === 'line' ? 2 : 8, opacity: kind === 'area' ? 0.3 : kind === 'hspan' || kind === 'vspan' ? 0.5 : 1,
    dash: kind === 'hline' || kind === 'vline', outline: kind === 'scatter', points: false, stack: kind === 'hist',
    bins: 20, text: '', hover: [], filter: null,
  };
}

export const newPanel = (layers: PlotLayer[] = []): PlotPanel =>
  ({ id: uid(), title: '', subtitle: '', filter: null, split: '', splitTitles: {}, x: newAxis(), y: newAxis(), layers });

export const newPlot = (panels: PlotPanel[] = [newPanel()]): PlotSpec => ({
  version: 1, title: '', subtitle: '', width: 160, height: 100, font: 16, fontFamily: '"TeX Gyre Heros", Helvetica, Arial, sans-serif',
  columns: 4, legend: 'bottom', frame: false, palette: [...PALETTE], panels, raw: null, chart: '', text: {},
});

/** Titles and subtitles share their alignment: a subtitle's style lives with its title. */
export const alignRole = (role: TextRole): TextRole =>
  role === 'subtitle' ? 'title' : role === 'panelSubtitle' ? 'panelTitle' : role;

/** The panels as drawn: each panel, or one per value when it is split. */
export function panelList(spec: PlotSpec, tables: Record<string, Table>): { panel: number; value: string | null }[] {
  return spec.panels.flatMap((p, i): { panel: number; value: string | null }[] =>
    p.split ? valuesOf(p, p.split, tables).map((value) => ({ panel: i, value })) : [{ panel: i, value: null }]);
}

/** Complete a saved plot (older or hand-edited files get missing fields). */
export function loadPlot(raw: unknown): PlotSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PlotSpec>;
  const base = newPlot([]);
  const axis = (a?: Partial<PlotAxis>): PlotAxis => ({ ...newAxis(), ...a });
  const panels = (Array.isArray(r.panels) ? r.panels : []).map((p) => ({
    ...newPanel(), ...p, x: axis(p.x), y: axis(p.y),
    layers: (Array.isArray(p.layers) ? p.layers : []).map((l) => ({ ...newLayer(l.kind || 'scatter'), ...l })),
  }));
  return { ...base, ...r, panels: panels.length || r.raw ? panels : [newPanel()], raw: r.raw ?? null, text: { ...r.text } };
}

/* ---- table helpers ---- */

type Row = Record<string, Cell>;

const records = (t: Table): Row[] => t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));

/** True if a column holds numbers (and nothing but numbers and blanks). */
export function isNumeric(t: Table, col: string): boolean {
  const i = t.columns.indexOf(col);
  if (i < 0) return false;
  const vals = t.rows.map((r) => r[i]).filter((v) => v !== null);
  return vals.length > 0 && vals.every((v) => typeof v === 'number');
}

/** True if a row passes a filter. A table without the filter's column is not filtered. */
const matches = (row: Row, f: RowFilter | null): boolean =>
  !f || !f.field || !(f.field in row) || String(row[f.field] ?? '') === f.value;

/** The values of `col` across the tables of a panel's layers, in order of appearance. */
export function valuesOf(p: PlotPanel, col: string, tables: Record<string, Table>): string[] {
  const values: string[] = [];
  for (const l of p.layers) {
    const t = tables[l.data];
    if (!t || !t.columns.includes(col)) continue;
    for (const r of records(t)) {
      const v = String(r[col] ?? '');
      if (matches(r, p.filter) && !values.includes(v)) values.push(v);
    }
  }
  return values;
}

/* ---- chart types: quick starting points ---- */

export const CHART_TYPES: { id: string; label: string; hint: string }[] = [
  { id: 'scatter', label: 'Scatter', hint: 'Points: one number against another' },
  { id: 'line', label: 'Line', hint: 'Values joined in order — e.g. over time or size' },
  { id: 'bar', label: 'Bars', hint: 'One value per category' },
  { id: 'grouped', label: 'Grouped bars', hint: 'Bars side by side, one per group' },
  { id: 'stacked', label: 'Stacked bars', hint: 'Groups stacked into one bar' },
  { id: 'hist', label: 'Histogram', hint: 'How the values are spread' },
  { id: 'area', label: 'Area', hint: 'Filled areas, stacked by group' },
  { id: 'dots', label: 'Dots ± error', hint: 'A value ± error per row, coloured by group — like a forest plot' },
  { id: 'band', label: 'Line ± band', hint: 'A line with a shaded ± error band' },
];

const DATA_LAYER_KINDS: LayerKind[] = ['scatter', 'line', 'bar', 'area', 'hist', 'errorbar', 'text'];
export const isDataLayer = (l: PlotLayer): boolean => DATA_LAYER_KINDS.includes(l.kind);

/** The layer the quick settings change: the last layer drawn from data in the first panel. */
export const mainLayer = (spec: PlotSpec): PlotLayer | undefined => spec.panels[0]?.layers.filter(isDataLayer).at(-1);

const ERR_NAME = /^(err|error|errors|sd|std|stdev|se|sem|stderr|uncertainty|ci)$|[_ ](err|error|sd|std|se|sem)$/i;

/** Make the plot a chart of `type` from table `t`, keeping the columns it already uses where they fit. */
export function applyChartType(spec: PlotSpec, type: string, dataName: string, t: Table): void {
  const p = spec.panels[0] ?? (spec.panels[0] = newPanel());
  const old = mainLayer(spec);
  const distinct = (c: string) => new Set(t.rows.map((r) => r[t.columns.indexOf(c)])).size;
  const nums = t.columns.filter((c) => isNumeric(t, c));
  const err = nums.find((c) => ERR_NAME.test(c)) ?? '';
  const values = nums.filter((c) => c !== err);
  // free text (notes, sources …) is for hovering, not for axes or groups
  const avgLength = (c: string) => {
    const vals = t.rows.map((r) => r[t.columns.indexOf(c)]).filter((v) => v !== null).map(String);
    return vals.reduce((n, v) => n + v.length, 0) / Math.max(1, vals.length);
  };
  const freeText = t.columns.filter((c) => !isNumeric(t, c) && (/note|comment|desc|remark|source|ref|info/i.test(c) || avgLength(c) > 24));
  const texts = t.columns.filter((c) => !isNumeric(t, c) && !freeText.includes(c));
  const groups = texts.filter((c) => distinct(c) >= 2 && distinct(c) <= 10).sort((a, b) => distinct(a) - distinct(b));
  const same = old?.data === dataName;
  const pick = (pref: string | undefined, from: string[], not: string[] = []): string =>
    (same && pref && from.includes(pref) && !not.includes(pref) ? pref : from.find((c) => !not.includes(c))) ?? '';

  const layer = (kind: LayerKind, x: string, y: string, extra: Partial<PlotLayer> = {}): PlotLayer =>
    ({ ...newLayer(kind, dataName, x, y), hover: same ? old!.hover.filter((c) => t.columns.includes(c)) : freeText, ...extra });
  let data: PlotLayer[];
  const xNum = () => pick(old?.x, values), yNum = (x: string) => pick(old?.y, values, [x]);
  switch (type) {
    case 'line': case 'scatter': case 'area': {
      const x = xNum(), y = yNum(x), color = pick(old?.color, groups);
      data = [layer(type === 'area' ? 'area' : type as LayerKind, x, y, { color, points: true, stack: true, opacity: type === 'area' ? 0.7 : 1 })];
      break;
    }
    case 'bar': case 'grouped': case 'stacked': {
      const grouped = type !== 'bar';
      const color = grouped ? pick(old?.color, groups) : '';
      // bars stand on a category and show a value: keep those, whichever axis they were on
      const cat = [old?.x, old?.y].find((c) => c && texts.includes(c)), val = [old?.y, old?.x].find((c) => c && values.includes(c));
      const x = pick(cat, [...texts, ...values], [color]), y = pick(val, values, [x]);
      data = [layer('bar', x, y, { color, stack: type === 'stacked', yerr: type === 'bar' ? err : '' })];
      break;
    }
    case 'hist': data = [layer('hist', xNum(), '', { color: pick(old?.color, groups), opacity: 0.85 })]; break;
    case 'band': {
      const x = xNum(), y = yNum(x), color = pick(old?.color, groups);
      data = [layer('area', x, y, { color, yerr: err, opacity: 0.25 }), layer('line', x, y, { color, points: true })];
      break;
    }
    default: { // dots ± error: categories down the side, value along, coloured by group
      const label = [...texts].sort((a, b) => distinct(b) - distinct(a))[0] ?? values[1] ?? '';
      // the colour is a property of the label (PBE-D3 is always Periodic); a column it doesn't decide splits the panels
      const li = t.columns.indexOf(label);
      const decided = (c: string) => {
        const ci = t.columns.indexOf(c), seen = new Map<unknown, unknown>();
        return t.rows.every((r) => (seen.has(r[li]) ? seen.get(r[li]) === r[ci] : (seen.set(r[li], r[ci]), true)));
      };
      const color = pick(old?.color, groups.filter(decided), [label]);
      const x = pick(old?.x, values);
      data = [layer('scatter', x, label, { color, xerr: err, outline: true, size: 9 })];
      if (!p.split) p.split = groups.find((c) => c !== label && c !== color && !decided(c) && distinct(c) <= 8) ?? '';
      p.y = { ...p.y, colorLabels: !!color, groupGap: !!color, grid: false, title: '' };
      p.x = { ...p.x, grid: true };
    }
  }
  if (type !== 'dots' && spec.chart === 'dots') p.y = { ...p.y, colorLabels: false, groupGap: false, grid: true, title: null };
  // panels side by side: smaller panels, so the whole figure stays a sensible size
  if (p.split && spec.width === 160 && spec.height === 100) { spec.width = 80; spec.height = 60; }
  p.layers = [...p.layers.filter((l) => !isDataLayer(l)), ...data];
  spec.chart = type;
}

/** The chart type to start a table with. */
export function guessChartType(t: Table): string {
  const nums = t.columns.filter((c) => isNumeric(t, c)), texts = t.columns.filter((c) => !isNumeric(t, c));
  if (nums.some((c) => ERR_NAME.test(c)) && texts.length) return 'dots';
  return texts.length && nums.length ? 'bar' : nums.length >= 2 ? 'scatter' : 'hist';
}

/** A first plot for a table. */
export function defaultPlot(dataName: string, t: Table, type = guessChartType(t)): PlotSpec {
  const spec = newPlot();
  applyChartType(spec, type, dataName, t);
  return spec;
}

/** Copy a panel once per value of `field` (small multiples), each showing only its rows. */
export function splitPanel(spec: PlotSpec, panelId: string, field: string, tables: Record<string, Table>): void {
  const i = spec.panels.findIndex((p) => p.id === panelId);
  const p = spec.panels[i];
  if (!p) return;
  const values = valuesOf(p, field, tables);
  if (!values.length) return;
  const copies = values.map((v): PlotPanel => {
    const c = JSON.parse(JSON.stringify(p)) as PlotPanel;
    return { ...c, id: uid(), title: v, filter: { field, value: v }, layers: c.layers.map((l) => ({ ...l, id: uid() })) };
  });
  spec.panels.splice(i, 1, ...copies);
}

/* ---- compiling to Vega-Lite ---- */

type Json = Record<string, unknown>;

/** A column name as a Vega-Lite field (dots and brackets escaped). */
const field = (c: string): string => c.replace(/[.[\]\\]/g, (m) => '\\' + m);
/** A Vega expression for row value `c`. */
const datum = (c: string): string => `datum[${JSON.stringify(c)}]`;

export interface Compiled {
  vl: Json;
  errors: string[];
}

export function compilePlot(spec: PlotSpec, tables: Record<string, Table>): Compiled {
  const errors: string[] = [];
  const datasets: Record<string, Row[]> = {};
  for (const [name, t] of Object.entries(tables)) datasets[name] = records(t);

  const font = spec.font * PX_PER_PT;
  // text styles: the defaults, unless a role has its own
  const ts = (role: TextRole): TextStyle => spec.text?.[role] ?? {};
  const size = (role: TextRole, base: number) => (ts(role).size ? ts(role).size! * PX_PER_PT : base);
  const weight = (role: TextRole, base: string) => (ts(role).bold === undefined ? base : ts(role).bold ? 'bold' : 'normal');
  const slant = (role: TextRole) => (ts(role).italic ? 'italic' : 'normal');
  const ANCHOR: Record<string, string> = { left: 'start', center: 'middle', right: 'end' };
  const anchor = (role: TextRole, base?: string) => ANCHOR[ts(role).align ?? ''] ?? base;
  const labelColor = ts('axisLabel').color ?? '#333';
  const titleStyle = (t: TextRole, s: TextRole, base: number, bold: string, subColor: string): Json => ({
    fontSize: size(t, base), fontWeight: weight(t, bold), fontStyle: slant(t), color: ts(t).color ?? '#111', font: ts(t).font,
    anchor: anchor(t, 'start'),
    subtitleFontSize: size(s, base * 0.75), subtitleFontWeight: weight(s, 'normal'), subtitleFontStyle: slant(s),
    subtitleColor: ts(s).color ?? subColor, subtitleFont: ts(s).font,
  });
  const config: Json = {
    font: spec.fontFamily,
    view: { stroke: spec.frame ? '#888' : null },
    axis: {
      aria: false, labelOverlap: 'greedy',
      labelFontSize: size('axisLabel', font * 0.8), labelFontWeight: weight('axisLabel', 'normal'), labelFontStyle: slant('axisLabel'),
      labelColor, labelFont: ts('axisLabel').font,
      titleFontSize: size('axisTitle', font * 0.85), titleFontWeight: weight('axisTitle', 'normal'), titleFontStyle: slant('axisTitle'),
      titleColor: ts('axisTitle').color ?? '#222', titleFont: ts('axisTitle').font, titleAnchor: anchor('axisTitle'),
    },
    axisX: { labelAngle: 0 },
    legend: {
      aria: false, symbolSize: font * font * 0.6, titleFontSize: font * 0.85,
      labelFontSize: size('legend', font * 0.8), labelFontWeight: weight('legend', 'normal'), labelFontStyle: slant('legend'),
      labelColor: ts('legend').color ?? '#222', labelFont: ts('legend').font,
    },
    title: { ...titleStyle('panelTitle', 'panelSubtitle', font * 1.05, 'bold', '#555'), offset: font * 0.5, aria: false },
    header: { labelFontSize: font * 0.85 },
    text: { fontSize: font * 0.8 },
  };

  if (spec.raw) return { vl: { config, ...spec.raw, datasets: { ...datasets, ...(spec.raw.datasets as Json || {}) } }, errors };

  // "one panel per value": a copy of the panel for each value, showing only its rows
  type Panel = PlotPanel & { part?: RowFilter };
  const expanded: Panel[] = panelList(spec, tables).map(({ panel, value: v }): Panel => {
    const p = spec.panels[panel];
    if (v === null) return p;
    return { ...p, title: p.splitTitles[v]?.title || v, subtitle: p.splitTitles[v]?.subtitle ?? '', part: { field: p.split, value: v } };
  });
  const rowOk = (r: Row, p: Panel, l: PlotLayer) => matches(r, p.filter) && matches(r, p.part ?? null) && matches(r, l.filter);

  // one colour scale per grouping column, the same in every panel
  const domains: Record<string, string[]> = {};
  for (const p of expanded) {
    for (const l of p.layers) {
      const t = tables[l.data];
      if (!l.color || !t || !t.columns.includes(l.color)) continue;
      const d = (domains[l.color] ??= []);
      for (const r of records(t)) {
        const v = String(r[l.color] ?? '');
        if (rowOk(r, p, l) && !d.includes(v)) d.push(v);
      }
    }
  }
  const palette = spec.palette.length ? spec.palette : PALETTE;
  const colorOf = (col: string, v: string) => palette[Math.max(0, domains[col].indexOf(v)) % palette.length];

  const panels = expanded.map((p) => compilePanel(p));
  const top: Json = panels.length === 1 && !spec.title ? panels[0] : {
    concat: panels, columns: Math.max(1, spec.columns), spacing: font * 2,
    resolve: { scale: { color: 'shared' } },
  };
  const title = spec.title
    ? { title: { text: spec.title, subtitle: spec.subtitle || undefined, ...titleStyle('title', 'subtitle', font * 1.3, 'bold', '#444'), aria: false } }
    : {};
  return { vl: { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', background: null, config, datasets, ...title, ...top }, errors };

  function compilePanel(p: Panel): Json {
    const layers = p.layers.flatMap((l) => compileLayer(p, l));
    const out: Json = {
      width: spec.width * PX_PER_MM, height: spec.height * PX_PER_MM,
      layer: layers.length ? layers : [{ data: { values: [{}] }, mark: { type: 'point', opacity: 0 } }],
    };
    if (p.title || p.subtitle) out.title = { text: p.title || ' ', subtitle: p.subtitle || undefined, aria: false };
    return out;
  }

  /** Axis type for a column: numbers are quantitative, anything else is a category. */
  function typeOf(t: Table, col: string): 'quantitative' | 'nominal' {
    return isNumeric(t, col) ? 'quantitative' : 'nominal';
  }

  function axisEnc(p: PlotPanel, which: 'x' | 'y', t: Table | undefined, col: string, title?: string): Json {
    const a = p[which];
    const type = t && col ? typeOf(t, col) : 'quantitative';
    const enc: Json = { type, title: a.title ?? title ?? col, axis: { grid: a.grid } };
    if (col) enc.field = field(col);
    if (type === 'nominal') {
      enc.sort = null;
      if (a.colorLabels) {
        const expr = labelColors(p, col);
        if (expr) (enc.axis as Json).labelColor = { expr };
      }
      if (a.groupGap) {
        const domain = groupedDomain(p, col);
        if (domain) { enc.scale = { domain }; (enc.axis as Json).ticks = false; }
      }
    } else {
      // about one tick per few labels' room, so labels don't run into each other
      const room = which === 'x' ? spec.width * PX_PER_MM / (font * 4) : spec.height * PX_PER_MM / (font * 2.2);
      (enc.axis as Json).tickCount = Math.max(2, Math.round(room));
      const scale: Json = { type: a.scale, zero: a.zero };
      if (a.min !== null) scale.domainMin = a.min;
      if (a.max !== null) scale.domainMax = a.max;
      if (a.min !== null || a.max !== null) scale.nice = false;
      enc.scale = scale;
    }
    return enc;
  }

  /** The categories in order, group by group, with an empty slot between groups (a gap on the axis). */
  function groupedDomain(p: Panel, col: string): string[] | null {
    const byGroup = new Map<string, string[]>();
    for (const l of p.layers) {
      const t = tables[l.data];
      if (!t || !l.color || !t.columns.includes(col)) continue;
      for (const r of records(t)) {
        if (!rowOk(r, p, l)) continue;
        const g = String(r[l.color] ?? ''), cat = String(r[col] ?? '');
        const list = byGroup.get(g) ?? (byGroup.set(g, []), byGroup.get(g)!);
        if (!list.includes(cat)) list.push(cat);
      }
    }
    if (byGroup.size < 2) return null;
    return [...byGroup.values()].flatMap((cats, i) => (i ? ['\u2063'.repeat(i), ...cats] : cats));
  }

  /** A Vega expression colouring category labels by the group of their rows. */
  function labelColors(p: Panel, col: string): string | null {
    const pairs = new Map<string, string>();
    for (const l of p.layers) {
      const t = tables[l.data];
      if (!t || !l.color || !t.columns.includes(col)) continue;
      for (const r of records(t)) {
        if (!rowOk(r, p, l)) continue;
        const cat = String(r[col] ?? '');
        if (!pairs.has(cat)) pairs.set(cat, colorOf(l.color, String(r[l.color] ?? '')));
      }
    }
    if (!pairs.size) return null;
    return [...pairs].map(([cat, c]) => `datum.value === ${JSON.stringify(cat)} ? ${JSON.stringify(c)} : `).join('') + JSON.stringify(labelColor);
  }

  /** The mark colour: by group, or one fixed colour. */
  function colorEnc(l: PlotLayer): { enc: Json; fixed: string | null } {
    if (l.color && domains[l.color]) {
      const legend = spec.legend === 'none' ? null : { orient: spec.legend, title: null };
      return { enc: { color: { field: field(l.color), type: 'nominal', scale: { domain: domains[l.color], range: palette }, legend } }, fixed: null };
    }
    return { enc: {}, fixed: l.fill || palette[0] };
  }

  /** Rows a layer uses, as Vega-Lite data + filter transforms. */
  function source(p: Panel, l: PlotLayer): Json[] {
    const out: Json[] = [];
    const cols = tables[l.data]?.columns ?? [];
    for (const f of [p.filter, p.part ?? null, l.filter]) {
      if (f && f.field && cols.includes(f.field)) out.push({ filter: `toString(${datum(f.field)}) === ${JSON.stringify(f.value)}` });
    }
    return out;
  }

  /** The hover text of a mark: one "column: value" line per column that has a value. */
  function hoverTransform(cols: string[]): Json {
    const unique = [...new Set(cols.filter(Boolean))];
    const line = (c: string) => `(isValid(${datum(c)}) && ${datum(c)} !== '' ? ${JSON.stringify(c + ': ')} + ${datum(c)} + "\\n" : '')`;
    return { calculate: unique.length ? `trim(${unique.map(line).join(' + ')})` : "''", as: '__hover' };
  }

  /** Rows of a layer's table after the panel and layer filters (for values worked out here). */
  function rowsOf(p: Panel, l: PlotLayer, t: Table): Row[] {
    return records(t).filter((r) => rowOk(r, p, l));
  }

  function numbersOf(p: Panel, l: PlotLayer, t: Table | undefined, col: string): number[] {
    if (!t || !col) return [];
    return rowsOf(p, l, t).map((r) => r[col]).filter((v): v is number => typeof v === 'number');
  }

  function compileLayer(p: Panel, l: PlotLayer): Json[] {
    const t = tables[l.data];
    const ref = l.kind === 'hline' || l.kind === 'vline' || l.kind === 'hspan' || l.kind === 'vspan';
    if (!ref && !t) { errors.push(l.data ? `No data called “${l.data}”` : 'A layer has no data chosen'); return []; }
    if (t) {
      for (const c of [l.x, l.y, l.color, l.xerr, l.yerr, l.lo, l.hi, l.text, l.valueField, ...l.hover]) {
        if (c && !t.columns.includes(c)) { errors.push(`“${l.data}” has no column “${c}”`); return []; }
      }
    }
    const { enc: color, fixed } = colorEnc(l);
    const size = l.size * PX_PER_PT;
    const stroke = fixed ?? undefined;

    if (ref) {
      // reference lines and bands: numbers given, or worked out from a column
      const vals = numbersOf(p, l, t, l.valueField);
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const ch = l.kind === 'hline' || l.kind === 'hspan' ? 'y' : 'x';
      const mark: Json = { color: fixed, opacity: l.opacity, aria: false };
      if (l.kind === 'hline' || l.kind === 'vline') {
        const v = l.valueField ? mean : l.value;
        if (v === null) return [];
        return [{ data: { values: [{}] }, mark: { type: 'rule', ...mark, strokeWidth: size / 4, strokeDash: l.dash ? [size, size * 0.7] : undefined }, encoding: { [ch]: { datum: v } } }];
      }
      const from = l.valueField ? (vals.length ? Math.min(...vals) : null) : l.from;
      const to = l.valueField ? (vals.length ? Math.max(...vals) : null) : l.to;
      if (from === null || to === null) return [];
      return [{ data: { values: [{}] }, mark: { type: 'rect', ...mark }, encoding: { [ch]: { datum: from }, [ch + '2']: { datum: to } } }];
    }

    const data = { data: { name: l.data }, transform: source(p, l) };
    const tbl = t!;
    const x = axisEnc(p, 'x', tbl, l.x), y = axisEnc(p, 'y', tbl, l.y);
    // hover text: categories first (the row's name), then values, group, errors and extra columns
    const axes = [l.x, l.y].sort((a, b) => Number(isNumeric(tbl, a)) - Number(isNumeric(tbl, b)));
    const hover = hoverTransform([...axes, l.color, l.xerr, l.yerr, l.lo, l.hi, l.text, ...l.hover]);
    const described = (d: Json): Json => ({ ...d, transform: [...(d.transform as Json[]), hover] });
    const description = { description: { field: '__hover' } };
    const out: Json[] = [];

    // error bars (± columns or lo–hi columns) under points, lines and bars
    const errLayer = (): Json | null => {
      const xv = x.type === 'quantitative', yv = y.type === 'quantitative';
      let lo: string | null = null, hi: string | null = null, ch: 'x' | 'y' | null = null;
      if (l.lo && l.hi) { ch = yv && (!xv || l.kind === 'bar') ? 'y' : 'x'; lo = datum(l.lo); hi = datum(l.hi); }
      else if (l.xerr && xv) { ch = 'x'; lo = `${datum(l.x)} - ${datum(l.xerr)}`; hi = `${datum(l.x)} + ${datum(l.xerr)}`; }
      else if (l.yerr && yv) { ch = 'y'; lo = `${datum(l.y)} - ${datum(l.yerr)}`; hi = `${datum(l.y)} + ${datum(l.yerr)}`; }
      if (!ch) return null;
      const axis = ch === 'x' ? x : y, other = ch === 'x' ? y : x;
      return {
        ...data, transform: [...(data.transform as Json[]), { calculate: lo, as: '__lo' }, { calculate: hi, as: '__hi' }],
        mark: { type: 'rule', strokeWidth: Math.max(1, size * (l.kind === 'errorbar' ? 0.25 : 0.4)), strokeCap: 'round', color: stroke, opacity: 0.85 * l.opacity, aria: false },
        encoding: { [ch]: { ...axis, field: '__lo' }, [ch + '2']: { field: '__hi' }, [ch === 'x' ? 'y' : 'x']: other, ...color },
      };
    };

    switch (l.kind) {
      case 'scatter': {
        const err = errLayer();
        if (err) out.push(err);
        out.push(described({
          ...data,
          mark: { type: 'point', filled: true, size: size * size, opacity: l.opacity, color: stroke, stroke: l.outline ? 'white' : undefined, strokeWidth: l.outline ? Math.max(1, size / 6) : undefined },
          encoding: { x, y, ...color, ...description },
        }));
        break;
      }
      case 'line': {
        const err = errLayer();
        if (err) out.push(err);
        out.push({
          ...data, mark: { type: 'line', strokeWidth: size, color: stroke, opacity: l.opacity, strokeDash: l.dash ? [size * 3, size * 2] : undefined, aria: false },
          encoding: { x, y, ...color },
        });
        // markers: shown, or invisible but still there to hover over
        out.push(described({
          ...data, mark: { type: 'point', filled: true, size: Math.max(size * 3, 6) ** 2, color: stroke, opacity: l.points ? l.opacity : 0 },
          encoding: { x, y, ...color, ...description },
        }));
        break;
      }
      case 'bar': {
        const horizontal = y.type === 'nominal' && x.type === 'quantitative';
        // bars stand on categories: numbers there (1, 2, 3 …) become ordered categories, so groups sit side by side
        const cat = horizontal ? y : x;
        if (cat.type === 'quantitative') { cat.type = 'ordinal'; delete cat.scale; }
        if (!l.stack) (horizontal ? x : y).stack = null;
        const offset = l.color && !l.stack ? { [horizontal ? 'yOffset' : 'xOffset']: { field: field(l.color), sort: domains[l.color] } } : {};
        out.push(described({ ...data, mark: { type: 'bar', color: stroke, opacity: l.opacity }, encoding: { x, y, ...color, ...offset, ...description } }));
        const err = errLayer();
        if (err) out.push({ ...err, encoding: { ...(err.encoding as Json), ...offset } });
        break;
      }
      case 'area': {
        const enc: Json = { x, y, ...color };
        let src: Json = data;
        if (l.lo && l.hi) { enc.y = { ...y, field: field(l.lo) }; enc.y2 = { field: field(l.hi) }; }
        else if (l.yerr) { // a band of ± error around y
          src = { ...data, transform: [...(data.transform as Json[]), { calculate: `${datum(l.y)} - ${datum(l.yerr)}`, as: '__lo' }, { calculate: `${datum(l.y)} + ${datum(l.yerr)}`, as: '__hi' }] };
          enc.y = { ...y, field: '__lo' };
          enc.y2 = { field: '__hi' };
        } else if (!l.stack) (enc.y as Json).stack = null;
        out.push({ ...src, mark: { type: 'area', color: stroke, opacity: l.opacity, aria: false, line: false }, encoding: enc });
        break;
      }
      case 'hist': {
        const hx = { ...x, type: 'quantitative', bin: { maxbins: l.bins }, scale: undefined };
        const hy = { type: 'quantitative', aggregate: 'count', title: p.y.title ?? 'Count', scale: (y.scale as Json) ?? { type: p.y.scale }, stack: l.stack ? 'zero' : null, axis: { grid: p.y.grid } };
        out.push({
          ...data, mark: { type: 'bar', color: stroke, opacity: l.opacity, binSpacing: 1 },
          encoding: { x: hx, y: hy, ...color },
        });
        break;
      }
      case 'errorbar': {
        const err = errLayer();
        if (err) out.push(err);
        else errors.push('Error bars need a ± column (x / y error) or lo and hi columns');
        break;
      }
      case 'text': {
        out.push(described({
          ...data, mark: { type: 'text', color: stroke ?? '#333', fontSize: size * 1.6, dy: -size * 1.2, opacity: l.opacity },
          encoding: { x, y, text: { field: field(l.text || l.y) }, ...color, ...description },
        }));
        break;
      }
    }
    return out;
  }
}

/** Finish a plot's SVG: hover text stays on data marks only (titles get their own from Vega). */
export const finishSvg = (svg: string): string =>
  svg.replace(/<g [^>]*aria-roledescription="title"[^>]*>/g, (tag) => tag.replace(/ aria-label="[^"]*"/, ''));
