/* Seams: the gutter between tiles. Dragging a seam resizes both sides. */

import { EPS } from '../constants';
import type { Point, Tile } from '../model/types';
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
  const P = level.frame, g = P.gutter;
  tol = Math.max(g / 2, tol);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  let best: Seam | null = null;
  for (const axis of ['x', 'y'] as Axis[]) {
    const A = AX[axis], v = pt[axis], q = pt[A.cp], size = P[A.size];
    const centers = new Set<number>();
    for (const t of level.tiles) {
      centers.add(t[A.p] - g / 2);
      centers.add(t[A.p] + t[A.l] + g / 2);
    }
    for (const c of centers) {
      const lo = c - g / 2, hi = c + g / 2;
      const outerBefore = near(hi, P.margin), outerAfter = near(lo, size - P.margin);
      const dist = Math.abs(v - c);
      const inZone = dist <= tol || (outerBefore && v >= 0 && v <= hi) || (outerAfter && v >= lo && v <= size);
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
