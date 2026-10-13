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

/**
 * Re-lay out tiles along one axis when their frame changes from `o` to `n`.
 * Tile edges split the span into intervals; intervals that are a gutter
 * between two tiles stay one gutter wide, header/footer heights stay as they
 * are, everything else (tiles and deliberate negative space) stretches.
 */
export function reflowAxis(kids: Tile[], A: AxisKeys, o: Span, n: Span): void {
  if (!kids.length) return;
  const lo = lowOf(o), hi = highOf(o), nlo = lowOf(n), nhi = highOf(n);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const starts = kids.map((k) => k[A.p]), ends = kids.map((k) => k[A.p] + k[A.l]);
  const E = [...new Set([lo, hi, ...starts, ...ends].map(r3))]
    .filter((v) => v >= lo - EPS && v <= hi + EPS).sort((a, b) => a - b);
  const near = (arr: number[], v: number) => arr.some((a) => Math.abs(a - v) < 0.01);
  const ivs: { len: number; fixed: boolean; keep: boolean }[] = [];
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
  const map = (v: number) => {
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

/**
 * Containers remember the frame their children were laid out for (lw, lh,
 * li, lg). Whenever that differs from the current one, reflow — so every tool
 * that resizes a tile (drags, cuts, fills, inspector) keeps nested layouts
 * intact. Run before rendering and before saving history.
 */
export function normalizeLayout(doc: Doc): void {
  walk(doc.tiles, (t) => {
    if (!isSection(t)) return;
    const cur = { w: t.w, h: t.h, m: t.inset || 0, g: innerGutter(doc, t) };
    if (t.lw == null) Object.assign(t, { lw: cur.w, lh: cur.h, li: cur.m, lg: cur.g });
    const was = { w: t.lw!, h: t.lh!, m: t.li!, g: t.lg! };
    if ([was.w - cur.w, was.h - cur.h, was.m - cur.m, was.g - cur.g].every((d) => Math.abs(d) < 1e-6)) return;
    reflowAxis(t.children, AX.x, { size: was.w, m: was.m, g: was.g }, { size: cur.w, m: cur.m, g: cur.g });
    reflowAxis(t.children, AX.y, { size: was.h, m: was.m, g: was.g }, { size: cur.h, m: cur.m, g: cur.g });
    Object.assign(t, { lw: cur.w, lh: cur.h, li: cur.m, lg: cur.g });
  });
}
