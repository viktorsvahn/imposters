/* What a click / drag at the pointer would do. Ctrl+Shift reveals cut buttons
   on tile edges (Ctrl+Alt+Shift: equal parts); without them, seams can be
   dragged. Shift alone is for selecting several tiles. */

/** The keys that show split points: Ctrl+Shift. */
export const splitKeys = (p: { shiftKey: boolean; ctrlKey: boolean }): boolean => p.shiftKey && p.ctrlKey;

import { editor, level, type Hover, type PointerInfo } from '../editor/store';
import { cutPlan, edgeAt } from '../layout/cuts';
import { largestFree } from '../layout/fill';
import { seamAt } from '../layout/seams';
import { dom } from '../view/dom';
import { showHover } from '../view/overlay';
import { pxToMM, scopeEl, toMM } from './coords';

export function updateHover(e: PointerInfo | (MouseEvent & { ctrlKey: boolean })): void {
  const view = editor.view;
  const lp: PointerInfo = {
    clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || ('metaKey' in e && e.metaKey), altKey: e.altKey,
  };
  view.lastPointer = lp;
  let h: Hover | null = null;
  const target = document.elementFromPoint(lp.clientX, lp.clientY) as HTMLElement | null;
  // while splitting (Ctrl+Shift) the resize handles step aside, so a split can go anywhere on an edge
  const split = splitKeys(lp);
  if (!view.drag && target && dom.paper.contains(target) && (!target.dataset.handle || split) &&
      (split || !(view.editing && target.closest('.tile.editing')))) {
    const pt = toMM(lp), L = level();
    // Ctrl+Alt+Shift right on the line between tiles: drag it to space them all out (elsewhere: equal parts)
    const allGaps = split && lp.altKey ? seamAt(L, pt, pxToMM(4)) : null;
    if (allGaps) h = { type: 'seam', seam: allGaps };
    else if (split) {
      const edge = edgeAt(L, pt, pxToMM(14), null);
      const plan = edge && cutPlan(editor.doc, L, edge, {
        snap: view.snap, equal: lp.altKey, parts: view.parts, thr: pxToMM(8),
      });
      if (plan) h = { type: 'cut', plan };
      else if (!edge && !scopeEl(target)) {
        const rect = largestFree(L, pt);
        if (rect) h = { type: 'free', rect };
      }
    } else {
      const seam = seamAt(L, pt, pxToMM(4));
      if (seam) h = { type: 'seam', seam };
    }
  }
  view.hover = h;
  showHover(h);
}

export function refreshHover(): void {
  if (editor.view.lastPointer) updateHover(editor.view.lastPointer);
}

export function clearHoverState(): void {
  editor.view.hover = null;
  showHover(null);
}
