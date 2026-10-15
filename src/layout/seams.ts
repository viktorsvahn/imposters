/* Seams: the gutter between tiles. Dragging a seam resizes both sides. */

import { EPS, MIN } from '../constants';
import type { Frame, Point, Tile } from '../model/types';
import { AX, type Axis } from './axis';
import type { Level } from './level';

export interface Seam {
  axis: Axis;
  /** gutter centre */
  c: number;
  /** end of the tiles before / start of the tiles after */
  lo: number;
  hi: number;
  /** cross-axis span */
  a: number;
  b: number;
  dist: number;
  /** ids of the tiles ending before (L) and starting after (R) the seam */
  L: string[];
  R: string[];
}

/** The seam under a point: the tiles ending just before it and starting just
    after it, over one contiguous span. A seam against the margin has only one
    side. `tol` is the grab distance (mm). */
export function seamAt(level: Level, pt: Point, tol: number): Seam | null {
  const P = level.frame, tol0 = tol;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  let best: Seam | null = null;
  for (const axis of ['x', 'y'] as Axis[]) {
    const A = AX[axis], v = pt[axis], q = pt[A.cp], size = P[A.size];
    const g = axis === 'x' ? P.gutter : P.gutterY; // across or down
    tol = Math.max(g / 2, tol0);
    // gutters (one gutter wide), and wider gaps opened between tiles: from a tile's end to the next start
    const spans = new Map<string, { lo: number; hi: number; gap: boolean }>();
    const add = (lo: number, hi: number, gap: boolean) => spans.set(`${lo.toFixed(2)}|${hi.toFixed(2)}`, { lo, hi, gap });
    const starts = level.tiles.map((t) => t[A.p]);
    for (const t of level.tiles) {
      add(t[A.p] - g, t[A.p], false);
      const e = t[A.p] + t[A.l];
      add(e, e + g, false);
      // the next start after this end, if the space up to it is wider than a gutter and nothing is in it
      const next = Math.min(...starts.filter((s) => s > e + 0.5));
      const empty = !level.tiles.some((o) => o[A.p] < next - EPS && o[A.p] + o[A.l] > e + EPS);
      if (Number.isFinite(next) && next > e + g + 0.5 && empty) add(e, next, true);
    }
    for (const { lo, hi, gap } of spans.values()) {
      const c = (lo + hi) / 2;
      const outerBefore = near(hi, P.margin), outerAfter = near(lo, size - P.margin);
      const dist = Math.abs(v - c);
      const inZone = (gap ? v >= lo && v <= hi : dist <= tol) || (outerBefore && v >= 0 && v <= hi) || (outerAfter && v >= lo && v <= size);
      if (!inZone || (best && dist >= best.dist)) continue;

      const Ls = level.tiles.filter((t) => near(t[A.p] + t[A.l], lo));
      const Rs = level.tiles.filter((t) => near(t[A.p], hi));
      const group = [...Ls, ...Rs];
      const inc = new Set<Tile>(group.filter((t) => t[A.cp] <= q && q <= t[A.cp] + t[A.cl]));
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

/**
 * Open (h > 0) or close (h < 0) space symmetrically at gaps along an axis: the tiles before a gap give up h
 * at their end, the tiles after it h at their start. `only`: the gap of one seam; otherwise every gap between
 * the tiles (edges against the frame, and headers/footers, stay). Tiles keep their minimum (`minOf`, at
 * least MIN); gaps don't close past 0.
 * Returns the h applied.
 */
export function spaceOut(tiles: Tile[], ax: Axis, frame: Frame, h: number, only?: { L: string[]; R: string[] }, minOf: (t: Tile) => number = () => MIN): number {
  const A = AX[ax], lo = frame.margin, hi = frame[A.size] - frame.margin;
  const body = tiles.filter((t) => !t.role);
  const cross = (a: Tile, b: Tile) => a[A.cp] < b[A.cp] + b[A.cl] - EPS && b[A.cp] < a[A.cp] + a[A.cl] - EPS;
  const endOf = (t: Tile) => t[A.p] + t[A.l];
  // which edges move: ends before a gap, starts after one
  const ends = new Set<Tile>(), starts = new Set<Tile>();
  if (only) {
    for (const t of body) { if (only.L.includes(t.id)) ends.add(t); if (only.R.includes(t.id)) starts.add(t); }
  } else {
    for (const t of body) {
      if (endOf(t) < hi - EPS && body.some((o) => o !== t && cross(o, t) && o[A.p] >= endOf(t) - EPS)) ends.add(t);
      if (t[A.p] > lo + EPS && body.some((o) => o !== t && cross(o, t) && endOf(o) <= t[A.p] + EPS)) starts.add(t);
    }
  }
  if (!ends.size && !starts.size) return 0;
  // limits: every tile keeps MIN; no gap closes past touching
  let max = Infinity, min = -Infinity;
  for (const t of body) {
    const n = Number(ends.has(t)) + Number(starts.has(t));
    if (n) max = Math.min(max, (t[A.l] - Math.max(MIN, minOf(t))) / n);
  }
  for (const t of starts) {
    const before = body.filter((o) => o !== t && cross(o, t) && endOf(o) <= t[A.p] + EPS).map(endOf);
    if (before.length) min = Math.max(min, -(t[A.p] - Math.max(...before)) / 2);
  }
  h = Math.max(Math.min(h, Math.max(0, max)), Math.min(0, min));
  for (const t of ends) t[A.l] -= h;
  for (const t of starts) { t[A.p] += h; t[A.l] -= h; }
  return h;
}
