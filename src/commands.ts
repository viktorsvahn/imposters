/* Named commands, used by toolbar buttons (data-act="…") and shortcuts. */

import {
  addTile, arrangeSelected, deleteSelected, duplicateSelected, enterTile, exitScope, fillGaps, fillSelected,
  reorderSelected, splitSelected, type ArrangeKind,
} from './editor/actions';
import { commit, redo, undo } from './editor/history';
import { hooks, render } from './editor/hooks';
import { editor, selectedTiles } from './editor/store';
import { pickImage, saveDocument } from './interaction/files';
import { setZoom, zoomFit } from './interaction/zoom';
import { newDocument } from './model/document';
import { isSection, leavesOf } from './model/tree';
import { $ } from './view/dom';
import { fittingFontSize } from './view/paper';

export type Command =
  | 'add-text' | 'add-image' | 'split-v' | 'split-h' | 'fill' | 'fill-all'
  | 'duplicate' | 'delete' | 'front' | 'back' | 'undo' | 'redo'
  | 'zoom-in' | 'zoom-out' | 'zoom-fit' | 'new' | 'open' | 'save' | 'print' | 'enter' | 'up';

export function act(name: Command): void {
  const ts = selectedTiles();
  switch (name) {
    case 'add-text': addTile('text'); break;
    case 'add-image': pickImage(null); break;
    case 'split-v': splitSelected(true); break;
    case 'split-h': splitSelected(false); break;
    case 'fill': fillSelected(); break;
    case 'fill-all': fillGaps(); break;
    case 'duplicate': duplicateSelected(); break;
    case 'delete': deleteSelected(); break;
    case 'front': reorderSelected('front'); break;
    case 'back': reorderSelected('back'); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'zoom-in': setZoom(editor.view.zoom * 1.25); break;
    case 'zoom-out': setZoom(editor.view.zoom / 1.25); break;
    case 'zoom-fit': zoomFit(); break;
    case 'new':
      if (!confirm('Start a new document? Unsaved changes will be lost (use Save first).')) break;
      editor.doc = newDocument();
      Object.assign(editor.view, { scope: null, editing: null, selected: new Set() });
      commit(); // undo can still bring the old poster back
      hooks.docReplaced();
      render();
      zoomFit();
      break;
    case 'open': $<HTMLInputElement>('#fileDoc').click(); break;
    case 'save': saveDocument(); break;
    case 'print': window.print(); break;
    case 'enter': if (ts.length === 1) enterTile(ts[0]); break;
    case 'up': exitScope(); break;
  }
}

/** The Arrange buttons (data-arr="…"): geometry, plus fit text and image choice. */
export function arrange(kind: ArrangeKind | 'fit-text' | 'replace-image'): void {
  const ts = selectedTiles();
  if (!ts.length) return;
  if (kind === 'replace-image') { pickImage(ts[0]); return; }
  if (kind === 'fit-text') {
    for (const t of ts.flatMap((x) => (isSection(x) ? leavesOf(x) : [x])).filter((x) => x.type === 'text')) {
      const size = fittingFontSize(t);
      if (size) t.fontSize = size;
    }
    commit();
    render();
    return;
  }
  arrangeSelected(kind);
}
