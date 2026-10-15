/* Getting the page ready to print exactly the paper. */

import { hooks } from '../editor/hooks';
import { editor } from '../editor/store';
import { $ } from './dom';

export function preparePrint(): void {
  if (editor.view.editing) hooks.stopEditing();
  editor.view.selected.clear();
  hooks.render();
  $('#pageStyle').textContent = `@page { size: ${editor.doc.paper.w}mm ${editor.doc.paper.h}mm; margin: 0; }`;
}
