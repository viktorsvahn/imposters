/* Screen ↔ paper coordinates and DOM hit-testing. */

import { PX } from '../constants';
import { editor, scopeOrigin } from '../editor/store';
import { parentOf } from '../model/tree';
import type { Point } from '../model/types';
import { dom } from '../view/dom';

export interface ClientPoint {
  clientX: number;
  clientY: number;
}

/** Pointer position in mm, in the current level's coordinates (or the paper's). */
export function toMM(e: ClientPoint, onPaper = false): Point {
  const r = dom.paper.getBoundingClientRect();
  const k = PX * editor.view.zoom, o = onPaper ? { x: 0, y: 0 } : scopeOrigin();
  return { x: (e.clientX - r.left) / k - o.x, y: (e.clientY - r.top) / k - o.y };
}

/** Screen pixels → mm at the current zoom (for grab / snap distances). */
export const pxToMM = (px: number): number => px / (PX * editor.view.zoom);

/** The element of the tile on the current level that contains `target`
    (null for the level's own background or anything outside it). */
export function scopeEl(target: EventTarget | Element | null): HTMLElement | null {
  let el = target instanceof Element ? (target.closest('.tile') as HTMLElement | null) : null;
  while (el) {
    const p = parentOf(editor.doc, el.dataset.id!);
    if ((p ? p.id : null) === editor.view.scope) return el;
    el = el.parentElement ? (el.parentElement.closest('.tile') as HTMLElement | null) : null;
  }
  return null;
}

/** The innermost tile element under a target, at any depth. */
export const deepTileEl = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? (target.closest('.tile') as HTMLElement | null) : null;
