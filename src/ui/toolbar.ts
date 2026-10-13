/* The main toolbar: breadcrumbs, commands, Parts, zoom, panel toggle. */

import { act, type Command } from '../commands';
import { exitTo, setParts } from '../editor/actions';
import { canRedo, canUndo } from '../editor/history';
import { loadPrefs, savePrefs } from '../editor/prefs';
import { editor, scopeTile } from '../editor/store';
import { parentOf } from '../model/tree';
import type { Tile } from '../model/types';
import { $, $$, setVal } from '../view/dom';
import { showTab } from './design-tab';
import { tileLabel } from './labels';

let crumbsHtml = '';

export function updateToolbar(): void {
  const view = editor.view;
  const chain: Tile[] = [];
  for (let t = scopeTile(); t; t = parentOf(editor.doc, t.id)) chain.unshift(t);
  const html = [`<button data-scope="" class="${chain.length ? '' : 'on'}">Poster</button>`]
    .concat(chain.map((t, i) => `<span>›</span><button data-scope="${t.id}" class="${i === chain.length - 1 ? 'on' : ''}">${tileLabel(t)}</button>`))
    .join('');
  if (crumbsHtml !== html) { $('#crumbs').innerHTML = html; crumbsHtml = html; }

  $$<HTMLButtonElement>('[data-act=up]').forEach((b) => { b.disabled = !view.scope; });
  const n = view.selected.size;
  $$<HTMLButtonElement>('[data-needs]').forEach((b) => { b.disabled = n < +b.dataset.needs!; });
  $<HTMLButtonElement>('[data-act=undo]').disabled = !canUndo();
  $<HTMLButtonElement>('[data-act=redo]').disabled = !canRedo();
  $('#zoomLabel').textContent = Math.round(view.zoom * 100) + '%';
  setVal('#parts', view.parts);
}

export function bindToolbar(): void {
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act as Command)));
  $('#parts').addEventListener('change', (e) => setParts(+(e.target as HTMLInputElement).value));
  $('#crumbs').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-scope]');
    if (!b) return;
    const to = b.dataset.scope || null;
    // crumbs are ancestors: leave level by level so undivided tiles fold back up
    if (to !== editor.view.scope) exitTo(to);
  });

  // the settings panel is for special settings; hidden unless asked for
  const setPanel = (open: boolean) => {
    document.body.classList.toggle('panel-hidden', !open);
    $('#panelBtn').classList.toggle('on', open);
    savePrefs({ panel: open });
  };
  setPanel(loadPrefs().panel);
  $('#panelBtn').addEventListener('click', () => setPanel(document.body.classList.contains('panel-hidden')));
  $('#designBtn').addEventListener('click', () => { setPanel(true); showTab('design'); });
}
