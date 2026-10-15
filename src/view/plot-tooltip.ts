/* Hovering over a mark of a plot (anywhere: on the poster, in the plot editor,
   in the image pool) shows its hover text — the "column: value" lines stored
   with the mark in the plot's SVG. */

import { editor } from '../editor/store';
import { escapeHtml } from '../util';

let tip: HTMLElement | null = null;

function show(text: string, x: number, y: number): void {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'plot-tip';
    document.body.appendChild(tip);
  }
  tip.innerHTML = text.split('\n').map((line) => {
    const i = line.indexOf(': ');
    return i < 0 ? `<div>${escapeHtml(line)}</div>`
      : `<div><span>${escapeHtml(line.slice(0, i))}</span> ${escapeHtml(line.slice(i + 2))}</div>`;
  }).join('');
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = (x + 14 + w > innerWidth ? x - 14 - w : x + 14) + 'px';
  tip.style.top = (y + 14 + h > innerHeight ? y - 14 - h : y + 14) + 'px';
}

const hide = (): void => { if (tip) tip.hidden = true; };

export function bindPlotTooltip(): void {
  document.addEventListener('pointermove', (e) => {
    const mark = (e.target as Element).closest?.('.plot-svg [aria-label]');
    const text = mark?.getAttribute('aria-label');
    if (!text || editor.view.drag) hide();
    else show(text, e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', hide, true);
}
