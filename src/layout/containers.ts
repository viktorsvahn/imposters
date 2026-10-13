/* Turning plain tiles into containers ("divided tiles") and back. */

import { EPS } from '../constants';
import { copyContent, hasContent, makeTile } from '../model/tile';
import { insetOf, isSection } from '../model/tree';
import type { Doc, Tile } from '../model/types';

/**
 * Turn a plain tile into a container. Its content (if any) becomes the first
 * sub-tile. An empty tile's fill moves to the tiles created inside so gutters
 * show through — unless keepBg (or it bleeds: that background must stay).
 */
export function makeContainer(doc: Doc, t: Tile, keepBg = false): void {
  if (isSection(t)) return;
  const keep = keepBg || t.bleed;
  if (!hasContent(t)) {
    Object.assign(t, { children: [], lw: null }, keep ? {} : { innerBg: t.bg, bg: '' });
    return;
  }
  const m = insetOf(t);
  const child = makeTile(doc.paper, t.type);
  copyContent(t, child);
  Object.assign(child, { x: m, y: m, w: t.w - 2 * m, h: t.h - 2 * m });
  if (keep) child.bg = '';
  Object.assign(t, { type: 'text', html: '', src: '', ts: '', children: [child], lw: null }, keep ? {} : { bg: '' });
}

/** Undo makeContainer for a container that was entered but never divided
    (one child filling it, or none). */
export function unwrapIfTrivial(t: Tile): void {
  const m = insetOf(t), only = t.children && t.children.length === 1 ? t.children[0] : null;
  if (only && !isSection(only) && Math.abs(only.x - m) < EPS && Math.abs(only.y - m) < EPS &&
      Math.abs(only.w - (t.w - 2 * m)) < EPS && Math.abs(only.h - (t.h - 2 * m)) < EPS) {
    copyContent(only, t, t.bleed ? ['bg'] : []);
    delete t.children;
  }
  if (t.children && !t.children.length) {
    delete t.children;
    if (t.innerBg !== undefined && !t.bg) t.bg = t.innerBg;
  }
}
