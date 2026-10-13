/* The hover overlay: + buttons, cut previews, seam lines, and the hint bar. */

import { MIN } from '../constants';
import { editor, level, tileById, type Hover } from '../editor/store';
import { AX } from '../layout/axis';
import { bandAround } from '../layout/bands';
import type { Rect } from '../model/types';
import { round } from '../util';
import { dom } from './dom';

const boxHtml = (r: Partial<Rect>, cls: string) =>
  `<div class="${cls}" style="left:${r.x}mm;top:${r.y}mm;width:${r.w}mm;height:${r.h}mm"></div>`;
const plusHtml = (x: number, y: number, cls: string) => `<div class="plus ${cls}" style="left:${x}mm;top:${y}mm">+</div>`;

export function showHover(h: Hover | null): void {
  const view = editor.view, L = level();
  const shift = !!view.lastPointer?.shiftKey && !view.drag;
  const g = L.frame.gutter;
  let html = '', cursor = '', hint = '';

  if (shift) {
    // idle markers: the middle of every tile's right and bottom edge
    const room = 2 * MIN + g;
    for (const t of L.tiles) {
      if (h?.type === 'cut' && h.plan.edge.id === t.id) continue;
      if (t.h >= room) html += plusHtml(t.x + t.w, t.y + t.h / 2, 'idle');
      if (t.w >= room) html += plusHtml(t.x + t.w / 2, t.y + t.h, 'idle');
    }
  }

  if (h?.type === 'cut') {
    const p = h.plan, A = AX[p.ax];
    for (const id of p.ids) {
      const t = tileById(id);
      if (!t) continue;
      const end = t[A.p] + t[A.l];
      p.cs.forEach((c, i) => {
        const piece = (i + 1 < p.cs.length ? p.cs[i + 1] - g / 2 : end) - c - g / 2;
        html += boxHtml({ [A.p]: c + g / 2, [A.l]: piece, [A.cp]: t[A.cp], [A.cl]: t[A.cl] }, 'preview');
        html += boxHtml({ [A.p]: c - g / 2, [A.l]: g, [A.cp]: t[A.cp], [A.cl]: t[A.cl] }, 'cutband');
      });
    }
    if (p.guide !== null) html += `<div class="guide ${p.ax === 'x' ? 'v' : 'h'}" style="${p.ax === 'x' ? 'left' : 'top'}:${p.guide}mm"></div>`;
    const t = tileById(p.edge.id)!, e = p.edge.side;
    const at = e === 'left' ? t.x : e === 'right' ? t.x + t.w : e === 'top' ? t.y : t.y + t.h;
    const n = p.cs.length + 1;
    const q = p.equal ? Math.min(t[A.p] + t[A.l], Math.max(t[A.p], p.edge.q)) : p.cs[0];
    html += p.ax === 'y' ? plusHtml(at, q, '') : plusHtml(q, at, '');
    let text;
    if (p.equal) {
      text = `${n} × ${round((t[A.l] - (n - 1) * g) / n)} mm`;
    } else {
      const a = round(p.cs[0] - g / 2 - t[A.p]), b = round(t[A.p] + t[A.l] - p.cs[0] - g / 2);
      text = `${p.label ? p.label + ' · ' : ''}${a} | ${b} mm`;
    }
    const mid = p.equal ? t[A.p] + t[A.l] / 2 : p.cs[0];
    const lx = p.ax === 'y' ? t.x + t.w / 2 : mid, ly = p.ax === 'y' ? mid : t.y + t.h / 2;
    html += `<div class="splitlabel" style="left:${lx}mm;top:${ly}mm">${text}</div>`;
    cursor = 'on-plus';
    hint = p.equal
      ? `Click to split into ${n} equal parts · keys 2–9 change the number`
      : bandAround(editor.doc, t) ? 'Click to split here · header/footer: snaps to squares and middles · Ctrl+Shift: equal parts · Alt: no snapping'
        : 'Click to split here · snaps to ½ ⅓ ¼ and other tiles\' edges · Ctrl+Shift: equal parts · Alt: no snapping';
  } else if (h?.type === 'free') {
    html += boxHtml(h.rect, 'preview') + plusHtml(h.rect.x + h.rect.w / 2, h.rect.y + h.rect.h / 2, '');
    cursor = 'on-plus';
    hint = 'Click to fill this space with a tile';
  } else if (h?.type === 'seam') {
    const s = h.seam;
    const line = s.axis === 'x' ? { x: s.c, y: s.a, w: 0, h: s.b - s.a } : { x: s.a, y: s.c, w: s.b - s.a, h: 0 };
    html += boxHtml(line, 'seamline ' + (s.axis === 'x' ? 'v' : 'h'));
    cursor = 'seam-' + s.axis;
    hint = 'Drag to resize both sides · hold Shift to split tiles';
  } else if (shift) {
    hint = 'Point at a tile edge to split it there';
  }

  dom.hover.innerHTML = html;
  dom.paper.classList.remove('seam-x', 'seam-y', 'on-plus');
  if (cursor) dom.paper.classList.add(cursor);
  showHint(hint);
}

export function showHint(text: string): void {
  dom.hint.textContent = text;
  dom.hint.classList.toggle('show', !!text);
}

export function clearHover(): void {
  dom.hover.innerHTML = '';
  showHint('');
}
