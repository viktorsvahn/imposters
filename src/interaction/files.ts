/* Images and documents: picking, dropping, pasting, saving, opening. */

import { addTile, setTileImage } from '../editor/actions';
import { commit } from '../editor/history';
import { notify, render } from '../editor/hooks';
import { editor, select, selectedTiles, tileById } from '../editor/store';
import { slugify } from '../model/project';
import { isSection } from '../model/tree';
import type { Tile } from '../model/types';
import { importImage, importPoster, project } from '../project/session';
import { $, dom } from '../view/dom';
import { scopeEl } from './coords';

/** An image file as a tile source (copied into the project), or null if that failed. */
async function imageSrc(file: File): Promise<string | null> {
  try {
    return await importImage(file);
  } catch (err) {
    notify('Could not add image: ' + (err as Error).message);
    return null;
  }
}

/** Ask for an image file; it goes into `target`, or a new tile. */
export function pickImage(target: Tile | null): void {
  editor.view.imageTarget = target ? target.id : null;
  const input = $<HTMLInputElement>('#fileImage');
  input.value = '';
  input.click();
}

/** Show a library image: in the selected tile (if it holds no other tiles), else in a new tile. */
export function placeImage(src: string): void {
  const ts = selectedTiles();
  if (ts.length === 1 && !isSection(ts[0])) { setTileImage(ts[0], src); commit(); render(); }
  else addTile('image', { src });
}

/** Download the poster as a .json file (the browser version's Save). */
export function saveDocument(): void {
  const blob = new Blob([JSON.stringify(editor.doc, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = slugify(project.poster?.name || 'poster') + '.poster.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
    const src = await imageSrc(file);
    if (!src) return;
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
  const tileAt = () => {
    const el = scopeEl(document.elementFromPoint(e.clientX, e.clientY));
    const t = el ? tileById(el.dataset.id) : null;
    return t && !isSection(t) ? t : null;
  };
  // an image dragged from the library
  const asset = e.dataTransfer?.getData('application/x-imposters-asset');
  if (asset) {
    const t = tileAt();
    if (t) { setTileImage(t, asset); select(t.id); commit(); render(); } else addTile('image', { src: asset });
    return;
  }
  const files = [...(e.dataTransfer?.files || [])];
  const json = files.find((f) => f.name.endsWith('.json'));
  if (json) { await importPoster(await json.text(), json.name); return; }
  const img = files.find((f) => f.type.startsWith('image/'));
  const src = img && await imageSrc(img);
  if (!src) return;
  const t = tileAt();
  if (t) { setTileImage(t, src); select(t.id); commit(); render(); }
  else addTile('image', { src });
}

export function bindFiles(): void {
  dom.stage.addEventListener('dragover', (e) => e.preventDefault());
  dom.stage.addEventListener('drop', onDrop);
  document.addEventListener('paste', onPaste);

  $<HTMLInputElement>('#fileImage').addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    const src = f && await imageSrc(f);
    if (!src) return;
    const t = tileById(editor.view.imageTarget);
    if (t) { setTileImage(t, src); commit(); render(); } else addTile('image', { src });
  });
  $<HTMLInputElement>('#fileDoc').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    if (f) await importPoster(await f.text(), f.name);
    input.value = '';
  });
}
