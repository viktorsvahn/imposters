/* Splitting tiles ("cuts"). A + on the left/right edge cuts a tile into upper
   and lower parts; on the top/bottom edge into left and right parts. */

import { EPS, MIN } from '../constants';
import { makeTile } from '../model/tile';
import { findTile, firstLeaf, gapOf, innerGutter, insetOf, isSection, parentOf } from '../model/tree';
import type { Doc, Point, Tile } from '../model/types';
import { clone, uid } from '../util';
import { AX, type Axis } from './axis';
import { bandAround, bandSnaps, type SnapCandidate } from './bands';
import { makeContainer } from './containers';
import type { Level } from './level';
import { columnsOf } from './snap';

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeHit {
  id: string;
  side: Side;
  dist: number;
  /** pointer position along the edge */
  q: number;
}

export interface CutPlan {
  ax: Axis;
  /** gutter centres of the cuts */
  cs: number[];
  /** tiles to cut */
  ids: string[];
  label: string;
  guide: number | null;
  edge: EdgeHit;
  equal?: boolean;
}

/** The tile edge under the pointer. Reaches `inner` mm into the tile and out
    into the gutter / margin beside it. */
export function edgeAt(level: Level, pt: Point, inner: number, skipId: string | null): EdgeHit | null {
  const P = level.frame, gx = P.gutter, gy = P.gutterY;
  let best: EdgeHit | null = null;
  for (const t of level.tiles) {
    if (t.id === skipId) continue;
    const r = t.x + t.w, b = t.y + t.h;
    const sides: [Side, number, number, number, number, number][] = [
      ['left', pt.x - t.x, pt.y, t.y, b, t.x <= P.margin + EPS ? t.x : gx / 2],
      ['right', r - pt.x, pt.y, t.y, b, r >= P.w - P.margin - EPS ? P.w - r : gx / 2],
      ['top', pt.y - t.y, pt.x, t.x, r, t.y <= P.margin + EPS ? t.y : gy / 2],
      ['bottom', b - pt.y, pt.x, t.x, r, b >= P.h - P.margin - EPS ? P.h - b : gy / 2],
    ];
    for (const [side, d, q, q0, q1, outer] of sides) {
      if (q < q0 || q > q1 || d > inner || d < -Math.max(outer, EPS)) continue;
      if (!best || Math.abs(d) < best.dist) best = { id: t.id, side, dist: Math.abs(d), q };
    }
  }
  return best;
}

/** Gutter centres that divide a tile into n equal parts along an axis. */
export function equalCuts(t: Tile, ax: Axis, n: number, g: number): number[] | null {
  const A = AX[ax];
  const part = (t[A.l] - (n - 1) * g) / n;
  if (part < MIN) return null;
  return Array.from({ length: n - 1 }, (_, i) => t[A.p] + (i + 1) * (part + g) - g / 2);
}

export interface CutOptions {
  /** snap the cut position */
  snap: boolean;
  /** equal parts instead of one free cut */
  equal: boolean;
  /** number of equal parts */
  parts: number;
  /** snap distance (mm) */
  thr: number;
  /** cut every tile the line crosses */
  wide?: boolean;
}

/**
 * Plan a cut from an edge hit. A free cut sits at the pointer's position along
 * the edge and snaps to ½ ⅓ ¼ of the tile and to lines continuing other tiles'
 * edges — or, in headers/footers, to squares and middles.
 */
export function cutPlan(doc: Doc, level: Level, edge: EdgeHit, o: CutOptions): CutPlan | null {
  const t = findTile(doc, edge.id);
  if (!t) return null;
  // cutting a header/footer divides what is inside it: its pieces are spaced like tiles inside a tile
  const ax: Axis = edge.side === 'left' || edge.side === 'right' ? 'y' : 'x';
  const g = t.role ? innerGutter(doc, t, ax) : gapOf(level.frame, ax);
  const A = AX[ax];
  const range = (k: Tile) => [k[A.p] + MIN + g / 2, k[A.p] + k[A.l] - MIN - g / 2];
  const crossed = (cs: number[]) => {
    const ids = o.wide
      ? level.tiles.filter((k) => { const [a, b] = range(k); return cs.every((c) => c >= a - EPS && c <= b + EPS); }).map((k) => k.id)
      : [t.id];
    if (!ids.includes(t.id)) ids.push(t.id);
    return ids;
  };

  if (o.equal) {
    const cs = equalCuts(t, ax, Math.max(2, o.parts), g);
    return cs && { ax, cs, ids: crossed(cs), label: '', guide: null, edge, equal: true };
  }

  const [lo, hi] = range(t);
  if (hi < lo) return null;
  let c = Math.min(hi, Math.max(lo, edge.q)), label = '', guide: number | null = null;

  if (o.snap) {
    const band = bandAround(doc, t);
    const cands: SnapCandidate[] = band
      ? bandSnaps(doc, level.frame, t, band, ax, g)
      : ([['¼', 1 / 4], ['⅓', 1 / 3], ['½', 1 / 2], ['⅔', 2 / 3], ['¾', 3 / 4]] as [string, number][])
        .map(([l, f]) => ({ c: t[A.p] + f * (t[A.l] - g) + g / 2, label: l, guide: null }));
    const lines: [number, number][] = band ? [] : level.tiles.filter((k) => k !== t).map((k) => [k[A.p], k[A.p] + k[A.l]]);
    if (ax === 'x' && !band) lines.push(...columnsOf(level.frame));
    for (const [o0, o1] of lines) {
      cands.push({ c: o0 - g / 2, label: 'aligned', guide: o0 }); // second part starts with them
      cands.push({ c: o1 + g / 2, label: 'aligned', guide: o1 }); // first part ends with them
    }
    let best: (SnapCandidate & { d: number }) | null = null;
    for (const k of cands) {
      if (k.c < lo - EPS || k.c > hi + EPS) continue;
      const d = Math.abs(k.c - c);
      if (d > o.thr) continue;
      if (!best || d < best.d - EPS || (Math.abs(d - best.d) < EPS && k.guide === null)) best = { ...k, d };
    }
    if (best) ({ c, label, guide } = best);
  }

  return { ax, cs: [c], ids: crossed([c]), label, guide, edge };
}

/** Cut a tile at the given gutter centres; the first piece keeps the content.
    Returns the ids of the new pieces. */
export function cutTile(doc: Doc, t: Tile, ax: Axis, cs: number[]): string[] {
  // the tile's own container (not necessarily the level being edited)
  const parent = parentOf(doc, t.id), list = parent ? parent.children! : doc.tiles;
  const A = AX[ax], g = parent ? innerGutter(doc, parent, ax) : gapOf(doc.paper, ax);
  const end = t[A.p] + t[A.l];
  const created: string[] = [];
  let at = list.indexOf(t);
  t[A.l] = cs[0] - g / 2 - t[A.p];
  const proto = clone(firstLeaf(t));
  delete proto.children;
  // pieces of a header/footer aren't the header themselves
  if (proto.role) { proto.inBand = proto.role; delete proto.role; }
  cs.forEach((c, i) => {
    const n: Tile = Object.assign(clone(proto), { id: uid(), html: '', src: '', x: t.x, y: t.y, w: t.w, h: t.h });
    n[A.p] = c + g / 2;
    n[A.l] = (i + 1 < cs.length ? cs[i + 1] - g / 2 : end) - n[A.p];
    list.splice(++at, 0, n);
    created.push(n.id);
  });
  return created;
}

/** Headers/footers are one coloured zone: cutting one divides its contents
    (transparent tiles inside it) instead of breaking the zone into pieces.
    cs are cut positions in the zone's container coordinates. */
export function cutZone(doc: Doc, z: Tile, ax: Axis, cs: number[]): string[] {
  const A = AX[ax];
  if (!isSection(z)) {
    makeContainer(doc, z, true);
    if (!z.children!.length) {
      const m = insetOf(z);
      z.children!.push(makeTile(doc.paper, 'text', { x: m, y: m, w: z.w - 2 * m, h: z.h - 2 * m, bg: '', color: z.color }));
    }
  }
  const local = cs.map((c) => c - z[A.p]);
  const out: string[] = [];
  for (const k of [...z.children!]) {
    if (k.role) continue;
    const mine = local.filter((c) => c > k[A.p] + MIN && c < k[A.p] + k[A.l] - MIN);
    if (mine.length) out.push(...(isSection(k) ? cutZone(doc, k, ax, mine.map((c) => c + k[A.p])) : cutTile(doc, k, ax, mine)));
  }
  return out;
}

/** Cut a tile, or — for a header/footer — its contents. Returns the ids to select. */
export function cutAny(doc: Doc, t: Tile, ax: Axis, cs: number[]): string[] {
  if (!t.role) return cutTile(doc, t, ax, cs);
  return cutZone(doc, t, ax, cs).length ? [t.id] : [];
}

/** Carry out a cut plan. Returns the ids to select. */
export function applyCutPlan(doc: Doc, plan: CutPlan): string[] {
  return plan.ids.flatMap((id) => {
    const t = findTile(doc, id);
    return t ? cutAny(doc, t, plan.ax, plan.cs) : [];
  });
}
