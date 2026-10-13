/* Pointer gestures on the paper: select, move, resize, draw, drag seams, cut,
   click to type, double-click to go inside. */

import { MIN, type Handle } from '../constants';
import { applyCut, enterTile, exitScope, placeTile } from '../editor/actions';
import { commit } from '../editor/history';
import { render } from '../editor/hooks';
import { editor, level, select, selectedTiles, tileById } from '../editor/store';
import { AX, edgesOf } from '../layout/axis';
import { expand } from '../layout/fill';
import { matchedLines, snapAxis, targets } from '../layout/snap';
import { isSection } from '../model/tree';
import { dom } from '../view/dom';
import { clearHover } from '../view/overlay';
import { showGuides } from '../view/paper';
import { deepTileEl, pxToMM, scopeEl, toMM } from './coords';
import { caretToEnd, clickToType, stopEditing } from './editing';
import { pickImage } from './files';
import { clearHoverState, refreshHover, updateHover } from './hover';

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const view = editor.view;
  const target = e.target as HTMLElement;
  const tileEl = scopeEl(target);
  const deepEl = deepTileEl(target);
  if (view.editing) {
    // inside the tile being typed in: keep typing. In the text itself the
    // browser places the caret; elsewhere in the tile (padding, empty space
    // below short text) keep the focus and put the caret at the end.
    if (deepEl && deepEl.dataset.id === view.editing && !target.dataset.handle) {
      const c = deepEl.firstElementChild as HTMLElement;
      if (!c.contains(target)) { e.preventDefault(); caretToEnd(c); }
      return;
    }
    stopEditing();
  }
  const at = { clientX: e.clientX, clientY: e.clientY };
  (document.activeElement as HTMLElement | null)?.blur?.();

  const pt = toMM(e);
  const handle = target.dataset.handle as Handle | undefined;
  const hv = view.hover;
  const L = level();
  if (!handle && hv?.type === 'cut') {
    view.drag = { mode: 'cut', plan: hv.plan, start: pt };
  } else if (!handle && hv?.type === 'seam') {
    // drag = move the seam (both sides resize together)
    const s = hv.seam, A = AX[s.axis], g = L.frame.gutter;
    const Lt = s.L.map((id) => tileById(id)!), Rt = s.R.map((id) => tileById(id)!);
    view.drag = {
      mode: 'seam', seam: s, start: pt,
      origs: new Map([...Lt, ...Rt].map((t) => [t.id, { p: t[A.p], l: t[A.l] }])),
      minDelta: Lt.length ? MIN - Math.min(...Lt.map((t) => t[A.l])) : -s.hi,
      maxDelta: Rt.length ? Math.min(...Rt.map((t) => t[A.l])) - MIN : L.frame[A.size] - s.lo - g,
    };
  } else if (!handle && hv?.type === 'free') {
    view.drag = { mode: 'free', rect: hv.rect, start: pt };
  } else if (handle && tileEl) {
    const t = tileById(tileEl.dataset.id)!;
    view.drag = { mode: 'resize', handle, start: pt, id: t.id, orig: { x: t.x, y: t.y, w: t.w, h: t.h } };
  } else if (tileEl) {
    const id = tileEl.dataset.id!;
    if (e.shiftKey) {
      if (view.selected.has(id)) view.selected.delete(id); else view.selected.add(id);
    } else if (!view.selected.has(id)) {
      select(id);
    }
    const ts = selectedTiles();
    if (ts.length) {
      const x = Math.min(...ts.map((t) => t.x)), y = Math.min(...ts.map((t) => t.y));
      view.drag = {
        mode: 'move', start: pt, clickedId: id, shift: e.shiftKey, at, deepId: deepEl ? deepEl.dataset.id! : id,
        origs: new Map(ts.map((t) => [t.id, { x: t.x, y: t.y }])),
        bbox: { x, y, w: Math.max(...ts.map((t) => t.x + t.w)) - x, h: Math.max(...ts.map((t) => t.y + t.h)) - y },
      };
    }
  } else if (view.scope && (pt.x < 0 || pt.y < 0 || pt.x > L.frame.w || pt.y > L.frame.h)) {
    e.preventDefault();
    // clicked outside the tile you are in: on text elsewhere, go and type there
    if (deepEl && clickToType(tileById(deepEl.dataset.id), at)) return;
    exitScope();
    return;
  } else {
    if (!e.shiftKey) view.selected.clear();
    const start = { ...pt };
    if (view.snap && !e.altKey) {
      const T = targets(L, new Set()), thr = pxToMM(6);
      start.x += snapAxis({ s: pt.x, e: pt.x }, T.X, thr);
      start.y += snapAxis({ s: pt.y, e: pt.y }, T.Y, thr);
    }
    view.drag = { mode: 'draw', start };
  }
  dom.paper.setPointerCapture(e.pointerId);
  e.preventDefault();
  clearHover();
  render();
}

function onPointerMove(e: PointerEvent): void {
  const view = editor.view, d = view.drag;
  if (!d) { updateHover(e); return; }
  const pt = toMM(e);
  let dx = pt.x - d.start.x, dy = pt.y - d.start.y;
  if (!d.moved) {
    if (Math.hypot(dx, dy) < pxToMM(3)) return;
    d.moved = true;
  }
  const snap = view.snap && !e.altKey;
  const thr = pxToMM(6);
  const L = level();
  let gx: number[] = [], gy: number[] = [], draft = null;

  if (d.mode === 'move') {
    const T = targets(L, view.selected), b = d.bbox;
    if (snap) {
      dx += snapAxis(edgesOf(b.x + dx, b.w), T.X, thr);
      dy += snapAxis(edgesOf(b.y + dy, b.h), T.Y, thr);
      gx = matchedLines(edgesOf(b.x + dx, b.w), T.X);
      gy = matchedLines(edgesOf(b.y + dy, b.h), T.Y);
    }
    for (const [id, o] of d.origs) {
      const t = tileById(id)!;
      t.x = o.x + dx; t.y = o.y + dy;
    }
  } else if (d.mode === 'seam') {
    const s = d.seam, A = AX[s.axis];
    let delta = pt[s.axis] - d.start[s.axis];
    const T = targets(L, new Set(d.origs.keys()));
    const lines = s.axis === 'x' ? T.X : T.Y;
    const edges = (dd: number) => ({ ...(s.L.length ? { e: s.lo + dd } : {}), ...(s.R.length ? { s: s.hi + dd } : {}) });
    if (snap) delta += snapAxis(edges(delta), lines, thr);
    delta = Math.min(d.maxDelta, Math.max(d.minDelta, delta));
    for (const id of s.L) { const t = tileById(id)!, o = d.origs.get(id)!; t[A.l] = o.l + delta; }
    for (const id of s.R) { const t = tileById(id)!, o = d.origs.get(id)!; t[A.p] = o.p + delta; t[A.l] = o.l - delta; }
    if (snap) { const m = matchedLines(edges(delta), lines); if (s.axis === 'x') gx = m; else gy = m; }
  } else if (d.mode === 'free' || d.mode === 'cut') {
    return;
  } else if (d.mode === 'resize') {
    const o = d.orig, h = d.handle, t = tileById(d.id)!;
    const T = targets(L, new Set([d.id]));
    let l = o.x, r = o.x + o.w, top = o.y, bot = o.y + o.h;
    const sn = (edges: Parameters<typeof snapAxis>[0], lines: Parameters<typeof snapAxis>[1]) => (snap ? snapAxis(edges, lines, thr) : 0);
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
    const T = targets(L, new Set());
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

function onPointerUp(): void {
  const view = editor.view, d = view.drag;
  if (!d) return;
  view.drag = null;
  showGuides();
  if (d.mode === 'move' && !d.moved && !d.shift) {
    if (view.selected.size > 1) select(d.clickedId);
    // a plain click on text starts typing right away, at any depth
    if (clickToType(tileById(d.deepId), d.at)) { refreshHover(); return; }
  }
  if (d.mode === 'draw' && d.moved && d.rect && d.rect.w >= MIN && d.rect.h >= MIN) placeTile(d.rect);
  if (d.mode === 'cut') applyCut(d.plan);
  if (d.mode === 'free') { placeTile(d.rect); commit(); }
  if (d.moved) commit();
  render();
  refreshHover();
}

function onDoubleClick(e: MouseEvent): void {
  // pointer capture retargets click/dblclick to the paper, so hit-test ourselves
  const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  // while typing, double-click only ever selects a word (fast clicking must not change mode)
  if (editor.view.editing && hit?.closest('.tile.editing')) return;
  const tileEl = scopeEl(hit);
  if (!tileEl || !hit) return;
  const t = tileById(tileEl.dataset.id)!;
  const h = hit.dataset.handle;
  if (h) {
    const L = level();
    if (h.includes('n')) expand(L, t, 'up');
    if (h.includes('s')) expand(L, t, 'down');
    if (h.includes('w')) expand(L, t, 'left');
    if (h.includes('e')) expand(L, t, 'right');
    commit();
    render();
    return;
  }
  if (t.type === 'image' && !isSection(t)) pickImage(t);
  else enterTile(t);
}

export function bindPointer(): void {
  const { paper, stage, tiles } = dom;
  paper.addEventListener('pointerdown', onPointerDown);
  paper.addEventListener('pointermove', onPointerMove);
  paper.addEventListener('pointerup', onPointerUp);
  paper.addEventListener('pointercancel', onPointerUp);
  paper.addEventListener('dblclick', onDoubleClick);
  paper.addEventListener('pointerleave', () => { if (!editor.view.drag) clearHoverState(); });

  // leaving the text ends editing — except for the formatting toolbar
  tiles.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (editor.view.editing && !(to && dom.fmtbar.contains(to))) stopEditing();
  });

  // clicks on the grey area around the paper
  stage.addEventListener('pointerdown', (e) => {
    if (paper.contains(e.target as Node) || (e.target !== stage && e.target !== dom.sizer)) return;
    if (editor.view.editing) stopEditing();
    if (editor.view.scope) { exitScope(); return; }
    editor.view.selected.clear();
    render();
  });
}
