import { walk } from '../model/tree';
import { AX } from './axis';
import { reflowAxis } from './reflow';
import type { Doc } from '../model/types';
import { round } from '../util';

/** Scale the whole layout with the paper so a design can move between sizes.
    Nested tiles follow through normalizeLayout. */
export function resizePaper(doc: Doc, w: number, h: number): void {
  const p = doc.paper;
  const sx = w / p.w, sy = h / p.h, f = Math.sqrt(sx * sy);
  for (const t of doc.tiles) { t.x *= sx; t.w *= sx; t.y *= sy; t.h *= sy; }
  walk(doc.tiles, (t) => {
    if (t.fontSize) t.fontSize = round(t.fontSize * f);
    if (t.padX != null) t.padX = round(t.padX * f);
    if (t.padY != null) t.padY = round(t.padY * f);
    t.radius *= f;
    t.borderW *= f;
    t.inset = round((t.inset || 0) * f);
    if (t.gutter != null) t.gutter = round(t.gutter * f);
    if (t.gutterY != null) t.gutterY = round(t.gutterY * f);
  });
  p.margin = round(p.margin * f);
  p.gutter = round(p.gutter * f);
  p.gutterY = round(p.gutterY * f);
  doc.design.localGutter = round(doc.design.localGutter * f);
  doc.design.localGutterY = round(doc.design.localGutterY * f);
  for (const s of [doc.design.space.text, doc.design.space.header]) { s.x = round(s.x * f); s.y = round(s.y * f); }
  p.w = w;
  p.h = h;
}

/** New gaps between the poster's own tiles (across, down): they move apart (or together) to keep them,
    keeping their proportions. (Tiles inside tiles follow their own gutter through normalizeLayout.) */
export function setPaperGutter(doc: Doc, gx: number, gy: number): void {
  const p = doc.paper;
  reflowAxis(doc.tiles, AX.x, { size: p.w, m: p.margin, g: p.gutter }, { size: p.w, m: p.margin, g: gx });
  reflowAxis(doc.tiles, AX.y, { size: p.h, m: p.margin, g: p.gutterY }, { size: p.h, m: p.margin, g: gy });
  p.gutter = gx;
  p.gutterY = gy;
}
