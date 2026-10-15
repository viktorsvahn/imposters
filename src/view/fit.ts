/* Headers fit their content: a header too small for its title and subtitle
   (made before, or after its text or styles changed) grows until they fit,
   taking the room from the tiles right under it — as far as their own content
   allows. Runs after drawing (it needs the drawn text). */

import { editor } from '../editor/store';
import { innerGutter, walk } from '../model/tree';
import type { Tile } from '../model/types';
import { minimumSize } from './measure';

/** Grow headers that are too small. True if any changed (the page needs drawing again). */
export function fitHeaders(): boolean {
  if (editor.view.drag) return false; // not while a drag is going on
  const doc = editor.doc;
  let changed = false;
  const fit = (list: Tile[], g: number) => {
    for (const band of list.filter((t) => t.role === 'header')) {
      const need = minimumSize(band, 'y') - band.h;
      if (need < 0.3) continue;
      const edge = band.y + band.h + g;
      const under = list.filter((k) => k !== band && Math.abs(k.y - edge) < 0.5 && k.x < band.x + band.w && k.x + k.w > band.x);
      const room = Math.min(need, ...under.map((k) => k.h - minimumSize(k, 'y')));
      if (room < 0.3) continue;
      band.h += room;
      for (const k of under) { k.y += room; k.h -= room; }
      changed = true;
    }
  };
  fit(doc.tiles, doc.paper.gutterY); // the gap down
  walk(doc.tiles, (t) => { if (t.children) fit(t.children, innerGutter(doc, t, 'y')); });
  return changed;
}
