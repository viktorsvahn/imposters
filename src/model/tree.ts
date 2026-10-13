/* The tile tree. Tiles may hold child tiles (`children`), positioned relative
   to their parent. These helpers search and measure it. */

import type { Doc, Point, Tile } from './types';

export function walk(list: Tile[], fn: (t: Tile, parent: Tile | null) => void, parent: Tile | null = null): void {
  for (const t of list) {
    fn(t, parent);
    if (t.children) walk(t.children, fn, t);
  }
}

export function findTile(doc: Doc, id: string | null | undefined): Tile | null {
  if (!id) return null;
  let r: Tile | null = null;
  walk(doc.tiles, (t) => { if (t.id === id) r = t; });
  return r;
}

export function parentOf(doc: Doc, id: string): Tile | null {
  let r: Tile | null = null;
  walk(doc.tiles, (t, p) => { if (t.id === id) r = p; });
  return r;
}

/** The list a tile sits in (its parent's children, or the paper's tiles). */
export function siblingsOf(doc: Doc, t: Tile): Tile[] {
  const p = parentOf(doc, t.id);
  return p ? p.children! : doc.tiles;
}

/** A tile that is divided into tiles. */
export const isSection = (t: Tile | null | undefined): t is Tile & { children: Tile[] } =>
  !!(t && t.children && t.children.length);

export const insetOf = (t: Tile): number => t.inset ?? 0;

export const innerGutter = (doc: Doc, t: Tile): number => t.gutter ?? doc.paper.gutter;

/** Absolute position (on the paper) of a tile's top-left corner. */
export function originOf(doc: Doc, t: Tile | null): Point {
  let x = 0, y = 0;
  for (let c = t; c; c = parentOf(doc, c.id)) { x += c.x; y += c.y; }
  return { x, y };
}

export function firstLeaf(t: Tile): Tile {
  while (isSection(t)) t = t.children[0];
  return t;
}

export function leavesOf(t: Tile): Tile[] {
  const out: Tile[] = [];
  walk(t.children || [], (k) => { if (!isSection(k)) out.push(k); });
  return out;
}

/** Fresh ids for a copied subtree. */
export function reid(t: Tile, makeId: () => string): Tile {
  t.id = makeId();
  (t.children || []).forEach((k) => reid(k, makeId));
  return t;
}
