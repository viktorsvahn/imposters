'use strict';

/* =========================================================================
   Tiles — a tile-based layout editor.
   All geometry is stored in millimetres; the paper is rendered at true CSS
   size (mm) and zoomed with a transform, so printing is 1:1.
   ========================================================================= */

const PX = 96 / 25.4;   // CSS px per mm
const MIN = 5;          // smallest tile edge (mm)
const EPS = 0.01;
const SIZES = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297],
  Letter: [215.9, 279.4], Tabloid: [279.4, 431.8], Slide: [254, 142.9],
};
const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
const HANDLES = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
const STORE_KEY = 'tiles-editor-doc';

const $ = (s) => document.querySelector(s);
const stage = $('#stage'), sizer = $('#sizer'), paperEl = $('#paper');
const tilesEl = $('#tiles'), guidesEl = $('#guides'), gridEl = $('#grid'), hoverEl = $('#hover');

const state = { zoom: 1, parts: 2, scope: null, showOverflow: false, spell: false, selected: new Set(), editing: null, snap: true, drag: null, imageTarget: null };
const hist = { stack: [], idx: -1 };
const els = new Map();  // tile id -> element
let doc;

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
const round = (v) => Math.round(v * 10) / 10;
const selectedTiles = () => T().filter((t) => state.selected.has(t.id));

/* ---- the tile tree. Tiles may hold child tiles (`children`), positioned
   relative to their parent. The editor works inside one "scope" at a time:
   the paper, or a tile you have entered. T() and F() are the scope's tiles and
   frame (size, inner margin, gutter); all layout tools work on those. */
function walk(list, fn, parent = null) {
  for (const t of list) {
    fn(t, parent);
    if (t.children) walk(t.children, fn, t);
  }
}
function byId(id) {
  let r = null;
  walk(doc.tiles, (t) => { if (t.id === id) r = t; });
  return r;
}
function parentOf(id) {
  let r = null;
  walk(doc.tiles, (t, p) => { if (t.id === id) r = p; });
  return r;
}
const insetOf = (t) => t.inset ?? 0;
const isSection = (t) => !!(t && t.children && t.children.length);
const scopeTile = () => (state.scope ? byId(state.scope) : null);
const innerGutter = (t) => (t.gutter ?? doc.paper.gutter);
function T() {
  const s = scopeTile();
  return s ? (s.children || (s.children = [])) : doc.tiles;
}
function setT(list) {
  const s = scopeTile();
  if (s) s.children = list; else doc.tiles = list;
}
function F() {
  const s = scopeTile();
  if (!s) return doc.paper;
  return { w: s.w, h: s.h, margin: s.inset || 0, gutter: innerGutter(s), columns: 0 };
}
/* Absolute position (on the paper) of a tile's top-left corner. */
function originOf(t) {
  let x = 0, y = 0;
  for (let c = t; c; c = parentOf(c.id)) { x += c.x; y += c.y; }
  return { x, y };
}
const scopeOrigin = () => (scopeTile() ? originOf(scopeTile()) : { x: 0, y: 0 });
function firstLeaf(t) {
  while (isSection(t)) t = t.children[0];
  return t;
}

/* ---------------------------------------------------------------- document */

function makeTile(type, props = {}) {
  const base = Math.max(9, Math.round(doc.paper.w / 25));
  return Object.assign({
    id: uid(), type, x: 0, y: 0, w: 100, h: 80,
    html: '', src: '', fit: 'cover',
    bg: '@tile', color: '', ts: '',
    font: '', fontSize: null, padding: type === 'image' ? 0 : Math.round(base / 3),
    radius: 0, borderW: 0, borderC: '#1a1a1a', borderSides: 'trbl', align: 'left', vAlign: 'top',
    cols: 1, inset: 0, gutter: null, bleed: false,
  }, props);
}

function newDoc() {
  doc = {
    version: 1,
    paper: { size: 'A1', orientation: 'portrait', w: 594, h: 841, margin: 20, gutter: 10, columns: 0, bg: '@paper' },
    tiles: [],
    design: defaultDesign(),
  };
  const p = doc.paper;
  // header and footer: ordinary tiles whose background bleeds to the paper edge
  doc.tiles.push(makeTile('text', {
    role: 'header', x: p.margin, y: 0, w: p.w - 2 * p.margin, h: 120, bleed: true, padding: 0,
    html: '<div data-ts="title">Poster title</div><div data-ts="subtitle">Authors · Affiliation</div>',
    bg: '@header', color: '@header', align: 'center', vAlign: 'middle',
  }));
  doc.tiles.push(makeTile('text', {
    role: 'footer', x: p.margin, y: p.h - 40, w: p.w - 2 * p.margin, h: 40, bleed: true, padding: 0,
    html: '', bg: '@footer', color: '@footer', vAlign: 'middle',
  }));
}

function loadDoc(d) {
  if (!d || !d.paper || !Array.isArray(d.tiles)) throw new Error('Not a Tiles document');
  doc = d;
  const fix = (t) => {
    const n = makeTile(t.type || 'text', t);
    if (n.children) n.children = n.children.map(fix);
    return n;
  };
  doc.tiles = doc.tiles.map(fix);
  doc.design = normalizeDesign(doc.design);
  state.scope = null;
  state.selected.clear();
  state.editing = null;
}

/* ---------------------------------------------------------------- history */

function commit() {
  normalize();
  const s = JSON.stringify(doc);
  if (hist.stack[hist.idx] === s) return;
  hist.stack = hist.stack.slice(0, hist.idx + 1);
  hist.stack.push(s);
  if (hist.stack.length > 200) hist.stack.shift();
  hist.idx = hist.stack.length - 1;
  autosave(s);
}

function restore(i) {
  hist.idx = i;
  doc = JSON.parse(hist.stack[i]);
  if (state.scope && !byId(state.scope)) state.scope = null;
  state.selected = new Set([...state.selected].filter(byId));
  state.editing = null;
  updateFormatBar();
  autosave(hist.stack[i]);
  render();
  if (!$('#tabDesign').hidden) renderDesignTab();
}
const undo = () => hist.idx > 0 && restore(hist.idx - 1);
const redo = () => hist.idx < hist.stack.length - 1 && restore(hist.idx + 1);

let saveWarned = false;
function autosave(s) {
  try { localStorage.setItem(STORE_KEY, s); saveWarned = false; }
  catch {
    if (!saveWarned) toast('Autosave failed (document too large) — use Save to keep your work');
    saveWarned = true;
  }
}

/* ---------------------------------------------------------------- geometry */

function columnsOf(p) {
  if (!p.columns) return [];
  const cw = (p.w - 2 * p.margin - (p.columns - 1) * p.gutter) / p.columns;
  if (cw <= 0) return [];
  return Array.from({ length: p.columns }, (_, i) => {
    const s = p.margin + i * (cw + p.gutter);
    return [s, s + cw];
  });
}

/* Snap lines. Each has a kind: s = start edge (left/top), e = end edge, c = centre.
   Neighbour tiles contribute both "aligned" lines and "one gutter away" lines. */
function targets(exclude) {
  const p = F(), g = p.gutter, m = p.margin;
  const X = [], Y = [];
  const add = (arr, v, k) => arr.push({ v, k });
  for (const [arr, size] of [[X, p.w], [Y, p.h]]) {
    add(arr, 0, 's'); add(arr, size, 'e');
    add(arr, m, 's'); add(arr, size - m, 'e'); add(arr, size / 2, 'c');
  }
  for (const [a, b] of columnsOf(p)) { add(X, a, 's'); add(X, b, 'e'); }
  for (const t of T()) {
    if (exclude.has(t.id)) continue;
    for (const [arr, pos, len] of [[X, t.x, t.w], [Y, t.y, t.h]]) {
      add(arr, pos, 's'); add(arr, pos + len, 'e'); add(arr, pos + len / 2, 'c');
      add(arr, pos + len + g, 's'); add(arr, pos - g, 'e');
    }
  }
  return { X, Y };
}

/* edges: {s?, e?, c?} -> the smallest correction that lands one edge on a matching line */
function snapAxis(edges, lines, thr) {
  let best = null;
  for (const [k, v] of Object.entries(edges)) {
    for (const l of lines) {
      if (l.k !== k) continue;
      const d = l.v - v;
      if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best ?? 0;
}

function matchedLines(edges, lines) {
  const out = new Set();
  for (const [k, v] of Object.entries(edges)) {
    for (const l of lines) if (l.k === k && Math.abs(l.v - v) < 0.05) out.add(l.v);
  }
  return [...out];
}

const edgesOf = (pos, len) => ({ s: pos, e: pos + len, c: pos + len / 2 });
const overlaps = (a1, a2, b1, b2) => a1 < b2 - EPS && b1 < a2 - EPS;

/* Grow a tile in one direction until it meets a neighbour (minus gutter) or the margin. */
function expand(t, dir) {
  const p = F(), g = p.gutter, m = p.margin;
  const others = T().filter((o) => o !== t);
  const rowMates = others.filter((o) => overlaps(o.y, o.y + o.h, t.y, t.y + t.h));
  const colMates = others.filter((o) => overlaps(o.x, o.x + o.w, t.x, t.x + t.w));
  if (dir === 'left') {
    let lim = m;
    for (const o of rowMates) if (o.x + o.w <= t.x + EPS) lim = Math.max(lim, o.x + o.w + g);
    if (lim < t.x) { t.w += t.x - lim; t.x = lim; }
  } else if (dir === 'right') {
    let lim = p.w - m;
    for (const o of rowMates) if (o.x >= t.x + t.w - EPS) lim = Math.min(lim, o.x - g);
    if (lim > t.x + t.w) t.w = lim - t.x;
  } else if (dir === 'up') {
    let lim = m;
    for (const o of colMates) if (o.y + o.h <= t.y + EPS) lim = Math.max(lim, o.y + o.h + g);
    if (lim < t.y) { t.h += t.y - lim; t.y = lim; }
  } else if (dir === 'down') {
    let lim = p.h - m;
    for (const o of colMates) if (o.y >= t.y + t.h - EPS) lim = Math.min(lim, o.y - g);
    if (lim > t.y + t.h) t.h = lim - t.y;
  }
}

function fillTile(t) {
  for (const d of ['left', 'right', 'up', 'down']) expand(t, d);
}

/* Largest empty rectangle inside the margins that keeps a gutter to every tile.
   Its left/right edges must lie on a margin or a tile edge + gutter, so we try
   every such pair and sweep the blocked vertical intervals for gaps. */
function largestFree(at = null) {
  const { w: W, h: H, margin: m, gutter: g } = F();
  const ts = T();
  const Ls = [m, ...ts.map((t) => t.x + t.w + g)];
  const Rs = [W - m, ...ts.map((t) => t.x - g)];
  let best = null;
  for (const l of Ls) {
    for (const r of Rs) {
      if (r - l < MIN || l < m - EPS || r > W - m + EPS) continue;
      if (at && (at.x < l || at.x > r)) continue;
      const blocked = ts.filter((t) => t.x < r - EPS && t.x + t.w > l + EPS)
        .map((t) => [t.y - g, t.y + t.h + g])
        .sort((a, b) => a[0] - b[0]);
      let cur = m;
      const gaps = [];
      for (const [a, b] of blocked) {
        if (a > cur) gaps.push([cur, a]);
        cur = Math.max(cur, b);
      }
      gaps.push([cur, H - m]);
      for (const [a, b] of gaps) {
        const h = Math.min(b, H - m) - a;
        if (h < MIN) continue;
        if (at && (at.y < a || at.y > a + h)) continue;
        const area = (r - l) * h;
        if (!best || area > best.area + EPS) best = { x: l, y: a, w: r - l, h, area };
      }
    }
  }
  return best;
}

/* ---------------------------------------------------------------- reflow */

/* Re-lay out a container's children along one axis when its frame changes
   (o = old {size, m, g}, n = new). Child edges split the inner box into
   intervals; intervals that are a gutter between two children stay one gutter
   wide, everything else (tiles and deliberate negative space) stretches. */
function reflowAxis(kids, A, o, n) {
  if (!kids.length) return;
  const lo = o.lo ?? o.m, hi = o.hi ?? o.size - o.m, nlo = n.lo ?? n.m, nhi = n.hi ?? n.size - n.m;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const starts = kids.map((k) => k[A.p]), ends = kids.map((k) => k[A.p] + k[A.l]);
  const E = [...new Set([lo, hi, ...starts, ...ends].map(r3))]
    .filter((v) => v >= lo - EPS && v <= hi + EPS).sort((a, b) => a - b);
  const near = (arr, v) => arr.some((a) => Math.abs(a - v) < 0.01);
  const ivs = [];
  for (let i = 0; i + 1 < E.length; i++) {
    const a = E[i], b = E[i + 1];
    const gutter = Math.abs(b - a - o.g) < 0.05 && near(ends, a) && near(starts, b);
    const band = A.p === 'y' && kids.some((k) => k.role && k.y <= a + EPS && k.y + k.h >= b - EPS);
    ivs.push({ len: b - a, fixed: gutter || band, keep: band });
  }
  const S = ivs.reduce((s, iv) => s + (iv.fixed ? 0 : iv.len), 0);
  const fixedLen = ivs.reduce((s, iv) => s + (iv.keep ? iv.len : iv.fixed ? n.g : 0), 0);
  const k = S > EPS ? Math.max(0, nhi - nlo - fixedLen) / S : 1;
  const NE = [nlo];
  ivs.forEach((iv, i) => NE.push(NE[i] + (iv.keep ? iv.len : iv.fixed ? n.g : iv.len * k)));
  const map = (v) => {
    if (v < lo - EPS) return v - lo + nlo;
    if (v > hi + EPS) return v - hi + nhi;
    let best = 0;
    E.forEach((e, j) => { if (Math.abs(e - v) < Math.abs(E[best] - v)) best = j; });
    return NE[best];
  };
  for (const kd of kids) {
    const a = map(kd[A.p]), b = map(kd[A.p] + kd[A.l]);
    kd[A.p] = a;
    kd[A.l] = Math.max(0.1, b - a);
  }
}

/* Containers remember the frame their children were laid out for (lw, lh, li,
   lg). Whenever that differs from the current one, reflow — so every tool that
   resizes a tile (drags, cuts, fills, inspector) keeps nested layouts intact. */
function normalize() {
  walk(doc.tiles, (t) => {
    if (!isSection(t)) return;
    const cur = { w: t.w, h: t.h, m: t.inset || 0, g: innerGutter(t) };
    if (t.lw == null) Object.assign(t, { lw: cur.w, lh: cur.h, li: cur.m, lg: cur.g });
    if ([t.lw - cur.w, t.lh - cur.h, t.li - cur.m, t.lg - cur.g].every((d) => Math.abs(d) < 1e-6)) return;
    reflowAxis(t.children, AX.x, { size: t.lw, m: t.li, g: t.lg }, { size: cur.w, m: cur.m, g: cur.g });
    reflowAxis(t.children, AX.y, { size: t.lh, m: t.li, g: t.lg }, { size: cur.h, m: cur.m, g: cur.g });
    Object.assign(t, { lw: cur.w, lh: cur.h, li: cur.m, lg: cur.g });
  });
}

/* ---------------------------------------------------------------- headers & footers */

/* The layout frame of a container (a tile, or null for the paper). */
function frameOf(c) {
  const P = doc.paper;
  return c ? { list: c.children || (c.children = []), w: c.w, h: c.h, m: insetOf(c), g: innerGutter(c) }
    : { list: doc.tiles, w: P.w, h: P.h, m: P.margin, g: P.gutter };
}
const bandOf = (c, role) => (c && !c.children ? null : frameOf(c).list.find((t) => t.role === role));

/* A header/footer is a tile pinned to the top/bottom of its container, full
   width, bleeding past the container's margin. Adding one makes room by
   reflowing the other tiles; removing it gives the space back. */
function toggleBand(c, role, on) {
  const f = frameOf(c), list = f.list, lo = f.m, hi = f.h - f.m, g = f.g;
  const band = list.find((t) => t.role === role);
  if (on === !!band) return;
  const others = list.filter((t) => t !== band);
  const top = role === 'header';
  if (on) {
    // the band sits on the top/bottom edge itself (no top/bottom margin)
    const hh = Math.max(12, round((hi - lo) * (top ? 0.12 : 0.08)));
    reflowAxis(others, AX.y, { lo, hi, g }, { lo: top ? Math.max(lo, hh + g) : lo, hi: top ? hi : Math.min(hi, f.h - hh - g), g });
    // coloured by the design's (tile) header/footer role — none by default inside tiles
    const t = makeTile('text', {
      role, bleed: true, x: f.m, w: f.w - 2 * f.m, y: top ? 0 : f.h - hh, h: hh,
      bg: '@' + (c ? 'tile' : '') + (c ? (top ? 'Header' : 'Footer') : role),
      color: '@' + (c ? 'tile' : '') + (c ? (top ? 'Header' : 'Footer') : role), vAlign: 'middle',
    });
    if (top) list.unshift(t); else list.push(t);
    if ((c ? c.id : null) === state.scope) state.selected = new Set([t.id]);
  } else {
    list.splice(list.indexOf(band), 1);
    const was = top ? { lo: band.y + band.h + g, hi } : { lo, hi: band.y - g };
    reflowAxis(others, AX.y, { ...was, g }, { lo, hi, g });
    state.selected.delete(band.id);
  }
  commit(); render();
}

/* ---------------------------------------------------------------- scopes */

/* A new tile at the current level (inside a tile, it takes that tile's fill). */
function newTile(type, props) {
  const s = scopeTile();
  const style = !s || type !== 'text' ? {}
    : s.bleed ? { bg: '', color: s.color }
    : s.innerBg !== undefined ? { bg: s.innerBg } : {};
  return makeTile(type, { ...style, ...props });
}

const hasContent = (t) => !!(t.src || (t.html || '').replace(/<[^>]*>|&nbsp;/g, '').trim());

/* Go into a tile to create tiles inside it, just like on the paper. An empty
   tile gives empty space; a tile with content gets that content as its first
   sub-tile (which can then be cut). Leaving without changes undoes this. */
/* What a plain tile's content consists of (moved into / out of a sub-tile). */
const CONTENT_KEYS = ['type', 'html', 'src', 'fit', 'bg', 'color', 'font', 'fontSize', 'padding', 'align', 'vAlign',
  'cols', 'ts', 'bold', 'italic', 'underline', 'leading', 'ps'];

/* Turn a plain tile into a container. Its content (if any) becomes the first
   sub-tile. An empty tile's fill moves to the tiles created inside so gutters
   show through — unless keepBg (or it bleeds: that background must stay). */
function makeContainer(t, keepBg = false) {
  if (isSection(t)) return;
  const keep = keepBg || t.bleed;
  if (!hasContent(t)) {
    Object.assign(t, { children: [], lw: null }, keep ? {} : { innerBg: t.bg, bg: '' });
    return;
  }
  const m = insetOf(t);
  const child = makeTile(t.type, Object.fromEntries(CONTENT_KEYS.map((k) => [k, t[k]])));
  Object.assign(child, { x: m, y: m, w: t.w - 2 * m, h: t.h - 2 * m });
  if (keep) child.bg = '';
  Object.assign(t, { type: 'text', html: '', src: '', ts: '', children: [child], lw: null }, keep ? {} : { bg: '' });
}

function enterTile(t) {
  if (!t) return;
  if (state.editing) stopEditing();
  makeContainer(t);
  state.scope = t.id;
  state.selected = new Set();
  commit(); render(); refreshHover();
}

function exitScope(to) {
  const s = scopeTile();
  if (!s) return;
  if (state.editing) stopEditing();
  const up = parentOf(s.id);
  state.scope = to !== undefined ? to : up ? up.id : null;
  // a container that was entered but never divided turns back into a plain tile
  const m = s.inset || 0, only = s.children && s.children.length === 1 && s.children[0];
  if (only && !isSection(only) && Math.abs(only.x - m) < EPS && Math.abs(only.y - m) < EPS &&
      Math.abs(only.w - (s.w - 2 * m)) < EPS && Math.abs(only.h - (s.h - 2 * m)) < EPS) {
    for (const k of CONTENT_KEYS) if (!(s.bleed && k === 'bg')) s[k] = only[k];
    delete s.children;
  }
  if (s.children && !s.children.length) {
    delete s.children;
    if (s.innerBg !== undefined && !s.bg) s.bg = s.innerBg;
  }
  state.selected = state.scope === (up ? up.id : null) ? new Set([s.id]) : new Set();
  commit(); render(); refreshHover();
}

/* The element of the tile in the current scope that contains `target`
   (null for the scope's own background or anything outside it). */
function scopeEl(target) {
  let el = target && target.closest ? target.closest('.tile') : null;
  while (el) {
    const p = parentOf(el.dataset.id);
    if ((p ? p.id : null) === state.scope) return el;
    el = el.parentElement && el.parentElement.closest('.tile');
  }
  return null;
}

function crumbLabel(t) {
  const leaf = firstLeaf(t);
  const div = document.createElement('div');
  div.innerHTML = leaf.html || '';
  const s = [...div.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(' · ');
  return s ? (s.length > 18 ? s.slice(0, 17) + '…' : s) : 'Section';
}

/* ---------------------------------------------------------------- seams & cutting */

/* Axis helpers: a cut/seam "along x" sits at an x position (vertical line). */
const AX = {
  x: { p: 'x', l: 'w', cp: 'y', cl: 'h', size: 'w' },
  y: { p: 'y', l: 'h', cp: 'x', cl: 'w', size: 'h' },
};

/* A seam is the gutter under a point: the tiles ending just before it (L) and
   starting just after it (R), over one contiguous span (a..b). Dragging it
   resizes both sides. A seam against the margin has only one side. */
function seamAt(pt) {
  const P = F(), g = P.gutter, tol = Math.max(g / 2, 4 / (PX * state.zoom));
  const near = (a, b) => Math.abs(a - b) < 0.5;
  let best = null;
  for (const axis of ['x', 'y']) {
    const A = AX[axis], v = pt[axis], q = pt[A.cp], size = P[A.size];
    const centers = new Set();
    for (const t of T()) {
      centers.add(t[A.p] - g / 2);
      centers.add(t[A.p] + t[A.l] + g / 2);
    }
    for (const c of centers) {
      const lo = c - g / 2, hi = c + g / 2;
      const outerBefore = near(hi, P.margin), outerAfter = near(lo, size - P.margin);
      const dist = Math.abs(v - c);
      const inZone = dist <= tol || (outerBefore && v >= 0 && v <= hi) || (outerAfter && v >= lo && v <= size);
      if (!inZone || (best && dist >= best.dist)) continue;

      const Ls = T().filter((t) => near(t[A.p] + t[A.l], lo));
      const Rs = T().filter((t) => near(t[A.p], hi));
      const group = [...Ls, ...Rs];
      const inc = new Set(group.filter((t) => t[A.cp] <= q && q <= t[A.cp] + t[A.cl]));
      if (!inc.size) continue;
      let a = Math.min(...[...inc].map((t) => t[A.cp]));
      let b = Math.max(...[...inc].map((t) => t[A.cp] + t[A.cl]));
      for (let grew = true; grew;) {
        grew = false;
        for (const t of group) {
          if (inc.has(t) || t[A.cp] >= b - EPS || t[A.cp] + t[A.cl] <= a + EPS) continue;
          inc.add(t);
          a = Math.min(a, t[A.cp]);
          b = Math.max(b, t[A.cp] + t[A.cl]);
          grew = true;
        }
      }
      const L = Ls.filter((t) => inc.has(t)), R = Rs.filter((t) => inc.has(t));
      if ((!L.length && !outerBefore) || (!R.length && !outerAfter)) continue;
      best = { axis, c, lo, hi, a, b, dist, L: L.map((t) => t.id), R: R.map((t) => t.id) };
    }
  }
  return best;
}

/* The tile edge under the pointer (Shift mode). Reaches a little into the tile
   and out into the gutter / margin beside it. */
function edgeAt(pt) {
  const P = F(), g = P.gutter, inner = 14 / (PX * state.zoom);
  let best = null;
  for (const t of T()) {
    if (t.id === state.editing) continue;
    const r = t.x + t.w, b = t.y + t.h;
    const sides = [
      ['left', pt.x - t.x, pt.y, t.y, b, t.x <= P.margin + EPS ? t.x : g / 2],
      ['right', r - pt.x, pt.y, t.y, b, r >= P.w - P.margin - EPS ? P.w - r : g / 2],
      ['top', pt.y - t.y, pt.x, t.x, r, t.y <= P.margin + EPS ? t.y : g / 2],
      ['bottom', b - pt.y, pt.x, t.x, r, b >= P.h - P.margin - EPS ? P.h - b : g / 2],
    ];
    for (const [side, d, q, q0, q1, outer] of sides) {
      if (q < q0 || q > q1 || d > inner || d < -Math.max(outer, EPS)) continue;
      if (!best || Math.abs(d) < best.dist) best = { id: t.id, side, dist: Math.abs(d), q };
    }
  }
  return best;
}

/* Cutting from an edge: a + on the left/right edge cuts the tile into upper and
   lower parts; a + on the top/bottom edge cuts it into left and right parts.
   The cut sits at the pointer's position along the edge and snaps to ½ ⅓ ¼ of
   the tile and to lines continuing other tiles' edges. `c` is the centre of
   the new gutter. With `wide`, every tile the line crosses is cut. */
function cutPlan(edge, wide, snap, equal = false) {
  const t = byId(edge.id), g = F().gutter;
  const ax = edge.side === 'left' || edge.side === 'right' ? 'y' : 'x';
  const A = AX[ax];
  const range = (o) => [o[A.p] + MIN + g / 2, o[A.p] + o[A.l] - MIN - g / 2];
  const crossed = (cs) => {
    const ids = wide
      ? T().filter((o) => { const [a, b] = range(o); return cs.every((c) => c >= a - EPS && c <= b + EPS); }).map((o) => o.id)
      : [t.id];
    if (!ids.includes(t.id)) ids.push(t.id);
    return ids;
  };

  if (equal) {
    const cs = equalCuts(t, ax, Math.max(2, state.parts));
    return cs && { ax, cs, ids: crossed(cs), label: '', guide: null, edge, equal: true };
  }

  const [lo, hi] = range(t);
  if (hi < lo) return null;
  let c = Math.min(hi, Math.max(lo, edge.q)), label = '', guide = null;

  if (snap) {
    const band = bandAround(t);
    const cands = band ? bandSnaps(t, band, ax, g) : [['¼', 1 / 4], ['⅓', 1 / 3], ['½', 1 / 2], ['⅔', 2 / 3], ['¾', 3 / 4]]
      .map(([l, f]) => ({ c: t[A.p] + f * (t[A.l] - g) + g / 2, label: l, guide: null }));
    const lines = band ? [] : T().filter((o) => o !== t).map((o) => [o[A.p], o[A.p] + o[A.l]]);
    if (ax === 'x' && !band) lines.push(...columnsOf(F()));
    for (const [o0, o1] of lines) {
      cands.push({ c: o0 - g / 2, label: 'aligned', guide: o0 });  // second part starts with them
      cands.push({ c: o1 + g / 2, label: 'aligned', guide: o1 });  // first part ends with them
    }
    const thr = 8 / (PX * state.zoom);
    let best = null;
    for (const k of cands) {
      if (k.c < lo - EPS || k.c > hi + EPS) continue;
      const d = Math.abs(k.c - c);
      if (d > thr) continue;
      if (!best || d < best.d - EPS || (Math.abs(d - best.d) < EPS && k.guide === null)) best = { ...k, d };
    }
    if (best) ({ c, label, guide } = best);
  }

  return { ax, cs: [c], ids: crossed([c]), label, guide, edge };
}

/* The header/footer a tile is, or sits in (null elsewhere). */
function bandAround(t) {
  for (let c = t; c; c = parentOf(c.id)) if (c.role || c.inBand) return c;
  return null;
}

/* Cut snaps inside headers/footers: a square piece at either end (width =
   height, the logo slot), the tile's middle, and the band's own centre line. */
/* The area a tile visibly covers, on the paper: its own bleed, plus — where it
   touches the inner edge of a coloured tile it sits in — that tile's area. */
function visRect(t) {
  const p = parentOf(t.id), o = p ? originOf(p) : { x: 0, y: 0 };
  const r = { x0: o.x + t.x, y0: o.y + t.y, x1: o.x + t.x + t.w, y1: o.y + t.y + t.h };
  const s = t.bleed && resolveBg(t.bg) ? bleedSides(t, p) : null;
  if (s) { r.x0 -= s.l; r.y0 -= s.t; r.x1 += s.r; r.y1 += s.b; }
  if (p && resolveBg(p.bg)) {
    const pv = visRect(p), m = insetOf(p) + 0.5;
    if (t.x <= m) r.x0 = Math.min(r.x0, pv.x0);
    if (t.y <= m) r.y0 = Math.min(r.y0, pv.y0);
    if (t.x + t.w >= p.w - m) r.x1 = Math.max(r.x1, pv.x1);
    if (t.y + t.h >= p.h - m) r.y1 = Math.max(r.y1, pv.y1);
  }
  return r;
}

function bandSnaps(t, band, ax, g) {
  const A = AX[ax];
  // squares are measured on what you see (bleed included, margins ignored)
  const v = visRect(t), p = parentOf(t.id), o = p ? originOf(p) : { x: 0, y: 0 };
  const side = ax === 'x' ? v.y1 - v.y0 : v.x1 - v.x0;
  const lo = (ax === 'x' ? v.x0 : v.y0) - o[ax], hi = (ax === 'x' ? v.x1 : v.y1) - o[ax];
  const out = [
    { c: lo + side + g / 2, label: '■ square', guide: null },
    { c: hi - side - g / 2, label: 'square ■', guide: null },
    { c: t[A.p] + t[A.l] / 2, label: '½ middle', guide: null },
  ];
  if (band === t && t.inBand) {
    // a piece of a cut header: its container's centre (the poster's middle)
    const mid = F()[A.l === 'w' ? 'w' : 'h'] / 2;
    out.push({ c: mid, label: 'centre', guide: mid });
  } else if (band !== t) {
    // band centre in the coordinates of t's container
    const p = parentOf(t.id), po = p ? originOf(p) : { x: 0, y: 0 }, bo = originOf(band);
    const mid = bo[ax] + band[A.l] / 2 - po[ax];
    out.push({ c: mid, label: 'centre', guide: mid });
  }
  return out;
}

/* Gutter centres that divide a tile into n equal parts along an axis. */
function equalCuts(t, ax, n) {
  const A = AX[ax], g = F().gutter;
  const part = (t[A.l] - (n - 1) * g) / n;
  if (part < MIN) return null;
  return Array.from({ length: n - 1 }, (_, i) => t[A.p] + (i + 1) * (part + g) - g / 2);
}

/* Cut a tile at the given gutter centres; the first piece keeps the content. */
function cutTile(t, ax, cs) {
  // the tile's own container (not necessarily the level being edited)
  const parent = parentOf(t.id), list = parent ? parent.children : doc.tiles;
  const A = AX[ax], g = parent ? innerGutter(parent) : doc.paper.gutter;
  const end = t[A.p] + t[A.l];
  const created = [];
  let at = list.indexOf(t);
  t[A.l] = cs[0] - g / 2 - t[A.p];
  const proto = clone(firstLeaf(t));
  delete proto.children;
  // pieces of a header/footer aren't the header themselves, but still cut like one
  if (proto.role) { proto.inBand = proto.role; delete proto.role; }
  cs.forEach((c, i) => {
    const n = Object.assign(clone(proto), { id: uid(), html: '', src: '', x: t.x, y: t.y, w: t.w, h: t.h });
    n[A.p] = c + g / 2;
    n[A.l] = (i + 1 < cs.length ? cs[i + 1] - g / 2 : end) - n[A.p];
    list.splice(++at, 0, n);
    created.push(n.id);
  });
  return created;
}

/* Headers/footers are one coloured zone: cutting one divides its contents
   (transparent tiles inside it) instead of breaking the zone into pieces.
   cs are cut positions in the zone's container coordinates. */
function cutZone(z, ax, cs) {
  const A = AX[ax];
  if (!isSection(z)) {
    makeContainer(z, true);
    if (!z.children.length) {
      const m = insetOf(z);
      z.children.push(makeTile('text', { x: m, y: m, w: z.w - 2 * m, h: z.h - 2 * m, bg: '', color: z.color }));
    }
  }
  const local = cs.map((c) => c - z[A.p]);
  const out = [];
  for (const k of [...z.children]) {
    if (k.role) continue;
    const mine = local.filter((c) => c > k[A.p] + MIN && c < k[A.p] + k[A.l] - MIN);
    if (mine.length) out.push(...(isSection(k) ? cutZone(k, ax, mine.map((c) => c + k[A.p])) : cutTile(k, ax, mine)));
  }
  return out;
}

/* Cut a tile, or — for a header/footer — its contents. Returns the ids to select. */
function cutAny(t, ax, cs) {
  if (!t.role) return cutTile(t, ax, cs);
  return cutZone(t, ax, cs).length ? [t.id] : [];
}

function setParts(n) {
  state.parts = Math.min(12, Math.max(2, Math.round(n) || 2));
  $('#parts').value = state.parts;
  refreshHover();
}

function applyCut(plan) {
  const created = plan.ids.flatMap((id) => cutAny(byId(id), plan.ax, plan.cs));
  state.selected = new Set(created);
  commit(); render();
}

const boxHtml = (r, cls) => `<div class="${cls}" style="left:${r.x}mm;top:${r.y}mm;width:${r.w}mm;height:${r.h}mm"></div>`;
const plusHtml = (x, y, cls) => `<div class="plus ${cls}" style="left:${x}mm;top:${y}mm">+</div>`;

/* Hover state: what a click/drag at the pointer would do. Shift reveals the
   cut buttons; without it, seams can be dragged. */
function updateHover(e) {
  state.lastPointer = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey, altKey: e.altKey };
  const lp = state.lastPointer;
  let h = null;
  const target = document.elementFromPoint(lp.clientX, lp.clientY);
  if (!state.drag && target && paperEl.contains(target) && !target.dataset.handle &&
      !(state.editing && target.closest('.tile.editing'))) {
    const pt = toMM(lp);
    if (lp.shiftKey) {
      const edge = edgeAt(pt);
      // Shift: one free cut that snaps · Ctrl+Shift: equal parts (the Parts number)
      const plan = edge && cutPlan(edge, false, state.snap && !lp.altKey, lp.ctrlKey);
      if (plan) h = { type: 'cut', plan };
      else if (!edge && !scopeEl(target)) {
        const rect = largestFree(pt);
        if (rect) h = { type: 'free', rect };
      }
    } else {
      const seam = seamAt(pt);
      if (seam) h = { type: 'seam', seam };
    }
  }
  state.hover = h;
  showHover();
}

function refreshHover() {
  if (state.lastPointer) updateHover(state.lastPointer);
}

function showHover() {
  const h = state.hover, shift = state.lastPointer && state.lastPointer.shiftKey && !state.drag;
  let html = '', cursor = '', hint = '';
  if (shift) {
    // idle markers: the middle of every tile's right and bottom edge
    const g = F().gutter, room = 2 * MIN + g;
    for (const t of T()) {
      if (h && h.type === 'cut' && h.plan.edge.id === t.id) continue;
      if (t.h >= room) html += plusHtml(t.x + t.w, t.y + t.h / 2, 'idle');
      if (t.w >= room) html += plusHtml(t.x + t.w / 2, t.y + t.h, 'idle');
    }
  }
  if (h && h.type === 'cut') {
    const p = h.plan, A = AX[p.ax], g = F().gutter;
    for (const id of p.ids) {
      const t = byId(id), end = t[A.p] + t[A.l];
      p.cs.forEach((c, i) => {
        const piece = (i + 1 < p.cs.length ? p.cs[i + 1] - g / 2 : end) - c - g / 2;
        html += boxHtml({ [A.p]: c + g / 2, [A.l]: piece, [A.cp]: t[A.cp], [A.cl]: t[A.cl] }, 'preview');
        html += boxHtml({ [A.p]: c - g / 2, [A.l]: g, [A.cp]: t[A.cp], [A.cl]: t[A.cl] }, 'cutband');
      });
    }
    if (p.guide !== null) html += `<div class="guide ${p.ax === 'x' ? 'v' : 'h'}" style="${p.ax === 'x' ? 'left' : 'top'}:${p.guide}mm"></div>`;
    const t = byId(p.edge.id), e = p.edge.side;
    const at = e === 'left' ? t.x : e === 'right' ? t.x + t.w : e === 'top' ? t.y : t.y + t.h;
    const n = p.cs.length + 1;
    const q = p.equal ? Math.min(t[A.p] + t[A.l], Math.max(t[A.p], p.edge.q)) : p.cs[0];
    html += p.ax === 'y' ? plusHtml(at, q, '') : plusHtml(q, at, '');
    let text;
    if (p.equal) {
      text = `${n} × ${round((t[A.l] - (n - 1) * g) / n)} mm`;
    } else {
      const a = round(p.cs[0] - g / 2 - t[A.p]), b = round(t[A.p] + t[A.l] - p.cs[0] - g / 2);
      text = `${p.label ? p.label + ' · ' : ''}${a} | ${b} mm`;
    }
    const mid = p.equal ? t[A.p] + t[A.l] / 2 : p.cs[0];
    const lx = p.ax === 'y' ? t.x + t.w / 2 : mid, ly = p.ax === 'y' ? mid : t.y + t.h / 2;
    html += `<div class="splitlabel" style="left:${lx}mm;top:${ly}mm">${text}</div>`;
    cursor = 'on-plus';
    hint = p.equal
      ? `Click to split into ${n} equal parts · keys 2–9 change the number`
      : bandAround(t) ? 'Click to split here · header/footer: snaps to squares and middles · Ctrl+Shift: equal parts · Alt: no snapping'
      : 'Click to split here · snaps to ½ ⅓ ¼ and other tiles\' edges · Ctrl+Shift: equal parts · Alt: no snapping';
  } else if (h && h.type === 'free') {
    html += boxHtml(h.rect, 'preview') + plusHtml(h.rect.x + h.rect.w / 2, h.rect.y + h.rect.h / 2, '');
    cursor = 'on-plus';
    hint = 'Click to fill this space with a tile';
  } else if (h && h.type === 'seam') {
    const s = h.seam;
    const line = s.axis === 'x' ? { x: s.c, y: s.a, w: 0, h: s.b - s.a } : { x: s.a, y: s.c, w: s.b - s.a, h: 0 };
    html += boxHtml(line, 'seamline ' + (s.axis === 'x' ? 'v' : 'h'));
    cursor = 'seam-' + s.axis;
    hint = 'Drag to resize both sides · hold Shift to split tiles';
  } else if (shift) {
    hint = 'Point at a tile edge to split it there';
  }
  hoverEl.innerHTML = html;
  paperEl.classList.remove('seam-x', 'seam-y', 'on-plus');
  if (cursor) paperEl.classList.add(cursor);
  const hintEl = $('#hint');
  hintEl.textContent = hint;
  hintEl.classList.toggle('show', !!hint);
}

/* ---------------------------------------------------------------- rendering */

function render() {
  normalize();
  applyDesignCSS();
  const p = doc.paper, z = state.zoom;
  paperEl.style.width = p.w + 'mm';
  paperEl.style.height = p.h + 'mm';
  paperEl.style.background = resolveBg(p.bg) || '#ffffff';
  paperEl.style.transform = `scale(${z})`;
  paperEl.style.setProperty('--inv', 1 / z);
  sizer.style.width = p.w * PX * z + 80 + 'px';
  sizer.style.height = p.h * PX * z + 80 + 'px';
  paperEl.style.left = paperEl.style.top = '40px';
  $('#zoomLabel').textContent = Math.round(z * 100) + '%';

  // overlays (grid, guides, hover) live in the scope's coordinate system
  const f = F(), o = scopeOrigin(), layer = $('#scopeLayer').style;
  layer.left = o.x + 'mm'; layer.top = o.y + 'mm'; layer.width = f.w + 'mm'; layer.height = f.h + 'mm';
  paperEl.classList.toggle('scoped', !!state.scope);
  renderGrid();

  const seen = new Set();
  const renderList = (list, container, parent) => {
    list.forEach((t, i) => {
      let el = els.get(t.id);
      if (!el) { el = createTileEl(t); els.set(t.id, el); }
      if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
      updateTileEl(el, t, parent);
      seen.add(t.id);
      renderList(t.children || [], el._kids, t);
    });
    while (container.children.length > list.length) container.lastChild.remove();
  };
  renderList(doc.tiles, tilesEl, null);
  for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); }

  updateInspector();
  updateToolbar();
  updateFormatBar();
}

function renderGrid() {
  const p = F();
  const key = [p.w, p.h, p.margin, p.gutter, p.columns].join();
  if (gridEl._key === key) return;
  gridEl._key = key;
  let html = `<div class="marginbox" style="left:${p.margin}mm;top:${p.margin}mm;width:${p.w - 2 * p.margin}mm;height:${p.h - 2 * p.margin}mm"></div>`;
  for (const [a, b] of columnsOf(p)) {
    html += `<div class="col" style="left:${a}mm;width:${b - a}mm;top:${p.margin}mm;height:${p.h - 2 * p.margin}mm"></div>`;
  }
  gridEl.innerHTML = html;
}

/* How far a bleeding tile's background reaches past each side (mm). */
function bleedSides(t, parent) {
  const P = doc.paper;
  const [W, H, m] = parent ? [parent.w, parent.h, insetOf(parent)] : [P.w, P.h, P.margin];
  const out = {
    l: t.x <= m + 0.5 ? Math.max(0, t.x) : 0,
    t: t.y <= m + 0.5 ? Math.max(0, t.y) : 0,
    r: t.x + t.w >= W - m - 0.5 ? Math.max(0, W - t.x - t.w) : 0,
    b: t.y + t.h >= H - m - 0.5 ? Math.max(0, H - t.y - t.h) : 0,
  };
  return out.l || out.t || out.r || out.b ? out : null;
}

function createTileEl(t) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = t.id;
  el.innerHTML = '<div class="content"></div><div class="kids"></div><div class="bleed"></div>' +
    HANDLES.map((h) => `<div class="handle h-${h}" data-handle="${h}"></div>`).join('');
  el._kids = el.children[1];
  el._bleed = el.children[2];
  return el;
}

function updateTileEl(el, t, parent) {
  const s = el.style;
  s.left = t.x + 'mm'; s.top = t.y + 'mm'; s.width = t.w + 'mm'; s.height = t.h + 'mm';
  // Bleed: on every side where the tile reaches its frame's margin, the
  // background continues to the frame's outer edge (the paper edge on top level)
  const bg = resolveBg(t.bg);
  const sides = t.bleed && bg ? bleedSides(t, parent) : null;
  s.background = sides ? 'transparent' : bg || 'transparent';
  const b = el._bleed.style;
  b.display = sides ? 'block' : 'none';
  if (sides) {
    b.background = bg;
    b.left = -sides.l + 'mm'; b.top = -sides.t + 'mm';
    b.width = t.w + sides.l + sides.r + 'mm'; b.height = t.h + sides.t + sides.b + 'mm';
  }
  s.borderRadius = t.radius + 'mm';
  // borders: width, colour (design colour or custom) and which sides
  const bw = t.borderW > 0 ? t.borderW : 0, bsides = t.borderSides ?? 'trbl';
  const bc = (t.borderC && t.borderC[0] === '@' ? resolveBg(t.borderC) || resolveText(t.borderC) : t.borderC) || '#1a1a1a';
  for (const [k, side] of [['t', 'Top'], ['r', 'Right'], ['b', 'Bottom'], ['l', 'Left']]) {
    s['border' + side] = bw && bsides.includes(k) ? `${bw}mm solid ${bc}` : 'none';
  }
  s.justifyContent = VALIGN[t.vAlign] || 'flex-start';

  const live = (parent ? parent.id : null) === state.scope;
  const sel = live && state.selected.has(t.id);
  el.classList.toggle('live', live);
  el.classList.toggle('section', isSection(t));
  el.classList.toggle('scope', t.id === state.scope);
  el.classList.toggle('selected', sel);
  const k = el._kids.style;
  k.left = -(bsides.includes('l') ? bw : 0) + 'mm';
  k.top = -(bsides.includes('t') ? bw : 0) + 'mm';
  k.width = t.w + 'mm'; k.height = t.h + 'mm';
  el.classList.toggle('single', sel && state.selected.size === 1);
  el.classList.toggle('editing', state.editing === t.id);
  el.classList.toggle('is-image', t.type === 'image');

  const c = el.firstChild;
  // text: the tile's style (design) unless the tile overrides font/size/colour
  if (t.ts) c.dataset.ts = t.ts; else delete c.dataset.ts;
  c.style.color = resolveText(t.color);
  c.style.fontFamily = t.font ? FONTS[t.font] || '' : '';
  c.style.fontSize = t.fontSize ? t.fontSize + 'pt' : '';
  c.style.fontWeight = t.bold ? '700' : '';
  c.style.fontStyle = t.italic ? 'italic' : '';
  c.style.textDecoration = t.underline ? 'underline' : '';
  c.style.lineHeight = t.leading || '';
  if (t.ps != null) c.style.setProperty('--ps', t.ps + 'em'); else c.style.removeProperty('--ps');
  c.spellcheck = state.spell;
  c.style.padding = t.padding + 'mm';
  c.style.textAlign = t.align;
  const cols = t.type === 'text' && t.cols > 1 ? t.cols : 0;
  c.style.columnCount = cols || '';
  c.style.columnGap = cols ? innerGutter(t) + 'mm' : '';
  el.classList.toggle('has-cols', !!cols);
  if (isSection(t)) { el.classList.remove('overflow'); return; }
  if (t.type === 'image') {
    const key = 'img|' + t.fit + '|' + t.src;
    if (c._key !== key) {
      c._key = key;
      if (t.src) {
        c.innerHTML = '<img alt="">';
        c.firstChild.src = t.src;
        c.firstChild.style.objectFit = t.fit;
      } else {
        c.innerHTML = '<div class="placeholder">Drop an image here, or press Enter to choose one</div>';
      }
    }
    el.classList.remove('overflow');
  } else {
    if (state.editing !== t.id && c._key !== 'txt|' + t.html) {
      c._key = 'txt|' + t.html;
      c.innerHTML = t.html;
    }
    el.classList.toggle('overflow', state.showOverflow && (c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1));
  }
}

function showGuides(xs = [], ys = [], draft = null) {
  let html = xs.map((x) => `<div class="guide v" style="left:${x}mm"></div>`).join('') +
             ys.map((y) => `<div class="guide h" style="top:${y}mm"></div>`).join('');
  if (draft) html += `<div class="draft" style="left:${draft.x}mm;top:${draft.y}mm;width:${draft.w}mm;height:${draft.h}mm"></div>`;
  guidesEl.innerHTML = html;
}

/* ---------------------------------------------------------------- inspector */

function setVal(sel, v) {
  const el = $(sel);
  if (document.activeElement === el) return;
  if (el.type === 'checkbox') el.checked = v;
  else el.value = v;
}

function updateInspector() {
  const s = scopeTile();
  $('#paperSection').hidden = !!s;
  $('#scopeSection').hidden = !s;
  if (s) {
    $('#scopeName').textContent = '— ' + crumbLabel(s);
    const n = (s.children || []).length;
    $('#scopeSize').textContent = `${round(s.w)} × ${round(s.h)} mm · ${n} tile${n === 1 ? '' : 's'} inside`;
    setVal('#sInset', s.inset || 0);
    setVal('#sGutter', s.gutter ?? '');
    $('#sGutter').placeholder = doc.paper.gutter;
    showColor('#sFillRole', '#sBg', s.bg, resolveBg);
    setVal('#sBorderW', round(s.borderW));
    setVal('#sBorderC', s.borderC);
    setVal('#sRadius', round(s.radius));
    setVal('#sBleed', !!s.bleed);
    setVal('#sHeader', !!bandOf(s, 'header'));
    setVal('#sFooter', !!bandOf(s, 'footer'));
  }
  const p = doc.paper;
  setVal('#pHeader', !!bandOf(null, 'header'));
  setVal('#pFooter', !!bandOf(null, 'footer'));
  setVal('#pSize', SIZES[p.size] ? p.size : 'custom');
  setVal('#pOrient', p.orientation);
  setVal('#pW', round(p.w)); setVal('#pH', round(p.h));
  setVal('#pMargin', p.margin); setVal('#pGutter', p.gutter);
  setVal('#pCols', p.columns);

  const ts = selectedTiles();
  $('#tileSection').hidden = ts.length === 0;
  $('#arrangeSection').hidden = ts.length < 2;
  if (!ts.length) return;
  const t = ts[0];
  $('#tileCount').textContent = ts.length > 1 ? `(${ts.length} selected)` : '';
  for (const [sel, prop] of [['#tX', 'x'], ['#tY', 'y'], ['#tW', 'w'], ['#tH', 'h']]) {
    setVal(sel, round(t[prop]));
    $(sel).disabled = ts.length > 1;
  }
  const look = lookOf(t);
  showColor('#tFillRole', '#tBg', look.fill.bg, resolveBg);
  showColor('#tTextRole', '#tColor', look.text.color, resolveText,
    () => getComputedStyle(els.get(look.text.id).firstChild).color);
  const opts = offeredStyles().map((x) => `<option value="${x.id}">${x.name}</option>`).join('');
  if ($('#tStyle')._opts !== opts) { $('#tStyle').innerHTML = opts; $('#tStyle')._opts = opts; }
  setVal('#tStyle', look.text.ts || 'body');
  setVal('#tFont', look.text.font || '');
  setVal('#tSize', look.text.fontSize ?? '');
  const te = els.get(look.text.id);
  if (te) $('#tSize').placeholder = Math.round(parseFloat(getComputedStyle(te.firstChild).fontSize) * 0.75);
  setVal('#tPad', t.padding);
  setVal('#tRadius', round(t.radius));
  setVal('#tBorderW', round(t.borderW));
  setVal('#tBorderC', t.borderC);
  setVal('#tFit', t.fit);
  setVal('#tCols', t.cols || 1);
  setVal('#tBleed', !!t.bleed);
  setVal('#tInset', t.inset || 0);
  setVal('#tGutter', t.gutter ?? '');
  $('#tGutter').placeholder = doc.paper.gutter;
  const sec = isSection(t);
  $('#textOpts').hidden = sec || t.type !== 'text';
  $('#secOpts').hidden = !sec;
  for (const seg of document.querySelectorAll('.seg')) {
    for (const b of seg.children) b.classList.toggle('on', look.text[seg.dataset.prop] === b.dataset.v);
  }
  $('#imgOpts').hidden = !ts.some((x) => x.type === 'image');
}

/* Colour controls: a role select (design colour / none / custom) + a picker. */
function showColor(roleSel, pickSel, v, resolve, fallback) {
  setVal(roleSel, !v ? '' : v[0] === '@' ? v : 'custom');
  const shown = resolve(v) || (fallback ? rgbToHex(fallback()) : '') || '#ffffff';
  setVal(pickSel, shown);
}
function rgbToHex(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  return m ? '#' + m.slice(1, 4).map((n) => (+n).toString(16).padStart(2, '0')).join('') : '';
}

/* The right-hand panel is for special settings; hidden unless asked for. */
function bindPanelToggle() {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('tiles-prefs')) || {}; } catch {}
  const set = (open) => {
    document.body.classList.toggle('panel-hidden', !open);
    $('#panelBtn').classList.toggle('on', open);
    try { localStorage.setItem('tiles-prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('tiles-prefs')) || {}), panel: open })); } catch {}
  };
  set(!!prefs.panel);
  $('#panelBtn').addEventListener('click', () => set(document.body.classList.contains('panel-hidden')));
  $('#designBtn').addEventListener('click', () => { set(true); showTab('design'); });
}

function updateToolbar() {
  const chain = [];
  for (let t = scopeTile(); t; t = parentOf(t.id)) chain.unshift(t);
  const crumbs = [`<button data-scope="" class="${chain.length ? '' : 'on'}">Poster</button>`]
    .concat(chain.map((t, i) => `<span>›</span><button data-scope="${t.id}" class="${i === chain.length - 1 ? 'on' : ''}">${crumbLabel(t)}</button>`));
  const html = crumbs.join('');
  if ($('#crumbs')._html !== html) { $('#crumbs').innerHTML = html; $('#crumbs')._html = html; }
  $('[data-act=up]').disabled = !state.scope;
  const n = state.selected.size;
  for (const b of document.querySelectorAll('[data-needs]')) b.disabled = n < +b.dataset.needs;
  $('[data-act=undo]').disabled = hist.idx <= 0;
  $('[data-act=redo]').disabled = hist.idx >= hist.stack.length - 1;
}

/* Styling a divided tile from outside styles what you see: text settings go to
   all text inside it, and the fill goes to the visible layer — the tile itself
   if it has its own background (e.g. a bleeding header), else its coloured
   sub-tiles. Everything else (padding, border, …) applies to the tile itself. */
const CASCADE = new Set(['color', 'font', 'fontSize', 'align', 'vAlign', 'ts', 'bold', 'italic', 'underline', 'leading', 'ps', 'cols']);
function leavesOf(t) {
  const out = [];
  walk(t.children || [], (k) => { if (!isSection(k)) out.push(k); });
  return out;
}
function applyStyle(t, prop, v) {
  // a design fill brings its text colour along, unless the text colour was chosen
  if (prop === 'bg') {
    const look = lookOf(t).text, role = v && v[0] === '@' ? doc.design.colors[v.slice(1)] : null;
    if (role && role.text && (!look.color || look.color[0] === '@')) applyStyle(t, 'color', v);
    else if (!role && look.color && look.color[0] === '@') applyStyle(t, 'color', '');
  }
  if (!isSection(t)) { t[prop] = v; return; }
  if (CASCADE.has(prop)) {
    t[prop] = v;
    for (const k of leavesOf(t)) k[prop] = v;
  } else if (prop === 'bg' && !t.bg) {
    const filled = leavesOf(t).filter((k) => k.bg);
    if (filled.length) filled.forEach((k) => { k.bg = v; });
    else t.bg = v;
    if (t.innerBg !== undefined && v) t.innerBg = v;
  } else {
    t[prop] = v;
  }
}
/* The tile whose look the inspector shows for t (see applyStyle). */
function lookOf(t) {
  if (!isSection(t)) return { fill: t, text: t };
  const text = leavesOf(t).find((k) => k.type === 'text') || t;
  return { fill: t.bg ? t : leavesOf(t).find((k) => k.bg) || t, text };
}

function bindTileInput(sel, prop, parse, live = false) {
  const el = $(sel);
  const apply = () => {
    const v = parse(el.value);
    if (v === null || Number.isNaN(v)) return;
    for (const t of selectedTiles()) applyStyle(t, prop, v === undefined ? null : v);
    render();
  };
  if (live) el.addEventListener('input', apply);
  el.addEventListener('change', () => { apply(); commit(); });
}

function bindInspector() {
  const num = (min) => (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : Math.max(min, n); };
  const str = (v) => v;

  bindTileInput('#tX', 'x', num(-1e4));
  bindTileInput('#tY', 'y', num(-1e4));
  bindTileInput('#tW', 'w', num(MIN));
  bindTileInput('#tH', 'h', num(MIN));
  bindTileInput('#tBg', 'bg', str, true);
  bindTileInput('#tColor', 'color', str, true);
  bindTileInput('#tFont', 'font', str);
  bindTileInput('#tSize', 'fontSize', (v) => (v.trim() === '' ? undefined : Math.max(1, parseFloat(v))));
  bindTileInput('#tStyle', 'ts', (v) => (v === 'body' ? '' : v));
  // role selects: "" = none/default, "@role" = design colour, "custom" = use the picker
  const roleSelect = (sel, pick, prop, targets) => $(sel).addEventListener('change', (e) => {
    const v = e.target.value === 'custom' ? $(pick).value : e.target.value;
    for (const t of targets()) applyStyle(t, prop, v);
    commit(); render();
  });
  roleSelect('#tFillRole', '#tBg', 'bg', selectedTiles);
  roleSelect('#tTextRole', '#tColor', 'color', selectedTiles);
  roleSelect('#sFillRole', '#sBg', 'bg', () => (scopeTile() ? [scopeTile()] : []));
  bindTileInput('#tPad', 'padding', num(0));
  bindTileInput('#tRadius', 'radius', num(0));
  bindTileInput('#tBorderW', 'borderW', num(0));
  bindTileInput('#tBorderC', 'borderC', str, true);
  bindTileInput('#tFit', 'fit', str);
  bindTileInput('#tCols', 'cols', (v) => Math.min(8, Math.max(1, Math.round(+v) || 1)));
  bindTileInput('#tInset', 'inset', num(0));
  bindTileInput('#tGutter', 'gutter', (v) => (v.trim() === '' ? undefined : Math.max(0, parseFloat(v))));
  // the section being edited (scope)
  const bindScope = (sel, prop, parse, live = false) => {
    const el = $(sel);
    const apply = () => {
      const s = scopeTile(), v = parse(el.value);
      if (!s || v === null || Number.isNaN(v)) return;
      s[prop] = v === undefined ? null : v;
      render();
    };
    if (live) el.addEventListener('input', apply);
    el.addEventListener('change', () => { apply(); commit(); });
  };
  bindScope('#sInset', 'inset', num(0));
  bindScope('#sGutter', 'gutter', (v) => (v.trim() === '' ? undefined : Math.max(0, parseFloat(v))));
  bindScope('#sBg', 'bg', str, true);
  bindScope('#sBorderW', 'borderW', num(0));
  bindScope('#sBorderC', 'borderC', str, true);
  bindScope('#sRadius', 'radius', num(0));
  for (const [sel, role, scoped] of [['#sHeader', 'header', true], ['#sFooter', 'footer', true],
    ['#pHeader', 'header', false], ['#pFooter', 'footer', false]]) {
    $(sel).addEventListener('change', (e) => toggleBand(scoped ? scopeTile() : null, role, e.target.checked));
  }
  $('#tBleed').addEventListener('change', (e) => {
    for (const t of selectedTiles()) t.bleed = e.target.checked;
    commit(); render();
  });
  $('#sBleed').addEventListener('change', (e) => {
    const s = scopeTile();
    if (s) s.bleed = e.target.checked;
    commit(); render();
  });
  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', (e) => {
      const v = e.target.dataset.v;
      if (!v) return;
      for (const t of selectedTiles()) applyStyle(t, seg.dataset.prop, v);
      commit(); render();
    });
  }

  const p = () => doc.paper;
  $('#pSize').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!SIZES[v]) return;
    if (v === 'Slide') p().orientation = 'landscape';
    const [a, b] = SIZES[v];
    const land = p().orientation === 'landscape';
    resizePaper(land ? Math.max(a, b) : Math.min(a, b), land ? Math.min(a, b) : Math.max(a, b));
    p().size = v;
    commit(); render(); zoomFit();
  });
  $('#pOrient').addEventListener('change', (e) => {
    if (e.target.value !== p().orientation) resizePaper(p().h, p().w);
    p().orientation = e.target.value;
    commit(); render(); zoomFit();
  });
  for (const [sel, axis] of [['#pW', 'w'], ['#pH', 'h']]) {
    $(sel).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!(v >= 20)) return render();
      resizePaper(axis === 'w' ? v : p().w, axis === 'h' ? v : p().h);
      p().size = 'custom';
      commit(); render(); zoomFit();
    });
  }
  for (const [sel, prop, lo] of [['#pMargin', 'margin', 0], ['#pGutter', 'gutter', 0], ['#pCols', 'columns', 0]]) {
    $(sel).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isNaN(v)) return render();
      p()[prop] = Math.max(lo, prop === 'columns' ? Math.round(v) : v);
      commit(); render();
    });
  }
  // view options (not part of the document)
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('tiles-prefs')) || {}; } catch { return {}; } })();
  state.showOverflow = !!prefs.overflow; state.spell = !!prefs.spell;
  setVal('#optOverflow', state.showOverflow); setVal('#optSpell', state.spell);
  const savePrefs = () => { try { localStorage.setItem('tiles-prefs', JSON.stringify({ overflow: state.showOverflow, spell: state.spell })); } catch {} };
  $('#optOverflow').addEventListener('change', (e) => { state.showOverflow = e.target.checked; savePrefs(); render(); });
  $('#optSpell').addEventListener('change', (e) => { state.spell = e.target.checked; savePrefs(); render(); });
  $('#snapToggle').addEventListener('change', (e) => { state.snap = e.target.checked; });

  document.querySelectorAll('[data-arr]').forEach((b) => b.addEventListener('click', () => arrange(b.dataset.arr)));
}

/* Scale the whole layout with the paper so a design can move between sizes. */
function resizePaper(w, h) {
  const p = doc.paper;
  const sx = w / p.w, sy = h / p.h, f = Math.sqrt(sx * sy);
  for (const t of doc.tiles) { t.x *= sx; t.w *= sx; t.y *= sy; t.h *= sy; }
  walk(doc.tiles, (t) => {
    t.fontSize = round(t.fontSize * f);
    t.padding = round(t.padding * f);
    t.radius *= f; t.borderW *= f;
    t.inset = round((t.inset || 0) * f);
    if (t.gutter != null) t.gutter = round(t.gutter * f);
  });
  p.margin = round(p.margin * f);
  p.gutter = round(p.gutter * f);
  p.w = w; p.h = h;
}

/* ---------------------------------------------------------------- actions */

function addTile(type, props = {}) {
  const free = largestFree();
  let rect;
  if (free) {
    rect = { x: free.x, y: free.y, w: free.w, h: free.h };
  } else {
    const p = F();
    rect = { w: p.w * 0.3, h: p.h * 0.2 };
    rect.x = (p.w - rect.w) / 2; rect.y = (p.h - rect.h) / 2;
    toast('No free space left — placed on top. Split a tile to make room.');
  }
  const t = newTile(type, Object.assign(rect, props));
  T().push(t);
  state.selected = new Set([t.id]);
  commit(); render();
  return t;
}

function split(vertical) {
  const ax = vertical ? 'x' : 'y';
  const created = [];
  for (const t of selectedTiles()) {
    const cs = equalCuts(t, ax, state.parts);
    if (cs) created.push(...cutAny(t, ax, cs));
  }
  if (!created.length) return toast('Tile is too small to split');
  state.selected = new Set(created);
  commit(); render();
}

function act(name) {
  const ts = selectedTiles();
  switch (name) {
    case 'add-text': addTile('text'); break;
    case 'add-image': pickImage(null); break;
    case 'split-v': split(true); break;
    case 'split-h': split(false); break;
    case 'fill': ts.forEach(fillTile); commit(); render(); break;
    case 'fill-all': {
      const order = [...T()].sort((a, b) => a.y - b.y || a.x - b.x);
      for (let pass = 0; pass < 2; pass++) order.forEach(fillTile);
      commit(); render(); break;
    }
    case 'duplicate': {
      const g = F().gutter || 5;
      const reid = (t) => { t.id = uid(); (t.children || []).forEach(reid); return t; };
      const copies = ts.map((t) => Object.assign(reid(clone(t)), { x: t.x + g, y: t.y + g }));
      T().push(...copies);
      state.selected = new Set(copies.map((t) => t.id));
      commit(); render(); break;
    }
    case 'delete':
      setT(T().filter((t) => !state.selected.has(t.id)));
      state.selected.clear();
      commit(); render(); break;
    case 'front':
      setT([...T().filter((t) => !state.selected.has(t.id)), ...ts]);
      commit(); render(); break;
    case 'back':
      setT([...ts, ...T().filter((t) => !state.selected.has(t.id))]);
      commit(); render(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'zoom-in': setZoom(state.zoom * 1.25); break;
    case 'zoom-out': setZoom(state.zoom / 1.25); break;
    case 'zoom-fit': zoomFit(); break;
    case 'new':
      if (!confirm('Start a new document? Unsaved changes will be lost (use Save first).')) break;
      newDoc(); state.selected.clear(); state.scope = null; commit(); render(); zoomFit();
      if (!$('#tabDesign').hidden) renderDesignTab();
      break;
    case 'open': $('#fileDoc').click(); break;
    case 'save': saveDoc(); break;
    case 'print': window.print(); break;
    case 'enter': if (ts.length === 1) enterTile(ts[0]); break;
    case 'up': exitScope(); break;
  }
}

function arrange(kind) {
  const ts = selectedTiles();
  if (!ts.length) return;
  const g = F().gutter;
  const minX = Math.min(...ts.map((t) => t.x)), maxR = Math.max(...ts.map((t) => t.x + t.w));
  const minY = Math.min(...ts.map((t) => t.y)), maxB = Math.max(...ts.map((t) => t.y + t.h));
  switch (kind) {
    case 'left': ts.forEach((t) => { t.x = minX; }); break;
    case 'right': ts.forEach((t) => { t.x = maxR - t.w; }); break;
    case 'top': ts.forEach((t) => { t.y = minY; }); break;
    case 'bottom': ts.forEach((t) => { t.y = maxB - t.h; }); break;
    case 'matchW': ts.forEach((t) => { t.w = ts[0].w; }); break;
    case 'matchH': ts.forEach((t) => { t.h = ts[0].h; }); break;
    case 'evenW': {
      const w = (maxR - minX - (ts.length - 1) * g) / ts.length;
      if (w < MIN) return toast('Not enough room');
      [...ts].sort((a, b) => a.x - b.x).forEach((t, i) => { t.x = minX + i * (w + g); t.w = w; });
      break;
    }
    case 'evenH': {
      const h = (maxB - minY - (ts.length - 1) * g) / ts.length;
      if (h < MIN) return toast('Not enough room');
      [...ts].sort((a, b) => a.y - b.y).forEach((t, i) => { t.y = minY + i * (h + g); t.h = h; });
      break;
    }
    case 'fit-text': ts.flatMap((t) => (isSection(t) ? leavesOf(t) : [t])).filter((t) => t.type === 'text').forEach(fitText); break;
    case 'replace-image': return pickImage(ts[0]);
  }
  commit(); render();
}

/* Largest font size (0.5 pt steps) at which the text still fits the tile height. */
function fitText(t) {
  const el = els.get(t.id), c = el.firstChild;
  let lo = 2, hi = 600;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    c.style.fontSize = mid + 'pt';
    if (c.scrollHeight <= c.clientHeight + 1) lo = mid; else hi = mid;
  }
  t.fontSize = Math.floor(lo * 2) / 2;
}

/* ---------------------------------------------------------------- editing */

function startEditing(t, at = null) {
  clearTimeout(state.editTimer);
  if (!t || isSection(t) || t.type !== 'text') return;
  state.editing = t.id;
  state.selected = new Set([t.id]);
  render();
  const c = els.get(t.id).firstChild;
  c.contentEditable = 'true';
  c.focus();
  updateFormatBar();
  let range = at && t.html && document.caretRangeFromPoint ? document.caretRangeFromPoint(at.clientX, at.clientY) : null;
  if (!range || !c.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(c);
    if (t.html) range.collapse(false);
  }
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function stopEditing() {
  const id = state.editing;
  if (!id) return;
  state.editing = null;
  updateFormatBar();
  const t = byId(id), el = els.get(id);
  if (t && el) {
    const c = el.firstChild;
    c.contentEditable = 'false';
    let html = c.innerHTML.trim();
    if (html === '<br>' || !c.textContent.trim() && !c.querySelector('img')) html = '';
    t.html = html;
    c._key = null;
  }
  getSelection().removeAllRanges();
  commit(); render();
}

/* ---------------------------------------------------------------- pointer */

function toMM(e, onPaper = false) {
  const r = paperEl.getBoundingClientRect();
  const k = PX * state.zoom, o = onPaper ? { x: 0, y: 0 } : scopeOrigin();
  return { x: (e.clientX - r.left) / k - o.x, y: (e.clientY - r.top) / k - o.y };
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  const tileEl = scopeEl(e.target);
  const deepEl = e.target.closest && e.target.closest('.tile');
  if (state.editing) {
    // inside the tile being typed in: keep typing. In the text itself the browser
    // places the caret; elsewhere in the tile (padding, empty space below short
    // text) keep the focus and put the caret at the end.
    if (deepEl && deepEl.dataset.id === state.editing && !e.target.dataset.handle) {
      const c = deepEl.firstChild;
      if (!c.contains(e.target)) {
        e.preventDefault();
        const r = document.createRange();
        r.selectNodeContents(c);
        r.collapse(false);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      }
      return;
    }
    stopEditing();
  }
  const at = { clientX: e.clientX, clientY: e.clientY };
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

  const pt = toMM(e);
  const handle = e.target.dataset.handle;
  const hv = state.hover;
  if (!handle && hv && hv.type === 'cut') {
    state.drag = { mode: 'cut', plan: hv.plan, start: pt };
  } else if (!handle && hv && hv.type === 'seam') {
    // drag = move the seam (both sides resize together)
    const s = hv.seam, A = AX[s.axis], g = F().gutter;
    const L = s.L.map(byId), R = s.R.map(byId);
    const size = F()[A.size];
    state.drag = {
      mode: 'seam', seam: s, start: pt,
      origs: new Map([...L, ...R].map((t) => [t.id, { p: t[A.p], l: t[A.l] }])),
      minDelta: L.length ? MIN - Math.min(...L.map((t) => t[A.l])) : -s.hi,
      maxDelta: R.length ? Math.min(...R.map((t) => t[A.l])) - MIN : size - s.lo - g,
    };
  } else if (!handle && hv && hv.type === 'free') {
    state.drag = { mode: 'free', rect: hv.rect, start: pt };
  } else if (handle && tileEl) {
    const t = byId(tileEl.dataset.id);
    state.drag = { mode: 'resize', handle, start: pt, id: t.id, orig: { x: t.x, y: t.y, w: t.w, h: t.h } };
  } else if (tileEl) {
    const id = tileEl.dataset.id;
    const wasSelected = state.selected.size === 1 && state.selected.has(id);
    if (e.shiftKey) {
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    } else if (!state.selected.has(id)) {
      state.selected = new Set([id]);
    }
    const ts = selectedTiles();
    const origs = new Map(ts.map((t) => [t.id, { x: t.x, y: t.y }]));
    const x = Math.min(...ts.map((t) => t.x)), y = Math.min(...ts.map((t) => t.y));
    const bbox = { x, y, w: Math.max(...ts.map((t) => t.x + t.w)) - x, h: Math.max(...ts.map((t) => t.y + t.h)) - y };
    state.drag = { mode: 'move', start: pt, origs, bbox, clickedId: id, shift: e.shiftKey, wasSelected,
      at, deepId: deepEl ? deepEl.dataset.id : id };
    if (!ts.length) state.drag = null;
  } else if (state.scope && (pt.x < 0 || pt.y < 0 || pt.x > F().w || pt.y > F().h)) {
    e.preventDefault();
    // clicked outside the tile you are in: on text elsewhere, go and type there
    if (deepEl && clickToType(byId(deepEl.dataset.id), at)) return;
    return exitScope();
  } else {
    if (!e.shiftKey) state.selected.clear();
    const start = { ...pt };
    if (state.snap && !e.altKey) {
      const T = targets(new Set()), thr = 6 / (PX * state.zoom);
      start.x += snapAxis({ s: pt.x, e: pt.x }, T.X, thr);
      start.y += snapAxis({ s: pt.y, e: pt.y }, T.Y, thr);
    }
    state.drag = { mode: 'draw', start };
  }
  paperEl.setPointerCapture(e.pointerId);
  e.preventDefault();
  hoverEl.innerHTML = '';
  $('#hint').classList.remove('show');
  render();
}

function onPointerMove(e) {
  const d = state.drag;
  if (!d) return updateHover(e);
  const pt = toMM(e);
  let dx = pt.x - d.start.x, dy = pt.y - d.start.y;
  if (!d.moved) {
    if (Math.hypot(dx, dy) * PX * state.zoom < 3) return;
    d.moved = true;
  }
  const snap = state.snap && !e.altKey;
  const thr = 6 / (PX * state.zoom);
  let gx = [], gy = [], draft = null;

  if (d.mode === 'move') {
    const T = targets(state.selected), b = d.bbox;
    if (snap) {
      dx += snapAxis(edgesOf(b.x + dx, b.w), T.X, thr);
      dy += snapAxis(edgesOf(b.y + dy, b.h), T.Y, thr);
      gx = matchedLines(edgesOf(b.x + dx, b.w), T.X);
      gy = matchedLines(edgesOf(b.y + dy, b.h), T.Y);
    }
    for (const [id, o] of d.origs) {
      const t = byId(id);
      t.x = o.x + dx; t.y = o.y + dy;
    }
  } else if (d.mode === 'seam') {
    const s = d.seam, A = AX[s.axis];
    let delta = pt[s.axis] - d.start[s.axis];
    const T = targets(new Set(d.origs.keys()));
    const lines = s.axis === 'x' ? T.X : T.Y;
    const edges = (dd) => Object.assign({}, s.L.length ? { e: s.lo + dd } : {}, s.R.length ? { s: s.hi + dd } : {});
    if (snap) delta += snapAxis(edges(delta), lines, thr);
    delta = Math.min(d.maxDelta, Math.max(d.minDelta, delta));
    for (const id of s.L) { const t = byId(id), o = d.origs.get(id); t[A.l] = o.l + delta; }
    for (const id of s.R) { const t = byId(id), o = d.origs.get(id); t[A.p] = o.p + delta; t[A.l] = o.l - delta; }
    if (snap) { const m = matchedLines(edges(delta), lines); if (s.axis === 'x') gx = m; else gy = m; }
  } else if (d.mode === 'free' || d.mode === 'cut') {
    return;
  } else if (d.mode === 'resize') {
    const o = d.orig, h = d.handle, t = byId(d.id);
    const T = targets(new Set([d.id]));
    let l = o.x, r = o.x + o.w, top = o.y, bot = o.y + o.h;
    const sn = (edges, lines) => (snap ? snapAxis(edges, lines, thr) : 0);
    if (h.includes('w')) { l = o.x + dx; l += sn({ s: l }, T.X); l = Math.min(l, r - MIN); }
    if (h.includes('e')) { r = o.x + o.w + dx; r += sn({ e: r }, T.X); r = Math.max(r, l + MIN); }
    if (h.includes('n')) { top = o.y + dy; top += sn({ s: top }, T.Y); top = Math.min(top, bot - MIN); }
    if (h.includes('s')) { bot = o.y + o.h + dy; bot += sn({ e: bot }, T.Y); bot = Math.max(bot, top + MIN); }
    Object.assign(t, { x: l, y: top, w: r - l, h: bot - top });
    if (snap) {
      gx = matchedLines({ s: l, e: r }, T.X);
      gy = matchedLines({ s: top, e: bot }, T.Y);
    }
  } else {
    const T = targets(new Set());
    let x2 = pt.x, y2 = pt.y;
    const ex = x2 >= d.start.x ? 'e' : 's', ey = y2 >= d.start.y ? 'e' : 's';
    if (snap) {
      x2 += snapAxis({ [ex]: x2 }, T.X, thr);
      y2 += snapAxis({ [ey]: y2 }, T.Y, thr);
    }
    draft = { x: Math.min(d.start.x, x2), y: Math.min(d.start.y, y2), w: Math.abs(x2 - d.start.x), h: Math.abs(y2 - d.start.y) };
    d.rect = draft;
    if (snap) {
      gx = matchedLines({ s: draft.x, e: draft.x + draft.w }, T.X).concat(matchedLines({ e: draft.x, s: draft.x + draft.w }, T.X));
      gy = matchedLines({ s: draft.y, e: draft.y + draft.h }, T.Y).concat(matchedLines({ e: draft.y, s: draft.y + draft.h }, T.Y));
    }
  }
  render();
  showGuides(gx, gy, draft);
}

function onPointerUp() {
  const d = state.drag;
  if (!d) return;
  state.drag = null;
  showGuides();
  if (d.mode === 'move' && !d.moved && !d.shift && state.selected.size > 1) {
    state.selected = new Set([d.clickedId]);
  }
  if (d.mode === 'move' && !d.moved && !d.shift && clickToType(byId(d.deepId), d.at)) {
    refreshHover();
    return;
  }
  if (d.mode === 'draw' && d.moved && d.rect && d.rect.w >= MIN && d.rect.h >= MIN) {
    const t = newTile('text', { x: d.rect.x, y: d.rect.y, w: d.rect.w, h: d.rect.h });
    T().push(t);
    state.selected = new Set([t.id]);
  }
  if (d.mode === 'cut') applyCut(d.plan);
  if (d.mode === 'free') {
    const t = newTile('text', { x: d.rect.x, y: d.rect.y, w: d.rect.w, h: d.rect.h });
    T().push(t);
    state.selected = new Set([t.id]);
    commit();
  }
  if (d.moved) commit();
  render();
  refreshHover();
}

function onDoubleClick(e) {
  clearTimeout(state.editTimer);
  // pointer capture retargets click/dblclick to the paper, so hit-test ourselves
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  // while typing, double-click only ever selects a word (fast clicking must not change mode)
  if (state.editing && hit && hit.closest('.tile.editing')) return;
  const tileEl = scopeEl(hit);
  if (!tileEl) return;
  const t = byId(tileEl.dataset.id);
  const h = hit.dataset.handle;
  if (h) {
    if (h.includes('n')) expand(t, 'up');
    if (h.includes('s')) expand(t, 'down');
    if (h.includes('w')) expand(t, 'left');
    if (h.includes('e')) expand(t, 'right');
    commit(); render();
    return;
  }
  if (t.type === 'image' && !isSection(t)) pickImage(t);
  else enterTile(t);
}

/* A click (no drag) on a text tile starts typing at that spot. The tile may be
   nested anywhere: the editor moves to its level first. */
function clickToType(t, at) {
  if (!t || isSection(t) || t.type !== 'text') return false;
  const p = parentOf(t.id), level = p ? p.id : null;
  if (level !== state.scope) state.scope = level;
  state.selected = new Set([t.id]);
  startEditing(t, at);
  return true;
}

/* ---------------------------------------------------------------- zoom */

function setZoom(z, anchor) {
  z = Math.min(4, Math.max(0.05, z));
  const before = anchor && toMM(anchor, true);
  state.zoom = z;
  render();
  if (before) {
    const r = paperEl.getBoundingClientRect();
    stage.scrollLeft += r.left + before.x * PX * z - anchor.clientX;
    stage.scrollTop += r.top + before.y * PX * z - anchor.clientY;
  }
}

function zoomFit() {
  const p = doc.paper;
  setZoom(Math.min((stage.clientWidth - 80) / (p.w * PX), (stage.clientHeight - 80) / (p.h * PX)));
}

/* ---------------------------------------------------------------- files */

function readFile(file, asText) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (asText) r.readAsText(file); else r.readAsDataURL(file);
  });
}

function pickImage(target) {
  state.imageTarget = target ? target.id : null;
  $('#fileImage').value = '';
  $('#fileImage').click();
}

function setImage(t, src) {
  if (t.type !== 'image') { t.type = 'image'; t.padding = 0; }
  t.src = src;
}

function saveDoc() {
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'poster.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openDoc(text) {
  try {
    loadDoc(JSON.parse(text));
    hist.stack = []; hist.idx = -1;
    commit(); render(); zoomFit();
    if (!$('#tabDesign').hidden) renderDesignTab();
  } catch (err) {
    toast('Could not open file: ' + err.message);
  }
}

/* ---------------------------------------------------------------- misc */

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 3000);
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const t = state.editing ? byId(state.editing) : selectedTiles().length === 1 ? selectedTiles()[0] : null;
    if (t) { e.preventDefault(); enterTile(t); }
    return;
  }
  if (state.editing) {
    if (e.key === 'Escape') { e.preventDefault(); stopEditing(); }
    return;
  }
  if (e.target.matches && e.target.matches('input, select, textarea')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const ts = selectedTiles();

  if (mod) {
    const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', d: 'duplicate', s: 'save', o: 'open' };
    if (map[k] && (map[k] !== 'duplicate' || ts.length)) { e.preventDefault(); act(map[k]); }
    else if (k === 'a') { e.preventDefault(); state.selected = new Set(T().map((t) => t.id)); render(); }
    return;
  }

  const digit = /^(Digit|Numpad)([2-9])$/.exec(e.code);
  if (digit) { e.preventDefault(); setParts(+digit[2]); toast(`Split into ${state.parts} parts`); return; }

  const arrows = { arrowleft: ['left', -1, 0], arrowright: ['right', 1, 0], arrowup: ['up', 0, -1], arrowdown: ['down', 0, 1] };
  if (arrows[k] && ts.length) {
    e.preventDefault();
    const [dir, dx, dy] = arrows[k];
    if (e.altKey) ts.forEach((t) => expand(t, dir));
    else {
      const step = e.shiftKey ? 10 : 1;
      ts.forEach((t) => { t.x += dx * step; t.y += dy * step; });
    }
    commit(); render();
    return;
  }

  switch (k) {
    case 'delete': case 'backspace': if (ts.length) { e.preventDefault(); act('delete'); } break;
    case 'escape':
      if (state.selected.size) { state.selected.clear(); render(); } else exitScope();
      break;
    case 'enter':
      if (ts.length === 1) {
        e.preventDefault();
        if (isSection(ts[0])) enterTile(ts[0]);
        else if (ts[0].type === 'image') pickImage(ts[0]);
        else startEditing(ts[0]);
      }
      break;
    case 'e': if (ts.length === 1) enterTile(ts[0]); break;
    case 't': act('add-text'); break;
    case 'i': act('add-image'); break;
    case 'v': if (ts.length) act('split-v'); break;
    case 'h': if (ts.length) act('split-h'); break;
    case 'f': if (ts.length) act('fill'); break;
    case '+': case '=': act('zoom-in'); break;
    case '-': act('zoom-out'); break;
    case '0': act('zoom-fit'); break;
  }
}

async function onPaste(e) {
  if (state.editing) {
    // keep pasted text plain so tile styling stays consistent
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    return;
  }
  if (e.target.matches && e.target.matches('input, textarea')) return;
  const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
  const ts = selectedTiles();
  if (file) {
    e.preventDefault();
    const src = await readFile(file);
    if (ts.length === 1) { setImage(ts[0], src); commit(); render(); }
    else addTile('image', { src });
    return;
  }
  const text = e.clipboardData.getData('text/plain');
  if (text) {
    e.preventDefault();
    const div = document.createElement('div');
    div.textContent = text;
    addTile('text', { html: div.innerHTML.replace(/\n/g, '<br>') });
  }
}

/* ---------------------------------------------------------------- wiring */

function init() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) loadDoc(JSON.parse(saved)); else newDoc();
  } catch {
    newDoc();
  }
  commit();

  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  bindInspector();
  bindDesignTab();
  bindFormatBar();
  bindPanelToggle();
  $('#tFont').innerHTML = fontOptions(true);
  document.addEventListener('change', (e) => {
    if (e.target.type === 'color') { rememberColor(e.target.value); autosave(JSON.stringify(doc)); }
  });
  new MutationObserver(() => {
    for (const el of document.querySelectorAll('input[type=color]:not([list])')) el.setAttribute('list', 'swatches');
  }).observe(document.body, { childList: true, subtree: true });
  for (const el of document.querySelectorAll('input[type=color]')) el.setAttribute('list', 'swatches');
  updateSwatches();
  loadFonts();
  $('#parts').addEventListener('change', (e) => setParts(+e.target.value));
  $('#crumbs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    const to = b.dataset.scope || null;
    if (to === state.scope) return;
    // crumbs are ancestors: leave level by level so undivided containers fold back up
    while (state.scope && state.scope !== to) exitScope();
  });

  paperEl.addEventListener('pointerdown', onPointerDown);
  paperEl.addEventListener('pointermove', onPointerMove);
  paperEl.addEventListener('pointerup', onPointerUp);
  paperEl.addEventListener('pointercancel', onPointerUp);
  paperEl.addEventListener('dblclick', onDoubleClick);
  paperEl.addEventListener('pointerleave', () => {
    if (state.drag) return;
    state.hover = null;
    showHover();
  });
  // Shift reveals the insert buttons without having to move the mouse
  for (const type of ['keydown', 'keyup']) {
    document.addEventListener(type, (e) => {
      if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key) || !state.lastPointer || state.drag) return;
      if (e.key === 'Alt') e.preventDefault();
      updateHover({ ...state.lastPointer, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey, altKey: e.altKey });
    });
  }
  window.addEventListener('blur', () => { if (state.lastPointer) refreshHover(); });
  // leaving the text ends editing — except for the formatting toolbar
  tilesEl.addEventListener('focusout', (e) => {
    if (state.editing && !(e.relatedTarget && $('#fmtbar').contains(e.relatedTarget))) stopEditing();
  });

  stage.addEventListener('pointerdown', (e) => {
    if (paperEl.contains(e.target) || e.target !== stage && e.target !== sizer) return;
    if (state.editing) stopEditing();
    if (state.scope) return exitScope();
    state.selected.clear();
    render();
  });
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(state.zoom * Math.exp(-e.deltaY * 0.0015), e);
  }, { passive: false });

  stage.addEventListener('dragover', (e) => { e.preventDefault(); });
  stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const json = files.find((f) => f.name.endsWith('.json'));
    if (json) return openDoc(await readFile(json, true));
    const img = files.find((f) => f.type.startsWith('image/'));
    if (!img) return;
    const src = await readFile(img);
    const tileEl = scopeEl(document.elementFromPoint(e.clientX, e.clientY));
    if (tileEl && !isSection(byId(tileEl.dataset.id))) { setImage(byId(tileEl.dataset.id), src); state.selected = new Set([tileEl.dataset.id]); commit(); render(); }
    else addTile('image', { src });
  });

  $('#fileImage').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const src = await readFile(f);
    const t = state.imageTarget && byId(state.imageTarget);
    if (t) { setImage(t, src); commit(); render(); } else addTile('image', { src });
  });
  $('#fileDoc').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) openDoc(await readFile(f, true));
    e.target.value = '';
  });

  document.addEventListener('keydown', onKey);
  document.addEventListener('paste', onPaste);
  window.addEventListener('beforeprint', () => {
    if (state.editing) stopEditing();
    state.selected.clear();
    render();
    $('#pageStyle').textContent = `@page { size: ${doc.paper.w}mm ${doc.paper.h}mm; margin: 0; }`;
  });

  render();
  zoomFit();
}

init();
