/* Growing tiles into free space and finding free space. */

import { EPS, MIN } from '../constants';
import type { Point, Rect, Tile } from '../model/types';
import { overlaps } from './axis';
import type { Level } from './level';

export type Direction = 'left' | 'right' | 'up' | 'down';

/** Grow a tile in one direction until it meets a neighbour (minus gutter) or the margin. */
export function expand(level: Level, t: Tile, dir: Direction): void {
  const p = level.frame, g = p.gutter, m = p.margin;
  const others = level.tiles.filter((o) => o !== t);
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
  } else {
    let lim = p.h - m;
    for (const o of colMates) if (o.y >= t.y + t.h - EPS) lim = Math.min(lim, o.y - g);
    if (lim > t.y + t.h) t.h = lim - t.y;
  }
}

export function fillTile(level: Level, t: Tile): void {
  for (const d of ['left', 'right', 'up', 'down'] as Direction[]) expand(level, t, d);
}

/** Grow every tile until all gaps are closed. */
export function fillAll(level: Level): void {
  const order = [...level.tiles].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let pass = 0; pass < 2; pass++) order.forEach((t) => fillTile(level, t));
}

/** Largest empty rectangle inside the margins that keeps a gutter to every
    tile (optionally: containing a point). Its left/right edges must lie on a
    margin or a tile edge + gutter, so we try every such pair and sweep the
    blocked vertical intervals for gaps. */
export function largestFree(level: Level, at: Point | null = null): (Rect & { area: number }) | null {
  const { w: W, h: H, margin: m, gutter: g } = level.frame;
  const ts = level.tiles;
  const Ls = [m, ...ts.map((t) => t.x + t.w + g)];
  const Rs = [W - m, ...ts.map((t) => t.x - g)];
  let best: (Rect & { area: number }) | null = null;
  for (const l of Ls) {
    for (const r of Rs) {
      if (r - l < MIN || l < m - EPS || r > W - m + EPS) continue;
      if (at && (at.x < l || at.x > r)) continue;
      const blocked = ts.filter((t) => t.x < r - EPS && t.x + t.w > l + EPS)
        .map((t) => [t.y - g, t.y + t.h + g])
        .sort((a, b) => a[0] - b[0]);
      let cur = m;
      const gaps: [number, number][] = [];
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
