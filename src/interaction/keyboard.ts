/* Keyboard shortcuts. */

import { enterTile, exitScope, mergeMode, setParts, splitsInside } from '../editor/actions';
import { commit } from '../editor/history';
import { notify, render } from '../editor/hooks';
import { editor, level, selectedTiles, tileById } from '../editor/store';
import { expand, type Direction } from '../layout/fill';
import { isSection } from '../model/tree';
import { act, type Command } from '../commands';
import { startEditing, stopEditing } from './editing';
import { pickImage } from './files';
import { updateHover } from './hover';

const ARROWS: Record<string, [Direction, number, number]> = {
  arrowleft: ['left', -1, 0], arrowright: ['right', 1, 0], arrowup: ['up', 0, -1], arrowdown: ['down', 0, 1],
};

function onKey(e: KeyboardEvent): void {
  const view = editor.view;
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const one = selectedTiles();
    const t = view.editing ? tileById(view.editing) : one.length === 1 ? one[0] : null;
    if (t) { e.preventDefault(); enterTile(t); }
    return;
  }
  if (view.editing) {
    if (e.key === 'Escape') { e.preventDefault(); stopEditing(); }
    return;
  }
  if ((e.target as Element)?.matches?.('input, select, textarea')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const ts = selectedTiles();

  if (mod) {
    const map: Record<string, Command> = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', d: 'duplicate', s: 'save', o: 'open' };
    if (map[k] && (map[k] !== 'duplicate' || ts.length)) { e.preventDefault(); act(map[k]); }
    else if (k === 'a') { e.preventDefault(); view.selected = new Set(level().tiles.map((t) => t.id)); render(); }
    return;
  }

  // 2–9 (by physical key, so Shift doesn't matter): number of equal parts
  const digit = /^(Digit|Numpad)([2-9])$/.exec(e.code);
  if (digit) { e.preventDefault(); setParts(+digit[2]); notify(`Split into ${view.parts} parts`); return; }

  if (ARROWS[k] && ts.length) {
    e.preventDefault();
    const [dir, dx, dy] = ARROWS[k];
    if (e.altKey) ts.forEach((t) => expand(level(), t, dir));
    else {
      const step = e.shiftKey ? 10 : 1;
      ts.forEach((t) => { t.x += dx * step; t.y += dy * step; });
    }
    commit();
    render();
    return;
  }

  switch (k) {
    case 'delete':
    case 'backspace': if (ts.length) { e.preventDefault(); act('delete'); } break;
    case 'escape':
      if (view.selected.size) { view.selected.clear(); render(); } else exitScope();
      break;
    case 'enter':
      if (ts.length === 1) {
        e.preventDefault();
        if (isSection(ts[0])) enterTile(ts[0]);
        else if (ts[0].type === 'image') pickImage(ts[0]);
        else startEditing(ts[0]);
      }
      break;
    case 'e': if (ts.length === 1) enterTile(ts[0]); break;
    case 't': act('add-text'); break;
    case 'i': act('add-image'); break;
    case 'v': if (ts.length || splitsInside()) act('split-v'); break;
    case 'h': if (ts.length || splitsInside()) act('split-h'); break;
    case 'm': if (mergeMode()) act('merge'); break;
    case 'f': if (ts.length) act('fill'); break;
    case '+':
    case '=': act('zoom-in'); break;
    case '-': act('zoom-out'); break;
    case '0': act('zoom-fit'); break;
  }
}

export function bindKeyboard(): void {
  document.addEventListener('keydown', onKey);
  // Shift / Ctrl / Alt change the hover overlay without moving the mouse
  for (const type of ['keydown', 'keyup'] as const) {
    document.addEventListener(type, (e) => {
      const view = editor.view;
      if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key) || !view.lastPointer || view.drag) return;
      if (e.key === 'Alt') e.preventDefault();
      updateHover({ ...view.lastPointer, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey, altKey: e.altKey });
    });
  }
  window.addEventListener('blur', () => { if (editor.view.lastPointer) updateHover(editor.view.lastPointer); });
}
