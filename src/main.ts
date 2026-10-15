/* Imposters — entry point. Wires the layers together:

     model/ & layout/   pure document model and layout rules (no DOM)
     editor/            editor state, history, commands
     view/              drawing the paper, tiles, overlays, design CSS
     interaction/       pointer, keyboard, typing, files, zoom
     project/           the open project folder: posters, saving, images
     ui/                toolbars, menus, settings panel, design tab, project bar

   The desktop app (electron/) gives project/ its folder; in a plain browser
   project/ keeps one built-in project in localStorage.                     */

import './styles/index.css';

import * as actions from './editor/actions';
import { commit, resetHistory } from './editor/history';
import { hooks } from './editor/hooks';
import { loadPrefs } from './editor/prefs';
import { editor } from './editor/store';
import { stopEditing } from './interaction/editing';
import { bindFiles } from './interaction/files';
import { refreshHover } from './interaction/hover';
import { bindKeyboard } from './interaction/keyboard';
import { bindPointer } from './interaction/pointer';
import { bindZoom, zoomFit } from './interaction/zoom';
import { normalizeLayout, setContentMeasure } from './layout/reflow';
import { contentMinimum } from './view/measure';
import { rememberColor } from './model/design';
import { autosave } from './editor/history';
import * as session from './project/session';
import { bindDesignTab, designTabVisible, pickDesignElement, refreshDesign, renderDesignTab } from './ui/design-tab';
import { bindMaster, renderMaster } from './ui/master';
import { bindFormatBar, updateFormatBar } from './ui/formatbar';
import { bindInspector, updateInspector } from './ui/inspector';
import { dataEvents } from './project/data';
import { refreshPlots } from './project/plots';
import { bindDataEditor, syncDataEditor } from './ui/data-editor';
import { bindLiveView, updateLiveView } from './ui/live-view';
import { bindPlotEditor, syncPlotEditor } from './ui/plot-editor';
import { bindPlotTooltip } from './view/plot-tooltip';
import { bindProjectBar, projectStarted, updateProjectBar } from './ui/project-bar';
import { bindSidebar, updateSidebar } from './ui/sidebar';
import { bindToolbar, updateToolbar } from './ui/toolbar';
import { applyDesignCSS, attachSwatches, loadFonts } from './view/design-css';
import { bindDom } from './view/dom';
import { loadLocalFonts, refreshFontPickers } from './view/fonts';
import { renderPaper } from './view/paper';
import { fitHeaders } from './view/fit';
import { preparePrint } from './view/print';
import { toast } from './view/toast';

/** Redraw everything from the current state. */
function renderAll(): void {
  normalizeLayout(editor.doc);
  applyDesignCSS();
  renderPaper();
  // headers too small for their text grow to fit it (they need the drawn text to know)
  if (fitHeaders()) { normalizeLayout(editor.doc); renderPaper(); commit(); }
  updateInspector();
  updateToolbar();
  updateFormatBar();
  updateProjectBar();
  syncDataEditor();
  syncPlotEditor();
  updateSidebar();
  updateLiveView();
  renderMaster(); // the master poster follows the design (when open)
}

async function init(): Promise<void> {
  bindDom();

  hooks.render = renderAll;
  hooks.docReplaced = () => { refreshFontPickers(); refreshDesign(); };
  hooks.refreshHover = refreshHover;
  hooks.stopEditing = stopEditing;
  hooks.notify = toast;
  hooks.save = session.queueSave;
  setContentMeasure(contentMinimum); // shrinking a tile takes its tiles' unused room first

  const prefs = loadPrefs();
  editor.view.showOverflow = prefs.overflow;
  editor.view.spell = prefs.spell;
  resetHistory();

  bindToolbar();
  bindProjectBar();
  bindSidebar();
  bindDataEditor();
  bindPlotEditor();
  bindPlotTooltip();
  bindLiveView();
  dataEvents.changed = (names) => void refreshPlots(names);
  bindFormatBar();
  bindInspector();
  bindDesignTab();
  bindMaster(pickDesignElement);
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
  window.addEventListener('beforeprint', preparePrint);

  loadFonts(renderAll);
  // the fonts installed on this computer join the font pickers when the computer has told us them
  void loadLocalFonts(() => { refreshFontPickers(); if (designTabVisible()) renderDesignTab(); });
  renderAll();
  zoomFit();

  // the last project (desktop app) or the browser's own; else the welcome screen
  await session.startProject();
  projectStarted();

  // a handle for automated tests and debugging in the browser console
  Object.assign(window, { imposters: { editor, actions, render: renderAll, session } });
}

void init();
