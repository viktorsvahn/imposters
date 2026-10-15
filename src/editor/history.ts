/* Undo history and autosave. Every completed change calls commit(). */

import { normalizeLayout } from '../layout/reflow';
import { hooks } from './hooks';
import { editor, tileById } from './store';

const LIMIT = 200;
const hist = { stack: [] as string[], idx: -1 };

/** Record the current document as a history step (and autosave it). */
export function commit(): void {
  normalizeLayout(editor.doc);
  const s = JSON.stringify(editor.doc);
  if (hist.stack[hist.idx] === s) return;
  hist.stack = hist.stack.slice(0, hist.idx + 1);
  hist.stack.push(s);
  if (hist.stack.length > LIMIT) hist.stack.shift();
  hist.idx = hist.stack.length - 1;
  autosave(s);
}

export const canUndo = (): boolean => hist.idx > 0;
export const canRedo = (): boolean => hist.idx < hist.stack.length - 1;

export function undo(): void {
  if (canUndo()) restore(hist.idx - 1);
}

export function redo(): void {
  if (canRedo()) restore(hist.idx + 1);
}

/** Start a fresh history (after opening or creating a document). */
export function resetHistory(): void {
  hist.stack = [];
  hist.idx = -1;
  commit();
}

function restore(i: number): void {
  hist.idx = i;
  editor.doc = JSON.parse(hist.stack[i]);
  const v = editor.view;
  if (v.scope && !tileById(v.scope)) v.scope = null;
  v.selected = new Set([...v.selected].filter((id) => tileById(id)));
  v.editing = null;
  autosave(hist.stack[i]);
  hooks.docReplaced();
  hooks.render();
}

/** Save the document (through hooks.save — the open project). */
export function autosave(s: string = JSON.stringify(editor.doc)): void {
  hooks.save(s);
}
