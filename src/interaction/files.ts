/* Images and documents: picking, dropping, pasting, saving, opening. */

import { addTile, setTileImage } from '../editor/actions';
import { commit, resetHistory } from '../editor/history';
import { hooks, notify, render } from '../editor/hooks';
import { editor, select, selectedTiles, tileById } from '../editor/store';
import { loadDocument } from '../model/document';
import { isSection } from '../model/tree';
import type { Tile } from '../model/types';
import { $, dom } from '../view/dom';
import { scopeEl } from './coords';
import { zoomFit } from './zoom';

export function readFile(file: File, asText: true): Promise<string>;
export function readFile(file: File, asText?: false): Promise<string>;
export function readFile(file: File, asText = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    if (asText) r.readAsText(file); else r.readAsDataURL(file);
  });
}

/** Ask for an image file; it goes into `target`, or a new tile. */
export function pickImage(target: Tile | null): void {
  editor.view.imageTarget = target ? target.id : null;
  const input = $<HTMLInputElement>('#fileImage');
  input.value = '';
  input.click();
}

export function saveDocument(): void {
  const blob = new Blob([JSON.stringify(editor.doc, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'poster.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function openDocument(text: string): void {
  try {
    editor.doc = loadDocument(JSON.parse(text));
    Object.assign(editor.view, { scope: null, editing: null, selected: new Set() });
    resetHistory();
    hooks.docReplaced();
    render();
    zoomFit();
  } catch (err) {
    notify('Could not open file: ' + (err as Error).message);
  }
}

async function onPaste(e: ClipboardEvent): Promise<void> {
  const data = e.clipboardData;
  if (!data) return;
  if (editor.view.editing) {
    // keep pasted text plain so tile styling stays consistent
    e.preventDefault();
    document.execCommand('insertText', false, data.getData('text/plain'));
    return;
  }
  if ((e.target as Element)?.matches?.('input, textarea')) return;
  const file = [...data.files].find((f) => f.type.startsWith('image/'));
  const ts = selectedTiles();
  if (file) {
    e.preventDefault();
    const src = await readFile(file);
    if (ts.length === 1) { setTileImage(ts[0], src); commit(); render(); }
    else addTile('image', { src });
    return;
  }
  const text = data.getData('text/plain');
  if (text) {
    e.preventDefault();
    const div = document.createElement('div');
    div.textContent = text;
    addTile('text', { html: div.innerHTML.replace(/\n/g, '<br>') });
  }
}

async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files || [])];
  const json = files.find((f) => f.name.endsWith('.json'));
  if (json) { openDocument(await readFile(json, true)); return; }
  const img = files.find((f) => f.type.startsWith('image/'));
  if (!img) return;
  const src = await readFile(img);
  const tileEl = scopeEl(document.elementFromPoint(e.clientX, e.clientY));
  const t = tileEl ? tileById(tileEl.dataset.id) : null;
  if (t && !isSection(t)) { setTileImage(t, src); select(t.id); commit(); render(); }
  else addTile('image', { src });
}

export function bindFiles(): void {
  dom.stage.addEventListener('dragover', (e) => e.preventDefault());
  dom.stage.addEventListener('drop', onDrop);
  document.addEventListener('paste', onPaste);

  $<HTMLInputElement>('#fileImage').addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const src = await readFile(f);
    const t = tileById(editor.view.imageTarget);
    if (t) { setTileImage(t, src); commit(); render(); } else addTile('image', { src });
  });
  $<HTMLInputElement>('#fileDoc').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    if (f) openDocument(await readFile(f, true));
    input.value = '';
  });
}
