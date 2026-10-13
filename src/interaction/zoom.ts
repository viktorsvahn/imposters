import { PX } from '../constants';
import { render } from '../editor/hooks';
import { editor } from '../editor/store';
import { clamp } from '../util';
import { dom } from '../view/dom';
import { toMM, type ClientPoint } from './coords';

/** Set the zoom; with an anchor, the paper point under it stays put. */
export function setZoom(z: number, anchor?: ClientPoint): void {
  z = clamp(z, 0.05, 4);
  const before = anchor && toMM(anchor, true);
  editor.view.zoom = z;
  render();
  if (before && anchor) {
    const r = dom.paper.getBoundingClientRect();
    dom.stage.scrollLeft += r.left + before.x * PX * z - anchor.clientX;
    dom.stage.scrollTop += r.top + before.y * PX * z - anchor.clientY;
  }
}

/** Fit the whole paper on screen. */
export function zoomFit(): void {
  const p = editor.doc.paper;
  setZoom(Math.min((dom.stage.clientWidth - 80) / (p.w * PX), (dom.stage.clientHeight - 80) / (p.h * PX)));
}

export function bindZoom(): void {
  dom.stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(editor.view.zoom * Math.exp(-e.deltaY * 0.0015), e);
  }, { passive: false });
}
