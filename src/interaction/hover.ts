/* What a click / drag at the pointer would do. Shift reveals cut buttons on
   tile edges (Ctrl+Shift: equal parts); without it, seams can be dragged. */

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
  if (!view.drag && target && dom.paper.contains(target) && !target.dataset.handle &&
      !(view.editing && target.closest('.tile.editing'))) {
    const pt = toMM(lp), L = level();
    if (lp.shiftKey) {
      const edge = edgeAt(L, pt, pxToMM(14), view.editing);
      const plan = edge && cutPlan(editor.doc, L, edge, {
        snap: view.snap && !lp.altKey, equal: lp.ctrlKey, parts: view.parts, thr: pxToMM(8),
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
