/* Drawing the paper and the tile tree (each tile is a DOM element; nested
   tiles live in their parent's .kids layer). */

import { HANDLES, PX } from '../constants';
import { editor, scopeOrigin } from '../editor/store';
import { bleedSides } from '../layout/bleed';
import { frameOf } from '../layout/level';
import { columnsOf } from '../layout/snap';
import { FONTS, resolveBg, resolveText } from '../model/design';
import { innerGutter, isSection, findTile } from '../model/tree';
import type { Tile } from '../model/types';
import { dom } from './dom';

const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

export interface TileElement extends HTMLDivElement {
  content: HTMLDivElement;
  kids: HTMLDivElement;
  bleed: HTMLDivElement;
  /** what the content currently shows (to avoid needless rebuilds) */
  contentKey: string | null;
}

/** tile id → element */
const els = new Map<string, TileElement>();

export const tileEl = (id: string | null | undefined): TileElement | undefined => (id ? els.get(id) : undefined);
export const contentEl = (id: string | null | undefined): HTMLDivElement | null => tileEl(id)?.content ?? null;

export function renderPaper(): void {
  const { doc, view } = editor;
  const p = doc.paper, z = view.zoom;
  const ps = dom.paper.style;
  ps.width = p.w + 'mm';
  ps.height = p.h + 'mm';
  ps.background = resolveBg(doc.design, p.bg) || '#ffffff';
  ps.transform = `scale(${z})`;
  ps.setProperty('--inv', String(1 / z));
  ps.left = ps.top = '40px';
  dom.sizer.style.width = p.w * PX * z + 80 + 'px';
  dom.sizer.style.height = p.h * PX * z + 80 + 'px';

  // overlays (grid, guides, hover) live in the current level's coordinates
  const scope = findTile(doc, view.scope), f = frameOf(doc, scope), o = scopeOrigin();
  const ls = dom.scopeLayer.style;
  ls.left = o.x + 'mm'; ls.top = o.y + 'mm'; ls.width = f.w + 'mm'; ls.height = f.h + 'mm';
  dom.paper.classList.toggle('scoped', !!view.scope);
  renderGrid();

  const seen = new Set<string>();
  const renderList = (list: Tile[], container: HTMLElement, parent: Tile | null) => {
    list.forEach((t, i) => {
      let el = els.get(t.id);
      if (!el) { el = createTileEl(t); els.set(t.id, el); }
      if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
      updateTileEl(el, t, parent);
      seen.add(t.id);
      renderList(t.children || [], el.kids, t);
    });
    while (container.children.length > list.length) container.lastChild!.remove();
  };
  renderList(doc.tiles, dom.tiles, null);
  for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); }
}

let gridKey = '';
function renderGrid(): void {
  const f = frameOf(editor.doc, findTile(editor.doc, editor.view.scope));
  const key = [f.w, f.h, f.margin, f.gutter, f.columns].join();
  if (gridKey === key) return;
  gridKey = key;
  let html = `<div class="marginbox" style="left:${f.margin}mm;top:${f.margin}mm;width:${f.w - 2 * f.margin}mm;height:${f.h - 2 * f.margin}mm"></div>`;
  for (const [a, b] of columnsOf(f)) {
    html += `<div class="col" style="left:${a}mm;width:${b - a}mm;top:${f.margin}mm;height:${f.h - 2 * f.margin}mm"></div>`;
  }
  dom.grid.innerHTML = html;
}

function createTileEl(t: Tile): TileElement {
  const el = document.createElement('div') as TileElement;
  el.className = 'tile';
  el.dataset.id = t.id;
  el.innerHTML = '<div class="content"></div><div class="kids"></div><div class="bleed"></div>' +
    HANDLES.map((h) => `<div class="handle h-${h}" data-handle="${h}"></div>`).join('');
  el.content = el.children[0] as HTMLDivElement;
  el.kids = el.children[1] as HTMLDivElement;
  el.bleed = el.children[2] as HTMLDivElement;
  el.contentKey = null;
  return el;
}

/** Bring one tile element up to date (also used for live restyling while typing). */
export function updateTileEl(el: TileElement, t: Tile, parent: Tile | null): void {
  const { doc, view } = editor, design = doc.design;
  const s = el.style;
  s.left = t.x + 'mm'; s.top = t.y + 'mm'; s.width = t.w + 'mm'; s.height = t.h + 'mm';

  // background, possibly bleeding past the margin
  const bg = resolveBg(design, t.bg);
  const sides = t.bleed && bg ? bleedSides(doc, t, parent) : null;
  s.background = sides ? 'transparent' : bg || 'transparent';
  const b = el.bleed.style;
  b.display = sides ? 'block' : 'none';
  if (sides) {
    b.background = bg;
    b.left = -sides.l + 'mm'; b.top = -sides.t + 'mm';
    b.width = t.w + sides.l + sides.r + 'mm'; b.height = t.h + sides.t + sides.b + 'mm';
  }

  // border: width, colour (design colour or custom) and which sides
  s.borderRadius = t.radius + 'mm';
  const bw = t.borderW > 0 ? t.borderW : 0, bsides = t.borderSides ?? 'trbl';
  const bc = (t.borderC && t.borderC[0] === '@' ? resolveBg(design, t.borderC) || resolveText(design, t.borderC) : t.borderC) || '#1a1a1a';
  for (const [k, side] of [['t', 'Top'], ['r', 'Right'], ['b', 'Bottom'], ['l', 'Left']] as const) {
    s[`border${side}`] = bw && bsides.includes(k) ? `${bw}mm solid ${bc}` : 'none';
  }
  s.justifyContent = VALIGN[t.vAlign] || 'flex-start';

  // state classes
  const live = (parent ? parent.id : null) === view.scope;
  const sel = live && view.selected.has(t.id);
  el.classList.toggle('live', live);
  el.classList.toggle('section', isSection(t));
  el.classList.toggle('scope', t.id === view.scope);
  el.classList.toggle('selected', sel);
  el.classList.toggle('single', sel && view.selected.size === 1);
  el.classList.toggle('editing', view.editing === t.id);
  el.classList.toggle('is-image', t.type === 'image');
  const k = el.kids.style;
  k.left = -(bsides.includes('l') ? bw : 0) + 'mm';
  k.top = -(bsides.includes('t') ? bw : 0) + 'mm';
  k.width = t.w + 'mm'; k.height = t.h + 'mm';

  // text: the tile's text style (design) unless the tile overrides it
  const c = el.content, cs = c.style;
  if (t.ts) c.dataset.ts = t.ts; else delete c.dataset.ts;
  cs.color = resolveText(design, t.color);
  cs.fontFamily = t.font ? FONTS[t.font] || '' : '';
  cs.fontSize = t.fontSize ? t.fontSize + 'pt' : '';
  cs.fontWeight = t.bold ? '700' : '';
  cs.fontStyle = t.italic ? 'italic' : '';
  cs.textDecoration = t.underline ? 'underline' : '';
  cs.lineHeight = t.leading ? String(t.leading) : '';
  if (t.ps != null) cs.setProperty('--ps', t.ps + 'em'); else cs.removeProperty('--ps');
  c.spellcheck = view.spell;
  cs.padding = t.padding + 'mm';
  cs.textAlign = t.align;
  const cols = t.type === 'text' && t.cols > 1 ? t.cols : 0;
  cs.columnCount = cols ? String(cols) : '';
  cs.columnGap = cols ? innerGutter(doc, t) + 'mm' : '';
  el.classList.toggle('has-cols', !!cols);

  if (isSection(t)) { el.classList.remove('overflow'); return; }
  if (t.type === 'image') {
    const key = 'img|' + t.fit + '|' + t.src;
    if (el.contentKey !== key) {
      el.contentKey = key;
      if (t.src) {
        c.innerHTML = '<img alt="">';
        const img = c.firstChild as HTMLImageElement;
        img.src = t.src;
        img.style.objectFit = t.fit;
      } else {
        c.innerHTML = '<div class="placeholder">Drop an image here, or press Enter to choose one</div>';
      }
    }
    el.classList.remove('overflow');
  } else {
    if (view.editing !== t.id && el.contentKey !== 'txt|' + t.html) {
      el.contentKey = 'txt|' + t.html;
      c.innerHTML = t.html;
    }
    el.classList.toggle('overflow', view.showOverflow && (c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1));
  }
}

/** Forget what a tile's content shows, so the next render rebuilds it. */
export function invalidateContent(id: string): void {
  const el = els.get(id);
  if (el) el.contentKey = null;
}

/** Largest font size (0.5 pt steps) at which a text tile's text fits its height. */
export function fittingFontSize(t: Tile): number | null {
  const c = contentEl(t.id);
  if (!c) return null;
  let lo = 2, hi = 600;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    c.style.fontSize = mid + 'pt';
    if (c.scrollHeight <= c.clientHeight + 1) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 2) / 2;
}

/** Snap guide lines and the draft rectangle while drawing. */
export function showGuides(xs: number[] = [], ys: number[] = [], draft: { x: number; y: number; w: number; h: number } | null = null): void {
  let html = xs.map((x) => `<div class="guide v" style="left:${x}mm"></div>`).join('') +
    ys.map((y) => `<div class="guide h" style="top:${y}mm"></div>`).join('');
  if (draft) html += `<div class="draft" style="left:${draft.x}mm;top:${draft.y}mm;width:${draft.w}mm;height:${draft.h}mm"></div>`;
  dom.guides.innerHTML = html;
}
