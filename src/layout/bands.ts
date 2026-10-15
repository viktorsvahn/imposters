/* Headers and footers ("bands"): tiles pinned to the top/bottom edge of their
   container, full width, bleeding past its margin. Their colour belongs to
   the zone: cutting one divides its contents instead. */

import { headerHtml, HEADER_STYLES, styleById } from '../model/design';
import { makeTile } from '../model/tile';
import { innerGutter, insetOf, originOf, parentOf } from '../model/tree';
import type { BandRole, Doc, Frame, Tile } from '../model/types';
import { round } from '../util';
import { AX, type Axis } from './axis';
import { visRect } from './bleed';
import { reflowAxis } from './reflow';

/** The layout frame of a container (a tile, or null for the paper). */
export function containerFrame(doc: Doc, c: Tile | null) {
  const P = doc.paper;
  return c
    ? { list: (c.children ||= []), w: c.w, h: c.h, m: insetOf(c), g: innerGutter(doc, c, 'y') }
    : { list: doc.tiles, w: P.w, h: P.h, m: P.margin, g: P.gutterY }; // headers and footers stack: the gap down
}

export function bandOf(doc: Doc, c: Tile | null, role: BandRole): Tile | null {
  if (c && !c.children) return null;
  return containerFrame(doc, c).list.find((t) => t.role === role) || null;
}

/**
 * Add or remove a header/footer. Adding makes room by reflowing the other
 * tiles; removing gives the space back. Returns the new band (when added).
 */
export function toggleBand(doc: Doc, c: Tile | null, role: BandRole, on: boolean): Tile | null {
  const f = containerFrame(doc, c), list = f.list, lo = f.m, hi = f.h - f.m, g = f.g;
  const band = list.find((t) => t.role === role);
  if (on === !!band) return null;
  const others = list.filter((t) => t !== band);
  const top = role === 'header';
  if (on) {
    // the band sits on the top/bottom edge itself (no top/bottom margin)
    const fit = top ? headerHeight(doc, c ? 'tile' : 'poster', doc.design.space.header.y) : 0;
    // a tile's header fits its title and subtitle; the poster's banner gets at least an eighth of the paper
    const hh = Math.min(round((hi - lo) * 0.5), c && top ? fit : Math.max(12, round((hi - lo) * (top ? 0.12 : 0.08)), fit));
    reflowAxis(others, AX.y, { lo, hi, g }, { lo: top ? Math.max(lo, hh + g) : lo, hi: top ? hi : Math.min(hi, f.h - hh - g), g });
    // coloured by the design's (tile) header/footer role — none by default inside tiles
    const colour = c ? (top ? '@tileHeader' : '@tileFooter') : '@' + role;
    const t = makeTile(doc.paper, 'text', {
      role, bleed: true, x: f.m, w: f.w - 2 * f.m, y: top ? 0 : f.h - hh, h: hh,
      bg: colour, color: colour, vAlign: 'middle',
      // a header starts with a title and a subtitle (the banner centred)
      html: top ? headerHtml(c ? 'tile' : 'poster') : '', align: top && !c ? 'center' : 'left',
    });
    if (top) list.unshift(t); else list.push(t);
    return t;
  }
  list.splice(list.indexOf(band!), 1);
  const was = top ? { lo: band!.y + band!.h + g, hi } : { lo, hi: band!.y - g };
  reflowAxis(others, AX.y, { ...was, g }, { lo, hi, g });
  return null;
}

const MM_PER_PT = 25.4 / 72;

/** Height (mm) a new header needs for its title and subtitle, at their styles' sizes. */
export function headerHeight(doc: Doc, kind: 'poster' | 'tile', padding: number): number {
  const [t, s] = HEADER_STYLES[kind].map((id) => styleById(doc.design, id)?.size ?? 24);
  const rows = kind === 'tile' && doc.design.tileSubtitle === 'beside' ? Math.max(t, s) : t + s;
  return round(rows * MM_PER_PT * 1.3 + 2 * padding);
}

/** The header/footer a tile is, or sits in (null elsewhere). */
export function bandAround(doc: Doc, t: Tile): Tile | null {
  for (let c: Tile | null = t; c; c = parentOf(doc, c.id)) if (c.role || c.inBand) return c;
  return null;
}

export interface SnapCandidate {
  c: number;
  label: string;
  guide: number | null;
}

/** Cut snaps inside headers/footers: a square piece at either end (measured on
    what you see: bleed included, margins ignored), the tile's middle, and the
    band's own centre line. `frame` is the frame of t's level. */
export function bandSnaps(doc: Doc, frame: Frame, t: Tile, band: Tile, ax: Axis, g: number): SnapCandidate[] {
  const A = AX[ax];
  const v = visRect(doc, t), p = parentOf(doc, t.id), o = originOf(doc, p);
  const side = ax === 'x' ? v.y1 - v.y0 : v.x1 - v.x0;
  const lo = (ax === 'x' ? v.x0 : v.y0) - o[ax], hi = (ax === 'x' ? v.x1 : v.y1) - o[ax];
  const out: SnapCandidate[] = [
    { c: lo + side + g / 2, label: '■ square', guide: null },
    { c: hi - side - g / 2, label: 'square ■', guide: null },
    { c: t[A.p] + t[A.l] / 2, label: '½ middle', guide: null },
  ];
  if (band === t && t.inBand) {
    // a piece of a cut header (older documents): its container's centre
    const mid = frame[A.size] / 2;
    out.push({ c: mid, label: 'centre', guide: mid });
  } else if (band !== t) {
    // band centre in the coordinates of t's container
    const bo = originOf(doc, band);
    const mid = bo[ax] + band[A.l] / 2 - o[ax];
    out.push({ c: mid, label: 'centre', guide: mid });
  }
  return out;
}
