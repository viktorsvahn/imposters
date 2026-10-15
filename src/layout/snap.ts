/* Snapping while moving, resizing and drawing tiles. */

import { originOf, walk } from '../model/tree';
import type { Doc, Frame, Tile } from '../model/types';
import type { EdgeKind, Edges } from './axis';
import type { Level } from './level';

export interface SnapLine {
  v: number;
  k: EdgeKind;
}

/** Column guides of a frame, as [start, end] pairs. */
export function columnsOf(f: Frame): [number, number][] {
  if (!f.columns) return [];
  const cw = (f.w - 2 * f.margin - (f.columns - 1) * f.gutter) / f.columns;
  if (cw <= 0) return [];
  return Array.from({ length: f.columns }, (_, i) => {
    const s = f.margin + i * (cw + f.gutter);
    return [s, s + cw] as [number, number];
  });
}

/** Snap lines of a level. Neighbour tiles contribute both "aligned" lines
    and "one gutter away" lines. */
export function targets(level: Level, exclude: Set<string>): { X: SnapLine[]; Y: SnapLine[] } {
  const p = level.frame, m = p.margin;
  const X: SnapLine[] = [], Y: SnapLine[] = [];
  const add = (arr: SnapLine[], v: number, k: EdgeKind) => arr.push({ v, k });
  for (const [arr, size] of [[X, p.w], [Y, p.h]] as [SnapLine[], number][]) {
    add(arr, 0, 's'); add(arr, size, 'e');
    add(arr, m, 's'); add(arr, size - m, 'e'); add(arr, size / 2, 'c');
  }
  for (const [a, b] of columnsOf(p)) { add(X, a, 's'); add(X, b, 'e'); }
  for (const t of level.tiles) {
    if (exclude.has(t.id)) continue;
    for (const [arr, pos, len, g] of [[X, t.x, t.w, p.gutter], [Y, t.y, t.h, p.gutterY]] as [SnapLine[], number, number, number][]) {
      add(arr, pos, 's'); add(arr, pos + len, 'e'); add(arr, pos + len / 2, 'c');
      add(arr, pos + len + g, 's'); add(arr, pos - g, 'e');
    }
  }
  return { X, Y };
}

/** Edges of tiles on other levels — the header inside the tile next door, the tiles around the one you
    are inside — in the coordinates of the level inside `scope` (null: the paper). Tiles that move along
    (`exclude` and what is inside them) don't count. */
export function neighbourLines(doc: Doc, scope: Tile | null, exclude: Set<string>): { X: SnapLine[]; Y: SnapLine[] } {
  const X: SnapLine[] = [], Y: SnapLine[] = [];
  const o = originOf(doc, scope);
  const here = new Set((scope ? scope.children ?? [] : doc.tiles).map((t) => t.id));
  const moving = new Set(exclude);
  walk(doc.tiles, (t, parent) => {
    if (parent && moving.has(parent.id)) moving.add(t.id);
    if (moving.has(t.id) || here.has(t.id) || t.id === scope?.id) return;
    const p = originOf(doc, parent), x = p.x + t.x - o.x, y = p.y + t.y - o.y;
    X.push({ v: x, k: 's' }, { v: x + t.w, k: 'e' });
    Y.push({ v: y, k: 's' }, { v: y + t.h, k: 'e' });
  });
  return { X, Y };
}

/** All snap lines while working on the level inside `scope`: its own, and those of tiles on other levels. */
export function allTargets(doc: Doc, level: Level, scope: Tile | null, exclude: Set<string>): { X: SnapLine[]; Y: SnapLine[] } {
  const own = targets(level, exclude), more = neighbourLines(doc, scope, exclude);
  return { X: [...own.X, ...more.X], Y: [...own.Y, ...more.Y] };
}

/** The smallest correction that lands one of the edges on a matching line. */
export function snapAxis(edges: Edges, lines: SnapLine[], thr: number): number {
  let best: number | null = null;
  for (const [k, v] of Object.entries(edges) as [EdgeKind, number][]) {
    for (const l of lines) {
      if (l.k !== k) continue;
      const d = l.v - v;
      if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best ?? 0;
}

/** The lines some edge currently sits on (for guide display). */
export function matchedLines(edges: Edges, lines: SnapLine[]): number[] {
  const out = new Set<number>();
  for (const [k, v] of Object.entries(edges) as [EdgeKind, number][]) {
    for (const l of lines) if (l.k === k && Math.abs(l.v - v) < 0.05) out.add(l.v);
  }
  return [...out];
}
