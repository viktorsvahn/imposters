/* Keeping nested layouts intact when a container changes size. */

import { EPS } from '../constants';
import { innerGutter, isSection, walk } from '../model/tree';
import type { Doc, Tile } from '../model/types';
import { AX, type AxisKeys } from './axis';

/** A container's layout span on one axis: [lo, hi] (or size − margins) and gutter. */
export interface Span {
  lo?: number;
  hi?: number;
  size?: number;
  m?: number;
  g: number;
}

const lowOf = (s: Span) => s.lo ?? s.m!;
const highOf = (s: Span) => s.hi ?? s.size! - s.m!;

interface Interval { len: number; fixed: boolean; keep: boolean }

/** A span cut at the tiles' edges into intervals: gutters between tiles and header/footer heights are
    fixed; tiles and negative space can stretch. */
function intervalsOf(kids: Tile[], A: AxisKeys, lo: number, hi: number, g: number): { E: number[]; ivs: Interval[] } {
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const starts = kids.map((k) => k[A.p]), ends = kids.map((k) => k[A.p] + k[A.l]);
  const near = (arr: number[], v: number) => arr.some((a) => Math.abs(a - v) < 0.01);
  // where one tile ends and the next starts (touching: no gutter), keep a gutter of width 0 between them,
  // so a gutter can open there when the frame gets one
  const E = [...new Set([lo, hi, ...starts, ...ends].map(r3))]
    .filter((v) => v >= lo - EPS && v <= hi + EPS).sort((a, b) => a - b)
    .flatMap((v) => (g < 0.05 && v > lo + EPS && v < hi - EPS && near(ends, v) && near(starts, v) ? [v, v] : [v]));
  const ivs: Interval[] = [];
  for (let i = 0; i + 1 < E.length; i++) {
    const a = E[i], b = E[i + 1];
    const gutter = Math.abs(b - a - g) < 0.05 && near(ends, a) && near(starts, b);
    const band = A.p === 'y' && kids.some((k) => k.role && k.y <= a + EPS && k.y + k.h >= b - EPS);
    ivs.push({ len: b - a, fixed: gutter || band, keep: band });
  }
  return { E, ivs };
}

/** How much each interval can give up without shrinking any content: `gap` — negative space no tile
    covers; `room` — its share of the unused room of the tiles covering it (below their text, …). */
function capacitiesOf(kids: Tile[], A: AxisKeys, E: number[], ivs: Interval[], minLen: (t: Tile) => number | null): { gap: number[]; room: number[] } {
  const gap: number[] = [], room: number[] = [];
  ivs.forEach((iv, i) => {
    gap.push(0);
    room.push(0);
    if (iv.fixed || iv.len < EPS) return;
    const a = E[i], b = E[i + 1];
    const cover = kids.filter((kd) => kd[A.p] <= a + EPS && kd[A.p] + kd[A.l] >= b - EPS);
    if (!cover.length) { gap[i] = iv.len; return; }
    room[i] = Math.min(...cover.map((kd) => {
      const m = minLen(kd);
      return m === null ? 0 : (Math.max(0, kd[A.l] - m) * iv.len) / kd[A.l];
    }));
  });
  return { gap, room };
}

/** The smallest length (mm) a tile can have along an axis without shrinking content: a plain tile's from its
    content (`leaf`), a divided tile's from what is inside it. Null: unknown. */
export function minimumOf(doc: Doc, t: Tile, ax: 'x' | 'y', leaf: (t: Tile, ax: 'x' | 'y') => number | null): number | null {
  if (!isSection(t)) return leaf(t, ax);
  const A = AX[ax], m = t.inset || 0;
  const { E, ivs } = intervalsOf(t.children, A, m, t[A.l] - m, innerGutter(doc, t, ax));
  const { gap, room } = capacitiesOf(t.children, A, E, ivs, (k) => minimumOf(doc, k, ax, leaf));
  return t[A.l] - gap.reduce((s, v) => s + v, 0) - room.reduce((s, v) => s + v, 0);
}

/**
 * Re-lay out tiles along one axis when their frame changes from `o` to `n`.
 * Tile edges split the span into intervals; intervals that are a gutter
 * between two tiles stay one gutter wide, header/footer heights stay as they
 * are, everything else (tiles and deliberate negative space) stretches.
 * Shrinking (with `minLen`) first takes negative space between tiles, then the room tiles don't use, and
 * only then shrinks everything in proportion.
 */
export function reflowAxis(kids: Tile[], A: AxisKeys, o: Span, n: Span, minLen?: (t: Tile) => number | null): void {
  if (!kids.length) return;
  const lo = lowOf(o), hi = highOf(o), nlo = lowOf(n), nhi = highOf(n);
  const { E, ivs } = intervalsOf(kids, A, lo, hi, o.g);
  const S = ivs.reduce((s, iv) => s + (iv.fixed ? 0 : iv.len), 0);
  const fixedLen = ivs.reduce((s, iv) => s + (iv.keep ? iv.len : iv.fixed ? n.g : 0), 0);
  const T = Math.max(0, nhi - nlo - fixedLen), k = S > EPS ? T / S : 1;
  let lens = ivs.map((iv) => iv.len * k);
  if (minLen && T < S - EPS) {
    const { gap, room } = capacitiesOf(kids, A, E, ivs, minLen);
    const G = gap.reduce((s, c) => s + c, 0), R = room.reduce((s, c) => s + c, 0);
    let D = S - T;
    // 1. negative space between tiles; 2. the room tiles don't use; 3. everything in proportion
    lens = ivs.map((iv) => iv.len);
    const take = (cap: number[], total: number) => {
      const t = Math.min(D, total);
      if (total > EPS) lens = lens.map((l, i) => l - (t * cap[i]) / total);
      D -= t;
    };
    take(gap, G);
    take(room, R);
    if (D > EPS) {
      const rest = lens.reduce((s, l, i) => s + (ivs[i].fixed ? 0 : l), 0);
      lens = lens.map((l, i) => (ivs[i].fixed || rest < EPS ? 0 : l * (rest - D) / rest));
    }
  }
  const NE = [nlo];
  ivs.forEach((iv, i) => NE.push(NE[i] + (iv.keep ? iv.len : iv.fixed ? n.g : lens[i])));
  /** Where an edge goes: starts take the far side of a 0-wide gutter, ends the near side. */
  const map = (v: number, start: boolean) => {
    if (v < lo - EPS) return v - lo + nlo;
    if (v > hi + EPS) return v - hi + nhi;
    let best = 0;
    E.forEach((e, j) => {
      const d = Math.abs(e - v), db = Math.abs(E[best] - v);
      if (d < db - 1e-9 || (start && Math.abs(d - db) < 1e-9)) best = j;
    });
    return NE[best];
  };
  for (const kd of kids) {
    const a = map(kd[A.p], true), b = map(kd[A.p] + kd[A.l], false);
    kd[A.p] = a;
    kd[A.l] = Math.max(0.1, b - a);
  }
}

/** How small a tile's content lets it be along an axis (mm; null: unknown — it has no room to spare).
    Measured by the view, which draws the content; layout itself never sees the page. */
let contentMin: ((t: Tile, axis: 'x' | 'y') => number | null) | null = null;

export function setContentMeasure(fn: (t: Tile, axis: 'x' | 'y') => number | null): void {
  contentMin = fn;
}

/**
 * Containers remember the frame their children were laid out for (lw, lh,
 * li, lg). Whenever that differs from the current one, reflow — so every tool
 * that resizes a tile (drags, cuts, fills, inspector) keeps nested layouts
 * intact. Run before rendering and before saving history.
 */
export function normalizeLayout(doc: Doc): void {
  walk(doc.tiles, (t) => {
    if (!isSection(t)) return;
    const cur = { w: t.w, h: t.h, m: t.inset || 0, g: innerGutter(doc, t, 'x'), gy: innerGutter(doc, t, 'y') };
    if (t.lw == null) Object.assign(t, { lw: cur.w, lh: cur.h, li: cur.m, lg: cur.g, lgy: cur.gy });
    const was = { w: t.lw!, h: t.lh!, m: t.li!, g: t.lg!, gy: t.lgy ?? t.lg! };
    if ([was.w - cur.w, was.h - cur.h, was.m - cur.m, was.g - cur.g, was.gy - cur.gy].every((d) => Math.abs(d) < 1e-6)) return;
    const min = (ax: 'x' | 'y') => (contentMin ? (k: Tile) => minimumOf(doc, k, ax, contentMin!) : undefined);
    reflowAxis(t.children, AX.x, { size: was.w, m: was.m, g: was.g }, { size: cur.w, m: cur.m, g: cur.g }, min('x'));
    reflowAxis(t.children, AX.y, { size: was.h, m: was.m, g: was.gy }, { size: cur.h, m: cur.m, g: cur.gy }, min('y'));
    Object.assign(t, { lw: cur.w, lh: cur.h, li: cur.m, lg: cur.g, lgy: cur.gy });
  });
}
