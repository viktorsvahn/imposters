import { walk } from '../model/tree';
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
    t.padding = round(t.padding * f);
    t.radius *= f;
    t.borderW *= f;
    t.inset = round((t.inset || 0) * f);
    if (t.gutter != null) t.gutter = round(t.gutter * f);
  });
  p.margin = round(p.margin * f);
  p.gutter = round(p.gutter * f);
  p.w = w;
  p.h = h;
}
