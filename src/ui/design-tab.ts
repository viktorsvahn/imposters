/* The Design panel: the settings of the element picked on the master poster, grouped as Global (poster level),
   Local (inside tiles) and Text & colour (shared by both). */

import { commit } from '../editor/history';
import { render } from '../editor/hooks';
import { editor } from '../editor/store';
import { setPaperGutter } from '../layout/paper';
import type { MasterKey } from '../layout/specimen';
import { defaultDesign, FONT_LIST, isBaseStyle, newTextStyle, ROLES, styleById, WEIGHTS } from '../model/design';
import { PALETTES, paletteById } from '../model/palettes';
import type { BorderKind, ColorRoleId, TextStyle } from '../model/types';
import { project } from '../project/session';
import { escapeHtml, uid } from '../util';
import { $, $$ } from '../view/dom';
import { attachSwatches } from '../view/design-css';
import { fontOptions, localFamilies } from '../view/fonts';
import { masterVisible, renderMaster, setMasterPick, showMaster } from './master';

type Group = 'global' | 'local' | 'shared';

let picked: MasterKey = 'paper';

const GROUPS: { id: Group; label: string; title: string }[] = [
  { id: 'global', label: 'Global', title: 'The poster as a whole: paper, margins, banner, footer, its tiles, watermark and logos' },
  { id: 'local', label: 'Local', title: 'Inside tiles: tiles in a tile, tile headers and footers' },
  { id: 'shared', label: 'Text & colour', title: 'Fonts, text styles, palette and tables, used everywhere' },
];

function elementsOf(g: Group): [MasterKey, string][] {
  if (g === 'global') return [['paper', 'Paper & spacing'], ['watermark', 'Watermark'], ['banner', 'Banner & logo'], ['footer', 'Footer & logos'], ['tiles', "The poster's tiles"]];
  if (g === 'local') return [['local', 'Tiles inside tiles'], ['tileHeader', 'Tile headers'], ['tileFooter', 'Tile footers']];
  return [['fonts', 'Fonts'], ['palette', 'Palette'], ['table', 'Tables'],
    ...editor.doc.design.styles.map((s) => [`style:${s.id}`, s.name] as [MasterKey, string])];
}

const groupOf = (k: MasterKey): Group =>
  (['local', 'tileHeader', 'tileFooter'].includes(k) ? 'local' : k.startsWith('style:') || ['fonts', 'palette', 'table'].includes(k) ? 'shared' : 'global');

/* ---- building blocks ---- */

const SIDES: [string, string][] = [['trbl', 'all sides'], ['b', 'bottom'], ['t', 'top'], ['tb', 'top & bottom'], ['lr', 'left & right'], ['l', 'left'], ['r', 'right']];

const num = (k: string, v: number, step: string, attrs = ''): string =>
  `<input type="number" data-k="${k}" min="0" step="${step}" value="${v}"${attrs}>`;
const field = (label: string, control: string, title = ''): string =>
  `<label class="dfield"${title ? ` title="${escapeHtml(title)}"` : ''}><span>${label}</span>${control}</label>`;
const select = (k: string, v: string, opts: [string, string][]): string =>
  `<select data-k="${k}">${opts.map(([o, l]) => `<option value="${escapeHtml(o)}"${o === v ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;
const h = (text: string): string => `<h4 class="dh">${text}</h4>`;
const note = (text: string): string => `<p class="muted">${text}</p>`;

function images(): [string, string][] {
  return (project.manifest?.assets ?? []).filter((a) => a.kind === 'image').map((a) => [a.src, a.name] as [string, string]);
}
const imageSelect = (k: string, v: string, none = 'None'): string => select(k, v, [['', none], ...images()]);

function borderRow(kind: BorderKind): string {
  const b = editor.doc.design.borders[kind];
  const sides = SIDES.some(([v]) => v === b.sides) ? SIDES : [...SIDES, [b.sides, b.sides] as [string, string]];
  return `<div class="border-row" data-border="${kind}"><span class="role-name">Border</span>` +
    `<label title="Width (mm), 0 = none">mm<input type="number" data-k="w" min="0" step="0.25" value="${b.w}"></label>` +
    `<input type="color" data-k="c" value="${/^#/.test(b.c) ? b.c : '#1a1a1a'}" title="Colour">` +
    `<select data-k="sides" title="Sides">${sides.map(([v, l]) => `<option value="${v}"${v === b.sides ? ' selected' : ''}>${l}</option>`).join('')}</select>` +
    `<label title="Rounded corners (mm)">◜<input type="number" data-k="radius" min="0" step="1" value="${b.radius}"></label></div>`;
}

function roleRow(id: ColorRoleId): string {
  const r = ROLES.find((x) => x.id === id)!, c = editor.doc.design.colors[id];
  return `<div class="role role-head"><span></span><span>Fill</span><span></span><span>${r.textless ? '' : 'Text'}</span><span></span></div>` +
    `<div class="role" data-role="${id}"><span class="role-name">Colours</span>
      <label title="Background"><input type="color" data-k="bg" value="${c.bg || '#ffffff'}"${c.bg ? '' : ' class="off"'}></label>
      <label class="check mini"><input type="checkbox" data-k="bgNone"${c.bg ? '' : ' checked'}> none</label>
      ${r.textless ? '<span></span><span></span>' : `
      <label title="Text colour"><input type="color" data-k="text" value="${c.text || '#1a1a1a'}"${c.text ? '' : ' class="off"'}></label>
      <label class="check mini"><input type="checkbox" data-k="textAuto"${c.text ? '' : ' checked'}> auto</label>`}
    </div>`;
}

function spaceRow(kind: 'text' | 'header', label: string): string {
  const s = editor.doc.design.space[kind];
  return `<div class="row"><span class="space-kind">${label}</span>` +
    `<label>left/right<input type="number" data-k="space" data-kind="${kind}" data-ax="x" min="0" step="0.5" value="${s.x}"></label>` +
    `<label>top/bottom<input type="number" data-k="space" data-kind="${kind}" data-ax="y" min="0" step="0.5" value="${s.y}"></label></div>`;
}

function gapRow(k: 'gutterGlobal' | 'gutterLocal', x: number, y: number, step: string): string {
  return `<div class="row"><label>↔ across<input type="number" data-k="${k}" data-ax="x" min="0" step="${step}" value="${x}"></label>` +
    `<label>↕ down<input type="number" data-k="${k}" data-ax="y" min="0" step="${step}" value="${y}"></label></div>`;
}

function styleCard(s: TextStyle): string {
  return `
    <div class="style-card${s.enabled ? '' : ' disabled'}" data-style="${s.id}">
      <div class="row">
        ${s.id === 'body' ? '<span class="lock" title="Body text is always available">•</span>'
          : `<input type="checkbox" data-k="enabled"${s.enabled ? ' checked' : ''} title="Offer this style in the poster">`}
        <input type="text" data-k="name" value="${escapeHtml(s.name)}" title="Name shown when writing">
        ${isBaseStyle(s.id) ? '' : '<button class="del" data-del title="Remove this style">×</button>'}
      </div>
      <div class="row">
        <select data-k="font">${fontOptions(false)}</select>
        <input type="number" data-k="size" min="4" step="0.25" value="${s.size}" title="Size (pt)">
      </div>
      <div class="row">
        <select data-k="weight">${WEIGHTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <label class="check mini" title="Italic"><input type="checkbox" data-k="italic"${s.italic ? ' checked' : ''}> <i>Italic</i></label>
        <label class="check mini" title="All capitals"><input type="checkbox" data-k="upper"${s.upper ? ' checked' : ''}> CAPS</label>
      </div>
      <div class="row">
        <span class="muted">Letter spacing</span>
        <input type="number" data-k="tracking" step="0.01" value="${s.tracking ?? 0}" title="Space between letters (em): 0 normal, below 0 tighter">
      </div>
      <div class="row">
        <span class="muted">Colour</span>
        <input type="color" data-k="color" value="${s.color || '#1a1a1a'}" title="Colour"${s.color ? '' : ' class="off"'}>
        <label class="check mini" title="Use the surrounding text colour"><input type="checkbox" data-k="colorAuto"${s.color ? '' : ' checked'}> auto</label>
      </div>
      <div class="fmt sample"><span data-ts="${s.id}">${escapeHtml(s.name)}</span></div>
    </div>`;
}

const cards = (...ids: string[]): string => ids.map((id) => styleById(editor.doc.design, id)).filter(Boolean).map((s) => styleCard(s!)).join('');

/* ---- the settings of each element ---- */

function settings(k: MasterKey): string {
  const doc = editor.doc, d = doc.design, p = doc.paper, b = d.brand;
  switch (k) {
    case 'paper':
      return note('The paper, its margins and the space between the poster\'s tiles.') +
        h('Margins') + field('All sides (mm)', num('margin', p.margin, '1')) +
        h('Between the poster\'s tiles (mm)') + gapRow('gutterGlobal', p.gutter, p.gutterY, '1') +
        h('Space around text in tiles (mm)') + spaceRow('text', 'Tiles') + roleRow('paper');
    case 'watermark': {
      const wm = b.watermark;
      return note('An image behind the whole poster, under every tile: a pattern, a seal, a photo. Tiles with a fill cover it.') +
        field('Image', imageSelect('wm.src', wm?.src ?? '', 'No watermark')) +
        (wm ? field('Strength (%)', num('wm.opacity', Math.round(wm.opacity * 100), '1', ' max="100"')) +
          field('Fit', select('wm.fit', wm.fit, [['cover', 'Fill the paper (cropped)'], ['contain', 'Whole image']])) : '') +
        (images().length ? '' : note('Add images in the Images sidebar first.'));
    }
    case 'banner': {
      const logo = b.logo;
      return note('The poster\'s header: its colours, border, title and subtitle styles, and a logo.') +
        roleRow('header') + borderRow('header') + spaceRow('header', 'Space around text') +
        h('Logo') + field('Image', imageSelect('logo.src', logo?.src ?? '', 'No logo')) +
        (logo ? field('Side', select('logo.side', logo.side, [['right', 'Right'], ['left', 'Left']])) + field('Height (mm)', num('logo.h', logo.h, '1')) : '') +
        h('Text') + cards('title', 'subtitle');
    }
    case 'footer': {
      const fl = b.footerLogos;
      return note('The poster\'s footer: colours, border and a row of logos (funders, facilities, institutions).') +
        roleRow('footer') + borderRow('footer') +
        h('Logos') + (fl.srcs.length ? `<div class="logo-list">${fl.srcs.map((s, i) =>
          `<div class="logo-item"><span>${escapeHtml(images().find(([v]) => v === s)?.[1] ?? s)}</span><button class="del" data-fl-del="${i}" title="Remove">×</button></div>`).join('')}</div>` : '') +
        field('Add a logo', imageSelect('fl.add', '', 'Choose an image…')) +
        (fl.srcs.length ? field('Height (mm)', num('fl.h', fl.h, '1')) +
          field('Arrange', select('fl.align', fl.align, [['spread', 'Spread across'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']])) : '');
    }
    case 'tiles':
      return note('The poster\'s own tiles: their fill, border and the space around their text.') +
        roleRow('tile') + borderRow('global') + spaceRow('text', 'Space around text');
    case 'local':
      return note('Tiles inside a tile sit closer together than the poster\'s tiles. A divided tile can still have its own gaps (Layout → Inner gutter).') +
        h('Between tiles inside a tile (mm)') + gapRow('gutterLocal', d.localGutter, d.localGutterY, '0.5') + borderRow('local');
    case 'tileHeader':
      return note('Headers of tiles: a title, and a subtitle below or beside it.') +
        roleRow('tileHeader') + borderRow('tileHeader') + spaceRow('header', 'Space around text') +
        field('Subtitle', select('tileSubtitle', d.tileSubtitle, [['below', 'below the title (two rows)'], ['beside', 'beside the title (one line)']])) +
        cards('tileTitle', 'tileSubtitle');
    case 'tileFooter':
      return note('Footers of tiles.') + roleRow('tileFooter') + borderRow('tileFooter');
    case 'fonts': {
      const inc = FONT_LIST.filter((f) => f.group === 'included');
      return note('Included fonts work everywhere and are embedded in exports. Fonts on this computer can be chosen too; they are not embedded in published web pages.') +
        h('Included') + `<div class="font-list">${inc.map((f) => `<div style="font-family:${escapeHtml(f.css)}">${escapeHtml(f.label)}</div>`).join('')}</div>` +
        h('On this computer') + note(localFamilies().length ? `${localFamilies().length} font families` : 'Not available here') +
        h('One font for all text') + field('Font', `<select data-k="allFonts"><option value="">Choose…</option>${fontOptions(false)}</select>`, 'Gives every text style this font');
    }
    case 'palette': {
      const qual = PALETTES.filter((x) => x.kind === 'qualitative'), scales = PALETTES.filter((x) => x.kind !== 'qualitative');
      const strip = (cs: string[]) => `<span class="pal-strip">${cs.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
      return note('Paul Tol\'s colour schemes: distinct for colour-blind readers. The poster\'s scheme is offered in every colour menu, and new plots use it.') +
        `<div class="pal-list">${qual.map((x) => `<button class="pal${x.id === d.palette ? ' on' : ''}" data-palette="${x.id}"><b>${x.name}</b>${strip(x.colors)}${x.note ? `<span class="muted">${x.note}</span>` : ''}</button>`).join('')}</div>` +
        h('For colour scales') + `<div class="pal-list">${scales.map((x) => `<div class="pal scale"><b>${x.name}</b> <span class="muted">${x.kind}</span>${strip(x.colors)}</div>`).join('')}</div>`;
    }
    case 'table':
      return note('Tables in text: a heavy rule under the header and at the end, light lines between rows.') +
        field('Heavy rules (pt)', num('table.rule', d.table.rule, '0.25')) +
        field('Lines between rows', `<input type="color" data-k="table.line" value="${d.table.line}">`);
    default: {
      const s = styleById(d, k.slice(6));
      return s ? styleCard(s) + '<button id="addStyle" class="add">+ Add text style</button>' : '';
    }
  }
}

export function renderDesignTab(): void {
  const g = groupOf(picked);
  $('#designCats').innerHTML =
    `<div class="dgroups">${GROUPS.map((x) => `<button data-group="${x.id}" class="${x.id === g ? 'on' : ''}" title="${escapeHtml(x.title)}">${x.label}</button>`).join('')}</div>` +
    `<div class="delements">${elementsOf(g).map(([k, l]) => `<button data-el="${escapeHtml(k)}" class="${k === picked ? 'on' : ''}">${escapeHtml(l)}</button>`).join('')}</div>` +
    `<div class="dpanel">${settings(picked)}</div>`;
  attachSwatches($('#tabDesign'));
  for (const card of $$('.style-card')) {
    const s = styleById(editor.doc.design, card.dataset.style!)!;
    $<HTMLSelectElement>('[data-k=font]', card).value = s.font;
    $<HTMLSelectElement>('[data-k=weight]', card).value = s.weight;
  }
}

/** Open an element's settings (picked on the master poster or in the list). */
export function pickDesignElement(k: MasterKey): void {
  picked = k;
  setMasterPick(k);
  renderDesignTab();
}

/* ---- applying changes ---- */

function changed(final: boolean, again = false): void {
  render(); // also redraws the master poster
  if (final) commit();
  if (again) renderDesignTab();
}

/** Apply one edited field of the Design panel to the document. */
function update(e: Event, final: boolean): void {
  const el = e.target as HTMLInputElement, k = el.dataset.k;
  if (!k) return;
  const doc = editor.doc, d = doc.design, b = d.brand, v = parseFloat(el.value);
  switch (k) {
    case 'space':
      if (v >= 0) d.space[el.dataset.kind as 'text' | 'header'][el.dataset.ax as 'x' | 'y'] = v;
      return changed(final);
    case 'margin':
      if (!(v >= 0) || !final) return;
      doc.paper.margin = v;
      return changed(true);
    case 'gutterGlobal': case 'gutterLocal': {
      if (!(v >= 0) || !final) return; // applied when the number is set, not on every keystroke
      const p = doc.paper, across = el.dataset.ax !== 'y';
      if (k === 'gutterGlobal') setPaperGutter(doc, across ? v : p.gutter, across ? p.gutterY : v);
      else if (across) d.localGutter = v; // tiles inside tiles follow (normalizeLayout)
      else d.localGutterY = v;
      return changed(true, true);
    }
    case 'tileSubtitle':
      d.tileSubtitle = el.value === 'beside' ? 'beside' : 'below';
      return changed(final, final);
    case 'wm.src':
      b.watermark = el.value ? { src: el.value, opacity: b.watermark?.opacity ?? 0.12, fit: b.watermark?.fit ?? 'cover' } : null;
      return changed(true, true);
    case 'wm.opacity':
      if (b.watermark && v >= 0) b.watermark.opacity = Math.min(100, v) / 100;
      return changed(final);
    case 'wm.fit':
      if (b.watermark) b.watermark.fit = el.value === 'contain' ? 'contain' : 'cover';
      return changed(true);
    case 'logo.src':
      b.logo = el.value ? { src: el.value, side: b.logo?.side ?? 'right', h: b.logo?.h ?? Math.round(doc.paper.h * 0.06) } : null;
      return changed(true, true);
    case 'logo.side':
      if (b.logo) b.logo.side = el.value === 'left' ? 'left' : 'right';
      return changed(true);
    case 'logo.h':
      if (b.logo && v > 0) b.logo.h = v;
      return changed(final);
    case 'fl.add':
      if (el.value) b.footerLogos.srcs.push(el.value);
      return changed(true, true);
    case 'fl.h':
      if (v > 0) b.footerLogos.h = v;
      return changed(final);
    case 'fl.align':
      b.footerLogos.align = el.value as typeof b.footerLogos.align;
      return changed(true);
    case 'table.rule':
      if (v >= 0) d.table.rule = v;
      return changed(final);
    case 'table.line':
      d.table.line = el.value;
      return changed(final);
    case 'allFonts':
      if (!el.value || !final) return;
      for (const s of d.styles) s.font = el.value;
      return changed(true, true);
  }
  const roleRow = el.closest<HTMLElement>('[data-role]'), card = el.closest<HTMLElement>('[data-style]');
  const borderRow = el.closest<HTMLElement>('[data-border]');
  if (borderRow) {
    const bd = d.borders[borderRow.dataset.border as BorderKind];
    if (k === 'w' || k === 'radius') { if (v >= 0) bd[k] = v; }
    else if (k === 'c') bd.c = el.value;
    else if (k === 'sides') bd.sides = el.value;
    // choosing a colour or sides for a kind without a border gives it one
    if ((k === 'c' || k === 'sides') && !(bd.w > 0)) { bd.w = 0.5; ($<HTMLInputElement>('[data-k=w]', borderRow)).value = '0.5'; }
  } else if (roleRow) {
    const c = d.colors[roleRow.dataset.role as ColorRoleId];
    const fieldOf = (key: string) => $<HTMLInputElement>(`[data-k=${key}]`, roleRow);
    if (k === 'bg') { c.bg = el.value; fieldOf('bgNone').checked = false; el.classList.remove('off'); }
    if (k === 'bgNone') { c.bg = el.checked ? '' : fieldOf('bg').value; fieldOf('bg').classList.toggle('off', el.checked); }
    if (k === 'text') { c.text = el.value; fieldOf('textAuto').checked = false; el.classList.remove('off'); }
    if (k === 'textAuto') { c.text = el.checked ? '' : fieldOf('text').value; fieldOf('text').classList.toggle('off', el.checked); }
  } else if (card) {
    const s = styleById(d, card.dataset.style!)!;
    const fieldOf = (key: string) => $<HTMLInputElement>(`[data-k=${key}]`, card);
    if (k === 'enabled') { s.enabled = el.checked; card.classList.toggle('disabled', !el.checked); }
    else if (k === 'name') { s.name = el.value || s.id; $('.sample span', card).textContent = s.name; }
    else if (k === 'size') { if (v > 0) s.size = v; }
    else if (k === 'tracking') s.tracking = Number.isFinite(v) ? v : 0;
    else if (k === 'italic' || k === 'upper') s[k] = el.checked;
    else if (k === 'color') { s.color = el.value; fieldOf('colorAuto').checked = false; el.classList.remove('off'); }
    else if (k === 'colorAuto') { s.color = el.checked ? '' : fieldOf('color').value; fieldOf('color').classList.toggle('off', el.checked); }
    else if (k === 'font' || k === 'weight') (s as TextStyle)[k] = el.value;
  }
  changed(final);
}

/* ---- the tabs of the settings panel; Design opens the master poster ---- */

export function showTab(name: 'layout' | 'design'): void {
  $$('.tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('#tabLayout').hidden = name !== 'layout';
  $('#tabDesign').hidden = name !== 'design';
  showMaster(name === 'design');
  if (name === 'design') renderDesignTab();
}

export const designTabVisible = (): boolean => !$('#tabDesign').hidden;

/** Redraw the design view after the document changed elsewhere (undo, another poster). */
export function refreshDesign(): void {
  if (!designTabVisible()) return;
  renderDesignTab();
  if (masterVisible()) renderMaster();
}

export function bindDesignTab(): void {
  const tab = $('#tabDesign');
  tab.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, d = editor.doc.design;
    const grp = t.closest<HTMLElement>('[data-group]');
    if (grp) { pickDesignElement(elementsOf(grp.dataset.group as Group)[0][0]); return; }
    const elb = t.closest<HTMLElement>('.delements [data-el]');
    if (elb) { pickDesignElement(elb.dataset.el as MasterKey); return; }
    const pal = t.closest<HTMLElement>('[data-palette]');
    if (pal) { d.palette = paletteById(pal.dataset.palette).id; changed(true, true); return; }
    const flDel = t.closest<HTMLElement>('[data-fl-del]');
    if (flDel) { d.brand.footerLogos.srcs.splice(+flDel.dataset.flDel!, 1); changed(true, true); return; }
    if (t.id === 'addStyle') {
      const id = 'c' + uid();
      d.styles.push(newTextStyle(id));
      commit();
      pickDesignElement(`style:${id}`);
      render();
      const name = $<HTMLInputElement>(`[data-style="${id}"] [data-k=name]`);
      name.focus();
      name.select();
    } else if (t.dataset.del !== undefined) {
      const id = t.closest<HTMLElement>('[data-style]')!.dataset.style;
      d.styles = d.styles.filter((x) => x.id !== id);
      picked = 'style:body';
      changed(true, true);
    }
  });
  tab.addEventListener('input', (e) => update(e, false));
  tab.addEventListener('change', (e) => update(e, true));
  $('#designReset').addEventListener('click', () => {
    if (!confirm('Reset all colours, text styles, palette, watermark and logos to the defaults?')) return;
    editor.doc.design = defaultDesign();
    changed(true, true);
  });
  $('#masterClose').addEventListener('click', () => showTab('layout'));
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab as 'layout' | 'design')));
}
