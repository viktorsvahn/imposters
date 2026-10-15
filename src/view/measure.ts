/* How small a tile's content lets it be — the room it doesn't use can go when
   the tile it sits in gets smaller (see reflowAxis). Text needs its height at
   the current width; a picture drawn whole ("contain") needs its drawn size. */

import { MIN, PX } from '../constants';
import { editor } from '../editor/store';
import { minimumOf } from '../layout/reflow';
import { paddingOf } from '../model/design';
import { isSection } from '../model/tree';
import type { Tile } from '../model/types';
import { tileEl } from './paper';

export function contentMinimum(t: Tile, axis: 'x' | 'y'): number | null {
  if (isSection(t)) return null;
  const el = tileEl(t.id);
  if (!el) return null;
  const bx = (el.offsetWidth - el.clientWidth) / PX, by = (el.offsetHeight - el.clientHeight) / PX; // borders
  if (t.type === 'text') return axis === 'y' ? el.content.scrollHeight / PX + by : null; // text rewraps across
  const img = el.content.querySelector('img'), svg = el.content.querySelector<SVGSVGElement>('.plot-svg svg');
  let ratio = 0;
  if (img && t.fit !== 'cover' && img.naturalWidth) ratio = img.naturalWidth / img.naturalHeight;
  else if (svg?.viewBox.baseVal?.width) ratio = svg.viewBox.baseVal.width / svg.viewBox.baseVal.height;
  if (!ratio) return null;
  const p = paddingOf(editor.doc.design, t), cw = t.w - 2 * p.x - bx, ch = t.h - 2 * p.y - by;
  const w = Math.min(cw, ch * ratio), h = w / ratio;
  return axis === 'x' ? w + 2 * p.x + bx : h + 2 * p.y + by;
}

/** How small a tile may be made (mm) without its text shrinking or being cut off: the height its text
    needs, for a divided tile what its tiles need plus the gaps between them. Pictures and plots can shrink. */
export function minimumSize(t: Tile, axis: 'x' | 'y'): number {
  const leaf = (k: Tile, ax: 'x' | 'y') => (ax === 'y' && k.type === 'text' ? contentMinimum(k, 'y') : MIN);
  return Math.max(MIN, minimumOf(editor.doc, t, axis, leaf) ?? MIN);
}
