/* Document commands: each changes the document / selection for the current
   level, records a history step and redraws. UI code calls these. */

import { MIN } from '../constants';
import { AX } from '../layout/axis';
import { toggleBand } from '../layout/bands';
import { makeContainer, unwrapIfTrivial } from '../layout/containers';
import { applyCutPlan, cutAny, equalCuts, type CutPlan } from '../layout/cuts';
import { fillAll, fillTile, largestFree } from '../layout/fill';
import { setLevelTiles } from '../layout/level';
import { makeTile } from '../model/tile';
import { isSection, parentOf, reid } from '../model/tree';
import type { BandRole, Tile, TileType } from '../model/types';
import { clone, uid } from '../util';
import { commit } from './history';
import { hooks, notify, render } from './hooks';
import { editor, level, scopeTile, select, selectedTiles } from './store';

const done = (): void => { commit(); render(); };

/** A new tile for the current level (inside a tile it takes that tile's fill). */
export function newTileHere(type: TileType, props: Partial<Tile> = {}): Tile {
  const s = scopeTile();
  const style: Partial<Tile> = !s || type !== 'text' ? {}
    : s.bleed ? { bg: '', color: s.color }
    : s.innerBg !== undefined ? { bg: s.innerBg } : {};
  return makeTile(editor.doc.paper, type, { ...style, ...props });
}

/** Add a tile in the largest free area of the current level. */
export function addTile(type: TileType, props: Partial<Tile> = {}): Tile {
  const L = level(), free = largestFree(L);
  let rect;
  if (free) {
    rect = { x: free.x, y: free.y, w: free.w, h: free.h };
  } else {
    const f = L.frame, w = f.w * 0.3, h = f.h * 0.2;
    rect = { x: (f.w - w) / 2, y: (f.h - h) / 2, w, h };
    notify('No free space left — placed on top. Split a tile to make room.');
  }
  const t = newTileHere(type, { ...rect, ...props });
  L.tiles.push(t);
  select(t.id);
  done();
  return t;
}

/** Add a tile with a given rectangle (drawn, or filling a free area). */
export function placeTile(rect: { x: number; y: number; w: number; h: number }): Tile {
  const t = newTileHere('text', rect);
  level().tiles.push(t);
  select(t.id);
  return t;
}

/** Split the selected tiles into equal parts (columns or rows). */
export function splitSelected(vertical: boolean): void {
  const ax = vertical ? 'x' : 'y', g = level().frame.gutter;
  const created: string[] = [];
  for (const t of selectedTiles()) {
    const cs = equalCuts(t, ax, editor.view.parts, g);
    if (cs) created.push(...cutAny(editor.doc, t, ax, cs));
  }
  if (!created.length) { notify('Tile is too small to split'); return; }
  select(...created);
  done();
}

export function applyCut(plan: CutPlan): void {
  select(...applyCutPlan(editor.doc, plan));
  done();
}

export function setParts(n: number): void {
  editor.view.parts = Math.min(12, Math.max(2, Math.round(n) || 2));
  render();
  hooks.refreshHover();
}

export function fillSelected(): void {
  const L = level();
  selectedTiles().forEach((t) => fillTile(L, t));
  done();
}

export function fillGaps(): void {
  fillAll(level());
  done();
}

export function duplicateSelected(): void {
  const ts = selectedTiles();
  if (!ts.length) return;
  const g = level().frame.gutter || 5;
  const copies = ts.map((t) => Object.assign(reid(clone(t), uid), { x: t.x + g, y: t.y + g }));
  level().tiles.push(...copies);
  select(...copies.map((t) => t.id));
  done();
}

export function deleteSelected(): void {
  const L = level(), sel = editor.view.selected;
  setLevelTiles(editor.doc, L, L.tiles.filter((t) => !sel.has(t.id)));
  sel.clear();
  done();
}

export function reorderSelected(where: 'front' | 'back'): void {
  const L = level(), sel = editor.view.selected, ts = selectedTiles();
  const rest = L.tiles.filter((t) => !sel.has(t.id));
  setLevelTiles(editor.doc, L, where === 'front' ? [...rest, ...ts] : [...ts, ...rest]);
  done();
}

export type ArrangeKind = 'left' | 'right' | 'top' | 'bottom' | 'matchW' | 'matchH' | 'evenW' | 'evenH';

/** Align / size / distribute the selected tiles. */
export function arrangeSelected(kind: ArrangeKind): void {
  const ts = selectedTiles();
  if (!ts.length) return;
  const g = level().frame.gutter;
  const minX = Math.min(...ts.map((t) => t.x)), maxR = Math.max(...ts.map((t) => t.x + t.w));
  const minY = Math.min(...ts.map((t) => t.y)), maxB = Math.max(...ts.map((t) => t.y + t.h));
  switch (kind) {
    case 'left': ts.forEach((t) => { t.x = minX; }); break;
    case 'right': ts.forEach((t) => { t.x = maxR - t.w; }); break;
    case 'top': ts.forEach((t) => { t.y = minY; }); break;
    case 'bottom': ts.forEach((t) => { t.y = maxB - t.h; }); break;
    case 'matchW': ts.forEach((t) => { t.w = ts[0].w; }); break;
    case 'matchH': ts.forEach((t) => { t.h = ts[0].h; }); break;
    case 'evenW':
    case 'evenH': {
      const A = AX[kind === 'evenW' ? 'x' : 'y'];
      const lo = kind === 'evenW' ? minX : minY, hi = kind === 'evenW' ? maxR : maxB;
      const len = (hi - lo - (ts.length - 1) * g) / ts.length;
      if (len < MIN) { notify('Not enough room'); return; }
      [...ts].sort((a, b) => a[A.p] - b[A.p]).forEach((t, i) => { t[A.p] = lo + i * (len + g); t[A.l] = len; });
      break;
    }
  }
  done();
}

/* ---- levels ---- */

/** Go into a tile to create tiles inside it, just like on the paper. */
export function enterTile(t: Tile | null): void {
  if (!t) return;
  if (editor.view.editing) hooks.stopEditing();
  makeContainer(editor.doc, t);
  editor.view.scope = t.id;
  select();
  done();
  hooks.refreshHover();
}

/** Go back out one level. A tile entered but never divided folds back up. */
export function exitScope(): void {
  const s = scopeTile();
  if (!s) return;
  if (editor.view.editing) hooks.stopEditing();
  const up = parentOf(editor.doc, s.id);
  editor.view.scope = up ? up.id : null;
  unwrapIfTrivial(s);
  select(s.id);
  done();
  hooks.refreshHover();
}

/** Leave levels until `to` (an ancestor id, or null for the paper) is current. */
export function exitTo(to: string | null): void {
  while (editor.view.scope && editor.view.scope !== to) exitScope();
}

/* ---- headers / footers ---- */

/** Add or remove the header/footer of a container (a tile, or null = the poster).
    A plain tile is turned into a container first (its content moves inside). */
export function setBand(c: Tile | null, role: BandRole, on: boolean): void {
  if (editor.view.editing) hooks.stopEditing();
  if (c && on) makeContainer(editor.doc, c, true);
  const band = toggleBand(editor.doc, c, role, on);
  if (c && !on && c.children && !c.children.length) delete c.children;
  const here = (t: Tile | null) => (t ? t.id : null) === editor.view.scope;
  if (band && here(c)) select(band.id);
  else if (c && here(parentOf(editor.doc, c.id))) select(c.id);
  else if (!on) editor.view.selected.forEach((id) => { if (!level().tiles.some((t) => t.id === id)) editor.view.selected.delete(id); });
  done();
}

/* ---- images ---- */

export function setTileImage(t: Tile, src: string): void {
  if (isSection(t)) return;
  if (t.type !== 'image') { t.type = 'image'; t.padding = 0; }
  t.src = src;
}
