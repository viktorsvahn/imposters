/* The formatting toolbar (word-processor style). While typing it styles the
   paragraph / selected text; otherwise it styles the selected tiles. Fill,
   vertical alignment, line/paragraph spacing, columns, borders and bleed are
   tile settings. Header / Footer act on the selected tile, else the tile you
   are inside, else the poster. */

import { setBand } from '../editor/actions';
import { commit } from '../editor/history';
import { render } from '../editor/hooks';
import { editor, scopeTile, selectedTiles, tileById } from '../editor/store';
import {
  applyBlockStyle, blockOf, editingContent, selectedBlocks, selectParagraphIfCollapsed, stopEditing,
} from '../interaction/editing';
import { bandOf } from '../layout/bands';
import { FONT_LIST, FONTS, offeredStyles, resolveBg, resolveText, styleById } from '../model/design';
import { applyStyle, lookOf } from '../model/style';
import { parentOf } from '../model/tree';
import type { BandRole, Tile } from '../model/types';
import { $, dom } from '../view/dom';
import { tileEl, updateTileEl } from '../view/paper';
import { icons } from './icons';
import { closeMenu, menuOpen, openBorderMenu, openColorMenu, type BorderChange } from './menus';

export const fontOptions = (withDefault: boolean): string =>
  (withDefault ? '<option value="">Default font</option>' : '') +
  FONT_LIST.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');

/* ---- markup ---- */

const SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 108, 120, 144];

function markup(): string {
  const btn = (f: string, title: string, body: string, extra = '') => `<button data-f="${f}" title="${title}"${extra}>${body}</button>`;
  const band = (b: string, title: string, icon: string, label: string) =>
    `<button data-b="${b}" title="${title}">${icon}<span class="lbl">${label}</span></button>`;
  const sep = '<span class="sep"></span>';
  return [
    '<select id="fStyle" data-f="sel" title="Text style (paragraph while typing, whole tile otherwise)"></select>',
    '<select id="fFont" data-f="sel" title="Font"></select>',
    `<span class="fsize">${btn('size-down', 'Smaller', 'A−')}<input id="fSize" data-f="sel" type="number" min="4" step="1" title="Size (pt)">${btn('size-up', 'Larger', 'A+')}</span>`,
    sep,
    btn('bold', 'Bold (Ctrl+B)', '<b>B</b>') + btn('italic', 'Italic (Ctrl+I)', '<i>I</i>') + btn('underline', 'Underline (Ctrl+U)', '<u>U</u>'),
    '<button data-f="color" id="fColor" class="swbtn" title="Text colour">A</button>',
    `<button data-f="fill" id="fFill" class="swbtn fill" title="Tile fill">${icons.fill}</button>`,
    sep,
    btn('align-left', 'Align left', icons.alignLeft) + btn('align-center', 'Align center', icons.alignCenter) +
      btn('align-right', 'Align right', icons.alignRight) + btn('align-justify', 'Justify', icons.alignJustify),
    sep,
    btn('valign-top', 'Text at the top of the tile', icons.valignTop) + btn('valign-middle', 'Text at the middle of the tile', icons.valignMiddle) +
      btn('valign-bottom', 'Text at the bottom of the tile', icons.valignBottom),
    sep,
    btn('ul', 'Bulleted list (while typing)', icons.bullets, ' data-edit-only') + btn('ol', 'Numbered list (while typing)', icons.numbers, ' data-edit-only'),
    sep,
    '<label title="Line spacing">↕<select id="fLine" data-f="sel"><option value="">Auto</option><option>1</option><option>1.15</option><option>1.25</option><option>1.5</option><option>2</option></select></label>',
    '<label title="Space after each paragraph">¶<select id="fSpace" data-f="sel"><option value="">Auto</option><option value="0">None</option><option value="0.25">Small</option><option value="0.5">Medium</option><option value="1">Large</option></select></label>',
    '<label title="Text columns">▥<select id="fCols" data-f="sel"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>',
    btn('clear', 'Remove direct formatting (back to the text style)', 'Clear'),
    sep,
    band('header', 'Add a header', icons.header, 'Header'),
    band('footer', 'Add a footer', icons.footer, 'Footer'),
    band('border', 'Borders: sides, width, colour, corners', icons.border, 'Border'),
    band('bleed', 'Bleed: background runs past the margin to the edge', icons.bleed, 'Bleed'),
  ].join('\n');
}

/* ---- keeping the caret while using the toolbar ---- */

let savedRange: Range | null = null;

function restoreRange(): HTMLDivElement | null {
  const c = editingContent();
  if (!c) return null;
  c.focus({ preventScroll: true });
  if (savedRange && c.contains(savedRange.commonAncestorContainer)) {
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  return c;
}

function keepRange(): void {
  const s = getSelection();
  if (s?.rangeCount) savedRange = s.getRangeAt(0).cloneRange();
}

function exec(cmd: string, value?: string): void {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(cmd, false, value);
}

/** execCommand only knows sizes 1–7; mark with 7 and turn that into points. */
function setInlineSize(c: HTMLElement, pt: number): void {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand('fontSize', false, '7');
  const made: HTMLElement[] = [];
  for (const f of c.querySelectorAll('font[size="7"]')) {
    const span = document.createElement('span');
    span.style.fontSize = pt + 'pt';
    span.append(...f.childNodes);
    f.replaceWith(span);
    made.push(span);
  }
  if (made.length) {
    const r = document.createRange();
    r.setStartBefore(made[0]);
    r.setEndAfter(made[made.length - 1]);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  }
}

/* ---- applying ---- */

type TextAction = 'style' | 'font' | 'size' | 'color' | 'align' | 'list' | 'clear' | 'bold' | 'italic' | 'underline';

/** Text-level actions: on the text while typing, on the tiles otherwise. */
function fmtText(action: TextAction, value?: string | number): void {
  const doc = editor.doc;
  const c = editor.view.editing ? restoreRange() : null;
  if (c) {
    if (action === 'style') applyBlockStyle(String(value));
    else if (action === 'align') for (const b of selectedBlocks(c)) b.style.textAlign = String(value);
    else if (action === 'list') exec(value === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
    else if (action === 'clear') { selectParagraphIfCollapsed(c); exec('removeFormat'); }
    else if (action === 'bold' || action === 'italic' || action === 'underline') exec(action);
    else {
      selectParagraphIfCollapsed(c);
      if (action === 'font') exec('fontName', value ? FONTS[value] : FONTS[styleById(doc.design, 'body')!.font]);
      if (action === 'size') setInlineSize(c, Number(value));
      if (action === 'color') exec('foreColor', resolveText(doc.design, String(value)) || '#1a1a1a');
    }
    keepRange();
    updateFormatBar();
    return;
  }
  const ts = selectedTiles();
  if (!ts.length) return;
  const prop = ({ style: 'ts', font: 'font', size: 'fontSize', color: 'color', align: 'align' } as const)[action as 'style'];
  if (prop) {
    const v = action === 'style' && value === 'body' ? '' : value;
    for (const t of ts) applyStyle(doc, t, prop, v);
  } else if (action === 'bold' || action === 'italic' || action === 'underline') {
    const on = !lookOf(ts[0]).text[action];
    for (const t of ts) applyStyle(doc, t, action, on);
  } else if (action === 'clear') {
    for (const t of ts) {
      applyStyle(doc, t, 'font', '');
      applyStyle(doc, t, 'fontSize', null);
      applyStyle(doc, t, 'color', '');
      for (const k of ['bold', 'italic', 'underline'] as const) applyStyle(doc, t, k, false);
    }
  }
  commit();
  render();
}

/** Restyle the tile being typed in without rebuilding its text. */
function restyleEditingTile(t: Tile): void {
  const el = tileEl(t.id);
  if (el) updateTileEl(el, t, parentOf(editor.doc, t.id));
  restoreRange();
}

/** Tile-level settings (while typing they apply to the tile being edited). */
function fmtTile(prop: keyof Tile, value: unknown): void {
  const editing = tileById(editor.view.editing);
  const ts = editing ? [editing] : selectedTiles();
  if (!ts.length) return;
  for (const t of ts) applyStyle(editor.doc, t, prop, value);
  if (editing) restyleEditingTile(editing);
  else { commit(); render(); }
  updateFormatBar();
}

const borderTargets = (): Tile[] => {
  const editing = tileById(editor.view.editing);
  return editing ? [editing] : selectedTiles();
};

function setBorder(change: BorderChange): void {
  const ts = borderTargets();
  if (!ts.length) return;
  for (const t of ts) {
    Object.assign(t, change);
    // choosing sides or a colour on a tile without a border gives it one
    if (change.borderW === undefined && !(t.borderW > 0) && (change.borderSides || change.borderC)) t.borderW = 0.5;
  }
  const editing = tileById(editor.view.editing);
  if (editing) restyleEditingTile(editing);
  else { commit(); render(); }
  updateFormatBar();
}

/** What Header / Footer act on: the selected (or typed-in) tile, else the tile
    you are inside, else the poster (null). A header/footer stands for the tile
    it belongs to. */
function bandTarget(): Tile | null {
  const one = selectedTiles();
  let t = tileById(editor.view.editing) || (one.length === 1 ? one[0] : scopeTile());
  if (t?.role) t = parentOf(editor.doc, t.id);
  return t;
}

const bleedTarget = (): Tile | null => tileById(editor.view.editing) || selectedTiles()[0] || scopeTile();

function toggleBleed(): void {
  const t = bleedTarget();
  if (!t) return;
  const on = !t.bleed;
  const all = editor.view.editing || !selectedTiles().length ? [t] : selectedTiles();
  for (const x of all) x.bleed = on;
  commit();
  render();
}

function toggleBandButton(role: BandRole): void {
  if (editor.view.editing) stopEditing();
  const c = bandTarget();
  setBand(c, role, !bandOf(editor.doc, c, role));
}

/* ---- reflecting the current state ---- */

export function updateFormatBar(): void {
  const bar = dom.fmtbar;
  const doc = editor.doc, c = editingContent(), ts = selectedTiles();
  const active = !!c || ts.length > 0;
  bar.classList.toggle('inactive', !active);
  bar.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-f]').forEach((el) => { el.disabled = !active; });
  bar.querySelectorAll<HTMLButtonElement>('[data-edit-only]').forEach((el) => { el.disabled = !c; });

  // header / footer / border / bleed (available without a selection too)
  const bt = bandTarget();
  for (const r of ['header', 'footer'] as const) {
    const b = bar.querySelector<HTMLElement>(`[data-b=${r}]`)!, has = !!bandOf(doc, bt, r);
    b.classList.toggle('on', has);
    b.title = `${has ? 'Remove' : 'Add'} a ${r} — ${bt ? 'on this tile' : 'on the poster'}`;
  }
  const bdr = bar.querySelector<HTMLButtonElement>('[data-b=border]')!, bt2 = borderTargets()[0];
  bdr.disabled = !bt2;
  bdr.classList.toggle('on', !!(bt2 && bt2.borderW > 0));
  const bl = bar.querySelector<HTMLButtonElement>('[data-b=bleed]')!, blT = bleedTarget();
  bl.disabled = !blT;
  bl.classList.toggle('on', !!blT?.bleed);

  // style options follow the design
  const sel = $<HTMLSelectElement & { _opts?: string }>('#fStyle');
  const opts = offeredStyles(doc.design).map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  if (sel._opts !== opts) { sel.innerHTML = opts; sel._opts = opts; }
  if (!active) return;

  const t = tileById(editor.view.editing) || ts[0];
  const look = lookOf(t).text;
  let node: Node | null = null;
  if (c) {
    const s = getSelection()!;
    node = s.rangeCount && c.contains(s.anchorNode) ? s.anchorNode : c;
    if (node && node.nodeType !== 1) node = node.parentNode;
  } else {
    node = tileEl(look.id)?.content ?? null;
  }
  const cs = node ? getComputedStyle(node as Element) : null;
  const block = c && node ? blockOf(c, node) : null;
  const setv = (id: string, v: string | number) => {
    const el = $<HTMLInputElement>(id);
    if (document.activeElement !== el) el.value = String(v);
  };

  setv('#fStyle', block?.dataset.ts || look.ts || 'body');
  const first = (css: string) => css.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  const fam = cs ? first(cs.fontFamily) : '';
  const font = FONT_LIST.find((f) => first(f.css) === fam);
  setv('#fFont', c ? (font ? font.id : '') : look.font || '');
  setv('#fSize', cs ? Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 : '');
  const on = (id: string, v: unknown) => bar.querySelector(`[data-f="${id}"]`)!.classList.toggle('on', !!v);
  on('bold', c ? document.queryCommandState('bold') : look.bold || (cs && +cs.fontWeight >= 600));
  on('italic', c ? document.queryCommandState('italic') : look.italic || (cs && cs.fontStyle === 'italic'));
  on('underline', c ? document.queryCommandState('underline') : look.underline);
  const align = cs ? cs.textAlign.replace('start', 'left') : '';
  for (const a of ['left', 'center', 'right', 'justify']) on('align-' + a, align === a);
  for (const v of ['top', 'middle', 'bottom']) on('valign-' + v, (t.vAlign || 'top') === v);
  $('#fColor').style.setProperty('--sw', cs ? cs.color : '#000');
  const fill = resolveBg(doc.design, lookOf(t).fill.bg);
  $('#fFill').style.setProperty('--sw', fill || 'transparent');
  $('#fFill').classList.toggle('nofill', !fill);
  setv('#fLine', look.leading || '');
  setv('#fSpace', t.ps ?? '');
  setv('#fCols', t.cols || 1);
}

/* ---- wiring ---- */

export function bindFormatBar(): void {
  const bar = dom.fmtbar;
  bar.innerHTML = markup();
  $('#fFont').innerHTML = fontOptions(true);

  // remember the caret / selection while typing, so the toolbar can restore it
  document.addEventListener('selectionchange', () => {
    const c = editingContent(), sel = getSelection();
    if (c && sel?.rangeCount && c.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      keepRange();
      updateFormatBar();
    }
  });

  // buttons never take focus, so the caret stays in the text
  bar.addEventListener('pointerdown', (e) => {
    const t = e.target as Element;
    if (t.closest('button') && !t.closest('.colormenu')) e.preventDefault();
  });
  bar.addEventListener('click', (e) => {
    const target = e.target as Element;
    const bb = target.closest<HTMLButtonElement>('button[data-b]');
    if (bb && !bb.disabled) {
      const what = bb.dataset.b!;
      if (what === 'border') {
        if (menuOpen()) closeMenu(); else openBorderMenu(bb, () => borderTargets()[0] || null, setBorder);
      } else if (what === 'bleed') toggleBleed();
      else toggleBandButton(what as BandRole);
      return;
    }
    const b = target.closest<HTMLButtonElement>('button[data-f]');
    if (!b || b.disabled) return;
    const f = b.dataset.f!;
    if (f === 'color' || f === 'fill') {
      if (menuOpen()) { closeMenu(); return; }
      openColorMenu(b, f, (v) => (f === 'fill' ? fmtTile('bg', v) : fmtText('color', v)));
      return;
    }
    if (f.startsWith('align-')) fmtText('align', f.slice(6));
    else if (f.startsWith('valign-')) fmtTile('vAlign', f.slice(7));
    else if (f === 'ul' || f === 'ol') fmtText('list', f);
    else if (f === 'size-up' || f === 'size-down') {
      const cur = parseFloat($<HTMLInputElement>('#fSize').value) || 24;
      const next = f === 'size-up'
        ? SIZE_STEPS.find((s) => s > cur) || cur + 12
        : [...SIZE_STEPS].reverse().find((s) => s < cur) || Math.max(4, cur - 2);
      fmtText('size', next);
    } else fmtText(f as TextAction);
  });
  const onChange = (id: string, fn: (v: string) => void) =>
    $(id).addEventListener('change', (e) => fn((e.target as HTMLInputElement).value));
  onChange('#fStyle', (v) => fmtText('style', v));
  onChange('#fFont', (v) => fmtText('font', v));
  onChange('#fSize', (v) => { const n = parseFloat(v); if (n > 0) fmtText('size', n); });
  $('#fSize').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
  });
  onChange('#fLine', (v) => fmtTile('leading', v ? +v : null));
  onChange('#fSpace', (v) => fmtTile('ps', v === '' ? null : +v));
  onChange('#fCols', (v) => fmtTile('cols', +v));

  // close menus on outside clicks / Esc
  document.addEventListener('pointerdown', (e) => {
    const m = menuOpen(), t = e.target as Element;
    if (m && !m.contains(t) && !t.closest('[data-f=color],[data-f=fill],[data-b=border]')) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen()) closeMenu(); }, true);
}
