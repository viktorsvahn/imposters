/* Drawing the paper and the tile tree (each tile is a DOM element; nested
   tiles live in their parent's .kids layer). */

import { HANDLES, PX } from '../constants';
import { editor, scopeOrigin, type ViewState } from '../editor/store';
import { bleedSides } from '../layout/bleed';
import { frameOf } from '../layout/level';
import { columnsOf } from '../layout/snap';
import { borderOf, fontCss, paddingOf, resolveBg, resolveText } from '../model/design';
import { isSection, findTile } from '../model/tree';
import type { Design, Doc, Tile } from '../model/types';
import { assetUrl } from '../project/backend';
import { isPlotSrc, plotRevision, plotSvg } from './plot-svg';
import { dom } from './dom';

const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

export interface TileElement extends HTMLDivElement {
  content: HTMLDivElement;
  kids: HTMLDivElement;
  bleed: HTMLDivElement;
  /** the background image, if the tile has one */
  bgimg?: HTMLImageElement;
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

  renderWatermark(dom.paper, doc.design);
  renderTileTree(mainCtx(), dom.tiles, els);
}

/** What drawing tiles needs: the document, and the editing state shown on them. */
export interface RenderCtx {
  doc: Doc;
  view: Pick<ViewState, 'scope' | 'selected' | 'editing' | 'showOverflow' | 'spell'>;
}

const mainCtx = (): RenderCtx => ({ doc: editor.doc, view: editor.view });

/** Draw a document's tiles into a container, reusing the elements in `map` (the poster, or the master poster). */
export function renderTileTree(ctx: RenderCtx, container: HTMLElement, map: Map<string, TileElement>): void {
  const seen = new Set<string>();
  const renderList = (list: Tile[], box: HTMLElement, parent: Tile | null) => {
    list.forEach((t, i) => {
      let el = map.get(t.id);
      if (!el) { el = createTileEl(t); map.set(t.id, el); }
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
      updateTileEl(el, t, parent, ctx);
      seen.add(t.id);
      renderList(t.children || [], el.kids, t);
    });
    while (box.children.length > list.length) box.lastChild!.remove();
  };
  renderList(ctx.doc.tiles, container, null);
  for (const [id, el] of map) if (!seen.has(id)) { el.remove(); map.delete(id); }
}

/** The design's watermark: an image over the paper's colour, under every tile. */
export function renderWatermark(paper: HTMLElement, design: Design): void {
  const wm = design.brand.watermark;
  let img = paper.querySelector<HTMLImageElement>(':scope > .watermark');
  if (!wm) { img?.remove(); return; }
  if (!img) { img = Object.assign(document.createElement('img'), { className: 'watermark', alt: '' }); paper.prepend(img); }
  const url = assetUrl(wm.src);
  if (img.getAttribute('src') !== url) img.src = url;
  img.style.objectFit = wm.fit;
  img.style.opacity = String(wm.opacity);
}

/** The design's logos: in the poster's banner (one, on a side) and along its footer. */
function renderBrand(el: TileElement, t: Tile, parent: Tile | null, design: Design, pad: { x: number; y: number }): void {
  const b = design.brand;
  const logo = !parent && t.role === 'header' ? b.logo : null;
  const row = !parent && t.role === 'footer' && b.footerLogos.srcs.length ? b.footerLogos : null;
  let box = el.querySelector<HTMLDivElement>(':scope > .brand');
  if (!logo && !row) { box?.remove(); return; }
  if (!box) { box = document.createElement('div'); box.className = 'brand'; el.appendChild(box); }
  const srcs = logo ? [logo.src] : row!.srcs, key = srcs.join('|');
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML = srcs.map(() => '<img alt="">').join('');
    box.querySelectorAll('img').forEach((img, i) => { img.src = assetUrl(srcs[i]); });
  }
  const s = box.style;
  s.top = s.bottom = pad.y + 'mm';
  s.left = s.right = pad.x + 'mm';
  box.dataset.align = logo ? logo.side : row!.align;
  s.setProperty('--logo-h', (logo ? logo.h : row!.h) + 'mm');
  // the banner's text keeps clear of the logo (about as wide as it is tall, and a gap)
  if (logo) el.content.style[logo.side === 'right' ? 'paddingRight' : 'paddingLeft'] = pad.x + logo.h + 6 + 'mm';
}

let gridKey = '';
function renderGrid(): void {
  const f = frameOf(editor.doc, findTile(editor.doc, editor.view.scope));
  const key = [f.w, f.h, f.margin, f.gutter, f.gutterY, f.columns].join();
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
export function updateTileEl(el: TileElement, t: Tile, parent: Tile | null, ctx: RenderCtx = mainCtx()): void {
  const { doc, view } = ctx, design = doc.design;
  const s = el.style;
  s.left = t.x + 'mm'; s.top = t.y + 'mm'; s.width = t.w + 'mm'; s.height = t.h + 'mm';

  // background, possibly bleeding past the margin
  const bg = resolveBg(design, t.bg);
  const sides = t.bleed && (bg || t.bgImage) ? bleedSides(doc, t, parent) : null;
  s.background = sides ? 'transparent' : bg || 'transparent';
  // without a fill a tile would be invisible on the paper: the editor tints it (never printed or published)
  el.classList.toggle('nofill', !bg && !t.bgImage && !isSection(t));
  const b = el.bleed.style;
  b.display = sides ? 'block' : 'none';
  if (sides) {
    b.background = bg || 'transparent';
    b.left = -sides.l + 'mm'; b.top = -sides.t + 'mm';
    b.width = t.w + sides.l + sides.r + 'mm'; b.height = t.h + sides.t + sides.b + 'mm';
  }
  // a background image: behind the text, over the colour (on a bleeding tile, over what you see)
  if (t.bgImage) {
    const img = (el.bgimg ??= Object.assign(document.createElement('img'), { className: 'bgimg', alt: '' }));
    const host = sides ? el.bleed : el;
    if (img.parentElement !== host) host.prepend(img);
    const url = assetUrl(t.bgImage);
    if (img.getAttribute('src') !== url) img.src = url;
    img.style.objectFit = t.bgImageFit ?? 'cover';
    img.style.opacity = String(t.bgImageOpacity ?? 1);
  } else if (el.bgimg) { el.bgimg.remove(); el.bgimg = undefined; }

  // border: the tile's own, or the design's for its kind; on a bleeding tile around what you see
  const bd = borderOf(design, t, parent);
  const bc = (bd.c && bd.c[0] === '@' ? resolveBg(design, bd.c) || resolveText(design, bd.c) : bd.c) || '#1a1a1a';
  const onBleed = !!sides, boxStyle = onBleed ? b : s;
  s.borderRadius = b.borderRadius = bd.radius + 'mm';
  for (const [k, side] of [['t', 'Top'], ['r', 'Right'], ['b', 'Bottom'], ['l', 'Left']] as const) {
    const line = bd.w > 0 && bd.sides.includes(k) ? `${bd.w}mm solid ${bc}` : 'none';
    boxStyle[`border${side}`] = line;
    (onBleed ? s : b)[`border${side}`] = 'none';
  }
  const bw = onBleed ? 0 : bd.w > 0 ? bd.w : 0, bsides = bd.sides;
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
  cs.fontFamily = fontCss(t.font);
  cs.fontSize = t.fontSize ? t.fontSize + 'pt' : '';
  cs.fontWeight = t.bold ? '700' : '';
  cs.fontStyle = t.italic ? 'italic' : '';
  cs.textDecoration = t.underline ? 'underline' : '';
  cs.lineHeight = t.leading ? String(t.leading) : '';
  if (t.ps != null) cs.setProperty('--ps', t.ps + 'em'); else cs.removeProperty('--ps');
  c.spellcheck = view.spell;
  const pad = paddingOf(design, t); // the space around the text: the tile's own, or the design's
  cs.padding = `${pad.y}mm ${pad.x}mm`;
  renderBrand(el, t, parent, design, pad);
  cs.textAlign = t.align;
  cs.hyphens = t.hyphens ? 'auto' : '';
  const cols = t.type === 'text' && t.cols > 1 ? t.cols : 0, across = !!cols && t.flow === 'across';
  const colGap = (t.gutter ?? doc.paper.gutter) + 'mm'; // text columns keep a gap
  cs.columnCount = cols && !across ? String(cols) : '';
  cs.columnGap = cols && !across ? colGap : '';
  // lists across: row by row (1 2 / 3 4); other text spans the tile
  if (across) { c.dataset.flow = 'across'; cs.setProperty('--cols', String(cols)); cs.setProperty('--colgap', colGap); }
  else { delete c.dataset.flow; cs.removeProperty('--cols'); cs.removeProperty('--colgap'); }
  el.classList.toggle('has-cols', !!cols);

  if (isSection(t)) { el.classList.remove('overflow'); return; }
  if (t.type === 'image') {
    const plot = isPlotSrc(t.src);
    const key = plot ? `plot|${t.src}|${plotRevision()}` : 'img|' + t.fit + '|' + t.src;
    if (el.contentKey !== key) {
      el.contentKey = key;
      if (plot) {
        // inline, so hovering shows the data behind each mark
        const svg = plotSvg(t.src);
        c.innerHTML = svg ? `<div class="plot-svg">${svg}</div>` : `<div class="placeholder">${svg === '' ? 'Plot picture missing' : 'Loading plot…'}</div>`;
      } else if (t.src) {
        c.innerHTML = '<img alt="">';
        const img = c.firstChild as HTMLImageElement;
        img.src = assetUrl(t.src);
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
