/* Bleed: where a tile touches its frame's margin, its background continues to
   the frame's outer edge (the paper edge on the top level). */

import { resolveBg } from '../model/design';
import { insetOf, originOf, parentOf } from '../model/tree';
import type { Doc, Tile } from '../model/types';

export interface Sides {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** How far a bleeding tile's background reaches past each side (mm). */
export function bleedSides(doc: Doc, t: Tile, parent: Tile | null): Sides | null {
  const P = doc.paper;
  const [W, H, m] = parent ? [parent.w, parent.h, insetOf(parent)] : [P.w, P.h, P.margin];
  const out = {
    l: t.x <= m + 0.5 ? Math.max(0, t.x) : 0,
    t: t.y <= m + 0.5 ? Math.max(0, t.y) : 0,
    r: t.x + t.w >= W - m - 0.5 ? Math.max(0, W - t.x - t.w) : 0,
    b: t.y + t.h >= H - m - 0.5 ? Math.max(0, H - t.y - t.h) : 0,
  };
  return out.l || out.t || out.r || out.b ? out : null;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The area a tile visibly covers, on the paper: its own bleed, plus — where
    it touches the inner edge of a coloured tile it sits in — that tile's area. */
export function visRect(doc: Doc, t: Tile): Box {
  const p = parentOf(doc, t.id), o = originOf(doc, p);
  const r = { x0: o.x + t.x, y0: o.y + t.y, x1: o.x + t.x + t.w, y1: o.y + t.y + t.h };
  const s = t.bleed && resolveBg(doc.design, t.bg) ? bleedSides(doc, t, p) : null;
  if (s) { r.x0 -= s.l; r.y0 -= s.t; r.x1 += s.r; r.y1 += s.b; }
  if (p && resolveBg(doc.design, p.bg)) {
    const pv = visRect(doc, p), m = insetOf(p) + 0.5;
    if (t.x <= m) r.x0 = Math.min(r.x0, pv.x0);
    if (t.y <= m) r.y0 = Math.min(r.y0, pv.y0);
    if (t.x + t.w >= p.w - m) r.x1 = Math.max(r.x1, pv.x1);
    if (t.y + t.h >= p.h - m) r.y1 = Math.max(r.y1, pv.y1);
  }
  return r;
}
