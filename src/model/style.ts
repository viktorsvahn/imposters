/* Styling tiles. Styling a divided tile from outside styles what you see:
   text settings go to all text inside it, and the fill goes to the visible
   layer — the tile itself if it has its own background (e.g. a bleeding
   header), else its coloured sub-tiles. Everything else (padding, border, …)
   applies to the tile itself. */

import type { ColorRoleId, Doc, Tile } from './types';
import { isSection, leavesOf } from './tree';

const CASCADE = new Set<keyof Tile>([
  'color', 'font', 'fontSize', 'align', 'vAlign', 'ts', 'bold', 'italic', 'underline', 'leading', 'ps', 'cols',
]);

type Writable = Record<string, unknown>;

export function applyStyle(doc: Doc, t: Tile, prop: keyof Tile, v: unknown): void {
  // a design fill brings its text colour along, unless the text colour was chosen
  if (prop === 'bg') {
    const look = lookOf(t).text;
    const role = typeof v === 'string' && v[0] === '@' ? doc.design.colors[v.slice(1) as ColorRoleId] : null;
    if (role && role.text && (!look.color || look.color[0] === '@')) applyStyle(doc, t, 'color', v);
    else if (!role && look.color && look.color[0] === '@') applyStyle(doc, t, 'color', '');
  }
  if (!isSection(t)) { (t as unknown as Writable)[prop] = v; return; }
  if (CASCADE.has(prop)) {
    (t as unknown as Writable)[prop] = v;
    for (const k of leavesOf(t)) (k as unknown as Writable)[prop] = v;
  } else if (prop === 'bg' && !t.bg) {
    const filled = leavesOf(t).filter((k) => k.bg);
    if (filled.length) filled.forEach((k) => { k.bg = v as string; });
    else t.bg = v as string;
    if (t.innerBg !== undefined && v) t.innerBg = v as string;
  } else {
    (t as unknown as Writable)[prop] = v;
  }
}

/** The tiles whose fill and text the UI shows for t (see applyStyle). */
export function lookOf(t: Tile): { fill: Tile; text: Tile } {
  if (!isSection(t)) return { fill: t, text: t };
  const leaves = leavesOf(t);
  const text = leaves.find((k) => k.type === 'text') || t;
  return { fill: t.bg ? t : leaves.find((k) => k.bg) || t, text };
}
