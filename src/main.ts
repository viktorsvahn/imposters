/* Imposters — entry point. Wires the layers together:

     model/ & layout/   pure document model and layout rules (no DOM)
     editor/            editor state, history, commands
     view/              drawing the paper, tiles, overlays, design CSS
     interaction/       pointer, keyboard, typing, files, zoom
     ui/                toolbars, menus, settings panel, design tab        */

import './styles/index.css';

import * as actions from './editor/actions';
import { resetHistory, loadSavedDocument } from './editor/history';
import { hooks } from './editor/hooks';
import { loadPrefs } from './editor/prefs';
import { editor } from './editor/store';
import { stopEditing } from './interaction/editing';
import { bindFiles } from './interaction/files';
import { refreshHover } from './interaction/hover';
import { bindKeyboard } from './interaction/keyboard';
import { bindPointer } from './interaction/pointer';
import { bindZoom, zoomFit } from './interaction/zoom';
import { normalizeLayout } from './layout/reflow';
import { rememberColor } from './model/design';
import { autosave } from './editor/history';
import { bindDesignTab, designTabVisible, renderDesignTab } from './ui/design-tab';
import { bindFormatBar, updateFormatBar } from './ui/formatbar';
import { bindInspector, updateInspector } from './ui/inspector';
import { bindToolbar, updateToolbar } from './ui/toolbar';
import { applyDesignCSS, attachSwatches, loadFonts } from './view/design-css';
import { $, bindDom } from './view/dom';
import { renderPaper } from './view/paper';
import { toast } from './view/toast';

/** Redraw everything from the current state. */
function renderAll(): void {
  normalizeLayout(editor.doc);
  applyDesignCSS();
  renderPaper();
  updateInspector();
  updateToolbar();
  updateFormatBar();
}

function init(): void {
  bindDom();

  hooks.render = renderAll;
  hooks.docReplaced = () => { if (designTabVisible()) renderDesignTab(); };
  hooks.refreshHover = refreshHover;
  hooks.stopEditing = stopEditing;
  hooks.notify = toast;

  editor.doc = loadSavedDocument();
  const prefs = loadPrefs();
  editor.view.showOverflow = prefs.overflow;
  editor.view.spell = prefs.spell;
  resetHistory();

  bindToolbar();
  bindFormatBar();
  bindInspector();
  bindDesignTab();
  bindPointer();
  bindKeyboard();
  bindFiles();
  bindZoom();

  // every colour input offers the swatches; every picked colour joins the history
  attachSwatches();
  new MutationObserver(() => attachSwatches()).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.type === 'color' && rememberColor(editor.doc.design, t.value)) autosave();
  });

  // print exactly the paper
  window.addEventListener('beforeprint', () => {
    if (editor.view.editing) stopEditing();
    editor.view.selected.clear();
    renderAll();
    $('#pageStyle').textContent = `@page { size: ${editor.doc.paper.w}mm ${editor.doc.paper.h}mm; margin: 0; }`;
  });

  loadFonts(renderAll);
  renderAll();
  zoomFit();

  // a handle for automated tests and debugging in the browser console
  Object.assign(window, { imposters: { editor, actions, render: renderAll } });
}

init();
