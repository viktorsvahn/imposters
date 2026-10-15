/* The settings panel (Layout tab): Section (the tile you are inside), Paper,
   Tile (selection) and Arrange. For special settings; everyday styling lives
   in the formatting toolbar. */

import { arrange } from '../commands';
import { MIN, SIZES } from '../constants';
import { setBand } from '../editor/actions';
import { commit } from '../editor/history';
import { notify, render } from '../editor/hooks';
import { savePrefs } from '../editor/prefs';
import { editor, scopeTile, selectedTiles } from '../editor/store';
import { zoomFit } from '../interaction/zoom';
import { bandOf } from '../layout/bands';
import { resizePaper } from '../layout/paper';
import { designSpace, offeredStyles, resolveBg, resolveText } from '../model/design';
import { applyStyle, lookOf } from '../model/style';
import { isSection } from '../model/tree';
import type { Paper, Tile } from '../model/types';
import { project } from '../project/session';
import { escapeHtml, rgbToHex, round } from '../util';
import { $, $$, setVal } from '../view/dom';
import { minimumSize } from '../view/measure';
import { contentEl } from '../view/paper';
import { fontOptions } from '../view/fonts';
import { tileLabel } from './labels';

/** Colour controls: a role select (design colour / none / custom) + a picker. */
function showColor(roleSel: string, pickSel: string, v: string, resolve: (v: string) => string, fallback?: () => string): void {
  setVal(roleSel, !v ? '' : v[0] === '@' ? v : 'custom');
  setVal(pickSel, resolve(v) || (fallback ? rgbToHex(fallback()) : '') || '#ffffff');
}

export function updateInspector(): void {
  const doc = editor.doc, design = doc.design, s = scopeTile();
  $('#paperSection').hidden = !!s;
  $('#scopeSection').hidden = !s;
  if (s) {
    $('#scopeName').textContent = '— ' + tileLabel(s);
    const n = (s.children || []).length;
    $('#scopeSize').textContent = `${round(s.w)} × ${round(s.h)} mm · ${n} tile${n === 1 ? '' : 's'} inside`;
    setVal('#sInset', s.inset || 0);
    setVal('#sGutter', s.gutter ?? '');
    setVal('#sGutterY', s.gutterY ?? '');
    $<HTMLInputElement>('#sGutter').placeholder = String(doc.design.localGutter); // blank: the design's
    $<HTMLInputElement>('#sGutterY').placeholder = String(doc.design.localGutterY);
    showColor('#sFillRole', '#sBg', s.bg, (v) => resolveBg(design, v));
    setVal('#sBorderW', round(s.borderW));
    setVal('#sBorderC', s.borderC);
    setVal('#sRadius', round(s.radius));
    setVal('#sBleed', !!s.bleed);
    setVal('#sHeader', !!bandOf(doc, s, 'header'));
    setVal('#sFooter', !!bandOf(doc, s, 'footer'));
  }
  const p = doc.paper;
  setVal('#pHeader', !!bandOf(doc, null, 'header'));
  setVal('#pFooter', !!bandOf(doc, null, 'footer'));
  setVal('#pSize', SIZES[p.size] ? p.size : 'custom');
  setVal('#pOrient', p.orientation);
  setVal('#pW', round(p.w));
  setVal('#pH', round(p.h));
  setVal('#pMargin', p.margin);
  $('#pGutterNote').textContent = `↔ ${p.gutter} ↕ ${p.gutterY} mm · inside tiles ↔ ${doc.design.localGutter} ↕ ${doc.design.localGutterY} mm (Design → Spacing)`;
  setVal('#pCols', p.columns);

  const ts = selectedTiles();
  $('#tileSection').hidden = ts.length === 0;
  $('#arrangeSection').hidden = ts.length < 2;
  if (!ts.length) return;
  const t = ts[0];
  $('#tileCount').textContent = ts.length > 1 ? `(${ts.length} selected)` : '';
  for (const [sel, prop] of [['#tX', 'x'], ['#tY', 'y'], ['#tW', 'w'], ['#tH', 'h']] as const) {
    setVal(sel, round(t[prop]));
    $<HTMLInputElement>(sel).disabled = ts.length > 1;
  }
  const look = lookOf(t);
  showColor('#tFillRole', '#tBg', look.fill.bg, (v) => resolveBg(design, v));
  showColor('#tTextRole', '#tColor', look.text.color, (v) => resolveText(design, v),
    () => { const c = contentEl(look.text.id); return c ? getComputedStyle(c).color : ''; });
  const styleSel = $<HTMLSelectElement & { _opts?: string }>('#tStyle');
  const opts = offeredStyles(design).map((x) => `<option value="${x.id}">${x.name}</option>`).join('');
  if (styleSel._opts !== opts) { styleSel.innerHTML = opts; styleSel._opts = opts; }
  setVal('#tStyle', look.text.ts || 'body');
  setVal('#tFont', look.text.font || '');
  setVal('#tSize', look.text.fontSize ?? '');
  const c = contentEl(look.text.id);
  if (c) $<HTMLInputElement>('#tSize').placeholder = String(Math.round(parseFloat(getComputedStyle(c).fontSize) * 0.75));
  const ds = designSpace(design, t);
  setVal('#tPadX', t.padX ?? '');
  setVal('#tPadY', t.padY ?? '');
  $<HTMLInputElement>('#tPadX').placeholder = String(ds.x); // blank: the design's
  $<HTMLInputElement>('#tPadY').placeholder = String(ds.y);
  setVal('#tRadius', round(t.radius));
  setVal('#tBorderW', round(t.borderW));
  setVal('#tBorderC', t.borderC);
  setVal('#tFit', t.fit);
  setVal('#tCols', t.cols || 1);
  setVal('#tHyph', !!lookOf(t).text.hyphens);
  $('#flowOpts').hidden = !(t.type === 'text' && (lookOf(t).text.cols || 1) > 1);
  setVal('#tFlow', lookOf(t).text.flow ?? 'down');
  // background image: the project's images
  const sel = $<HTMLSelectElement & { _opts?: string }>('#tBgImg');
  const imgs = (project.manifest?.assets ?? []).filter((a) => a.kind !== 'plot');
  const imgOpts = '<option value="">None</option>' + imgs.map((a) => `<option value="${escapeHtml(a.src)}">${escapeHtml(a.name)}</option>`).join('');
  if (sel._opts !== imgOpts) { sel.innerHTML = imgOpts; sel._opts = imgOpts; }
  setVal('#tBgImg', t.bgImage ?? '');
  setVal('#tBgOp', Math.round((t.bgImageOpacity ?? 1) * 100));
  setVal('#tBgFit', t.bgImageFit ?? 'cover');
  $('#bgFitRow').hidden = !t.bgImage;
  $<HTMLInputElement>('#tBgOp').disabled = !t.bgImage;
  setVal('#tBleed', !!t.bleed);
  setVal('#tInset', t.inset || 0);
  setVal('#tGutter', t.gutter ?? '');
  setVal('#tGutterY', t.gutterY ?? '');
  $<HTMLInputElement>('#tGutter').placeholder = String(doc.design.localGutter); // blank: the design's
  $<HTMLInputElement>('#tGutterY').placeholder = String(doc.design.localGutterY);
  const sec = isSection(t);
  $('#textOpts').hidden = sec || t.type !== 'text';
  $('#secOpts').hidden = !sec;
  for (const seg of $$('.seg')) {
    for (const b of seg.children as HTMLCollectionOf<HTMLElement>) {
      b.classList.toggle('on', (look.text as unknown as Record<string, unknown>)[seg.dataset.prop!] === b.dataset.v);
    }
  }
  $('#imgOpts').hidden = !ts.some((x) => x.type === 'image');
}

/* ---- wiring ---- */

type Parse = (v: string) => unknown;
const num = (min: number): Parse => (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : Math.max(min, n); };
const str: Parse = (v) => v;
/** blank → null (use the inherited value) */
const optionalNum = (min: number): Parse => (v) => (v.trim() === '' ? undefined : Math.max(min, parseFloat(v)));

/** Bind an input to a property of some tiles (live: update while dragging a picker). */
function bindProp(sel: string, prop: keyof Tile, parse: Parse, targets: () => Tile[], live = false, cascade = true): void {
  const el = $<HTMLInputElement>(sel);
  const own = prop === 'borderW' || prop === 'borderC' || prop === 'radius';
  const apply = () => {
    const v = parse(el.value);
    if (v === null || Number.isNaN(v)) return;
    for (const t of targets()) {
      if (own) t.ownBorder = true; // set here: the tile's own border, not the design's
      if ((prop === 'w' || prop === 'h') && typeof v === 'number') {
        const min = minimumSize(t, prop === 'w' ? 'x' : 'y');
        if (v < min - 0.05) { notify(`The content needs ${round(min)} mm`); applyStyle(editor.doc, t, prop, round(min)); continue; }
      }
      const val = v === undefined ? null : v;
      if (cascade) applyStyle(editor.doc, t, prop, val);
      else (t as unknown as Record<string, unknown>)[prop] = val;
    }
    render();
  };
  if (live) el.addEventListener('input', apply);
  el.addEventListener('change', () => { apply(); commit(); });
}

const scopeTargets = (): Tile[] => (scopeTile() ? [scopeTile()!] : []);

export function bindInspector(): void {
  const doc = () => editor.doc;
  $('#tFont').innerHTML = fontOptions(true);
  $('#tFont').dataset.fontPicker = '';

  // the selected tiles
  const tile = (sel: string, prop: keyof Tile, parse: Parse, live = false) => bindProp(sel, prop, parse, selectedTiles, live);
  tile('#tX', 'x', num(-1e4));
  tile('#tY', 'y', num(-1e4));
  tile('#tW', 'w', num(MIN));
  tile('#tH', 'h', num(MIN));
  tile('#tBg', 'bg', str, true);
  tile('#tColor', 'color', str, true);
  tile('#tFont', 'font', str);
  tile('#tSize', 'fontSize', optionalNum(1));
  tile('#tStyle', 'ts', (v) => (v === 'body' ? '' : v));
  tile('#tPadX', 'padX', optionalNum(0)); // blank: the design's
  tile('#tPadY', 'padY', optionalNum(0));
  tile('#tRadius', 'radius', num(0));
  tile('#tBorderW', 'borderW', num(0));
  tile('#tBorderC', 'borderC', str, true);
  tile('#tFit', 'fit', str);
  tile('#tCols', 'cols', (v) => Math.min(8, Math.max(1, Math.round(+v) || 1)));
  tile('#tInset', 'inset', num(0));
  tile('#tGutter', 'gutter', optionalNum(0));
  tile('#tGutterY', 'gutterY', optionalNum(0));

  // role selects: "" = none/default, "@role" = design colour, "custom" = use the picker
  const roleSelect = (sel: string, pick: string, prop: keyof Tile, targets: () => Tile[]) =>
    $(sel).addEventListener('change', (e) => {
      const raw = (e.target as HTMLSelectElement).value;
      const v = raw === 'custom' ? $<HTMLInputElement>(pick).value : raw;
      for (const t of targets()) applyStyle(doc(), t, prop, v);
      commit();
      render();
    });
  roleSelect('#tFillRole', '#tBg', 'bg', selectedTiles);
  roleSelect('#tTextRole', '#tColor', 'color', selectedTiles);
  roleSelect('#sFillRole', '#sBg', 'bg', scopeTargets);

  // the tile you are inside
  const scope = (sel: string, prop: keyof Tile, parse: Parse, live = false) => bindProp(sel, prop, parse, scopeTargets, live, false);
  scope('#sInset', 'inset', num(0));
  scope('#sGutter', 'gutter', optionalNum(0));
  scope('#sGutterY', 'gutterY', optionalNum(0));
  scope('#sBg', 'bg', str, true);
  scope('#sBorderW', 'borderW', num(0));
  scope('#sBorderC', 'borderC', str, true);
  scope('#sRadius', 'radius', num(0));

  for (const [sel, role, scoped] of [['#sHeader', 'header', true], ['#sFooter', 'footer', true],
    ['#pHeader', 'header', false], ['#pFooter', 'footer', false]] as const) {
    $(sel).addEventListener('change', (e) => setBand(scoped ? scopeTile() : null, role, (e.target as HTMLInputElement).checked));
  }
  const bleed = (sel: string, targets: () => Tile[]) => $(sel).addEventListener('change', (e) => {
    for (const t of targets()) t.bleed = (e.target as HTMLInputElement).checked;
    commit();
    render();
  });
  bleed('#tBleed', selectedTiles);
  const each = (sel: string, set: (t: Tile, v: string) => void) => $(sel).addEventListener('change', (e) => {
    for (const t of selectedTiles()) set(t, (e.target as HTMLInputElement).value);
    commit();
    render();
  });
  each('#tFlow', (t, v) => applyStyle(doc(), t, 'flow', v === 'across' ? 'across' : 'down'));
  each('#tBgImg', (t, v) => { if (v) t.bgImage = v; else delete t.bgImage; });
  each('#tBgOp', (t, v) => { const n = parseFloat(v); if (n >= 0) t.bgImageOpacity = Math.min(100, n) / 100; });
  each('#tBgFit', (t, v) => { t.bgImageFit = v === 'contain' ? 'contain' : 'cover'; });
  $('#tHyph').addEventListener('change', (e) => {
    for (const t of selectedTiles()) applyStyle(doc(), t, 'hyphens', (e.target as HTMLInputElement).checked);
    commit();
    render();
  });
  bleed('#sBleed', scopeTargets);
  for (const seg of $$('.seg')) {
    seg.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v;
      if (!v) return;
      for (const t of selectedTiles()) applyStyle(doc(), t, seg.dataset.prop as keyof Tile, v);
      commit();
      render();
    });
  }

  // paper
  const paper = () => doc().paper;
  const resized = () => { commit(); render(); zoomFit(); };
  $('#pSize').addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (!SIZES[v]) return;
    if (v === 'Slide') paper().orientation = 'landscape';
    const [a, b] = SIZES[v], land = paper().orientation === 'landscape';
    resizePaper(doc(), land ? Math.max(a, b) : Math.min(a, b), land ? Math.min(a, b) : Math.max(a, b));
    paper().size = v;
    resized();
  });
  $('#pOrient').addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value as Paper['orientation'];
    if (v !== paper().orientation) resizePaper(doc(), paper().h, paper().w);
    paper().orientation = v;
    resized();
  });
  for (const [sel, axis] of [['#pW', 'w'], ['#pH', 'h']] as const) {
    $(sel).addEventListener('change', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      if (!(v >= 20)) { render(); return; }
      resizePaper(doc(), axis === 'w' ? v : paper().w, axis === 'h' ? v : paper().h);
      paper().size = 'custom';
      resized();
    });
  }
  for (const [sel, prop] of [['#pMargin', 'margin'], ['#pCols', 'columns']] as const) {
    $(sel).addEventListener('change', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      if (Number.isNaN(v)) { render(); return; }
      paper()[prop] = Math.max(0, prop === 'columns' ? Math.round(v) : v);
      commit();
      render();
    });
  }

  // view options (not part of the document)
  const view = editor.view;
  setVal('#optOverflow', view.showOverflow);
  setVal('#optSpell', view.spell);
  $('#optOverflow').addEventListener('change', (e) => {
    view.showOverflow = (e.target as HTMLInputElement).checked;
    savePrefs({ overflow: view.showOverflow });
    render();
  });
  $('#optSpell').addEventListener('change', (e) => {
    view.spell = (e.target as HTMLInputElement).checked;
    savePrefs({ spell: view.spell });
    render();
  });
  $('#snapToggle').addEventListener('change', (e) => { view.snap = (e.target as HTMLInputElement).checked; });

  $$('[data-arr]').forEach((b) => b.addEventListener('click', () => arrange(b.dataset.arr as Parameters<typeof arrange>[0])));
}
