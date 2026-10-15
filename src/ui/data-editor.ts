/* The data editor: opens a data item in place of the poster. Tables are a grid
   of cells — edit values and column names, add or remove rows and columns —
   saved back to the CSV file. Other values (JSON) are shown read-only. */

import { notify } from '../editor/hooks';
import { parseCell, type Table } from '../model/data';
import * as data from '../project/data';
import { project } from '../project/session';
import { escapeHtml } from '../util';
import { $ } from '../view/dom';
import { setFormatTarget } from './formatbar';
import { closePlotEditor } from './plot-editor';

const ed = {
  item: null as data.DataItem | null,
  dirty: false,
  root: null as string | null, // the project it belongs to
};

export const dataEditorOpen = (): boolean => !!ed.item;

/** A cell: numbers right-aligned, text left-aligned (as in a spreadsheet). */
const cellInput = (v: unknown): string =>
  `<input${typeof v === 'string' ? ' class="txt"' : ''} value="${v === null || v === undefined ? '' : escapeHtml(v)}" spellcheck="false">`;

function gridHtml(t: Table): string {
  const head = t.columns.map((c, i) =>
    `<th><input class="col" value="${escapeHtml(c)}" spellcheck="false" title="Column name"><button class="del" data-del-col="${i}" title="Delete column">×</button></th>`).join('');
  const body = t.rows.map((r, i) =>
    `<tr><th class="rn">${i + 1}<button class="del" data-del-row="${i}" title="Delete row">×</button></th>${r.map((c) => `<td>${cellInput(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="dgrid"><thead><tr><th class="rn"></th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** The table as currently typed into the grid. */
function readGrid(): Table {
  const el = $('#dataEditor');
  const columns = [...el.querySelectorAll<HTMLInputElement>('thead input.col')].map((x, i) => x.value.trim() || `Var${i + 1}`);
  const rows = [...el.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll<HTMLInputElement>('td input')].map((x) => parseCell(x.value)));
  return { columns, rows };
}

function render(t: Table | null): void {
  const d = ed.item!, el = $('#dataEditor');
  const meta = `${escapeHtml(d.file)}${d.size ? ` · ${d.size} ${d.cls}` : ''}`;
  const tools = t
    ? '<button data-de="add-row" title="Add a row at the bottom">+ Row</button><button data-de="add-col" title="Add a column at the right">+ Column</button>' +
      '<button data-de="save" class="primary" title="Save to the file (Ctrl+S)">Save</button>'
    : '';
  el.innerHTML = `<div class="de-head"><b>${escapeHtml(d.name)}</b><span class="muted">${meta}</span><span class="de-dirty"></span>` +
    `<span class="spacer"></span>${tools}<button data-de="close" title="Back to the poster (Esc)">Close</button></div>` +
    `<div class="de-body">${t ? gridHtml(t) : d.value
      ? `<p class="muted">Only tables can be edited here. This value is shown as it is in the file.</p><pre>${escapeHtml(JSON.stringify(d.value.kind === 'json' ? d.value.value : null, null, 2))}</pre>`
      : `<p class="side-error">Could not read ${escapeHtml(d.file)}: ${escapeHtml(d.error)}</p>`}</div>`;
  setDirty(ed.dirty);
}

function setDirty(v: boolean): void {
  ed.dirty = v;
  const mark = $('#dataEditor .de-dirty');
  if (mark) mark.textContent = v ? '● unsaved changes' : '';
}

export function openDataEditor(item: data.DataItem): void {
  if (ed.item && ed.dirty && ed.item !== item && !confirm(`Discard unsaved changes to ${ed.item.name}?`)) return;
  if (!closePlotEditor()) return;
  ed.item = item;
  ed.dirty = false;
  ed.root = project.root;
  document.body.classList.add('data-open');
  setFormatTarget('off');
  $('#dataEditor').hidden = false;
  render(item.value?.kind === 'table' ? item.value.table : null);
  $<HTMLInputElement>('#dataEditor td input')?.focus();
}

export function closeDataEditor(force = false): boolean {
  if (!ed.item) return true;
  if (!force && ed.dirty && !confirm(`Discard unsaved changes to ${ed.item.name}?`)) return false;
  ed.item = null;
  ed.dirty = false;
  document.body.classList.remove('data-open');
  setFormatTarget(null);
  $('#dataEditor').hidden = true;
  $('#dataEditor').innerHTML = '';
  return true;
}

/** Keep up with the workspace: follow a reread item, close when its project or file is gone. */
export function syncDataEditor(): void {
  if (!ed.item) return;
  const now = data.workspace.items.find((d) => d.file === ed.item!.file);
  if (project.root !== ed.root || !now) closeDataEditor(true);
  else ed.item = now;
}

async function save(): Promise<void> {
  if (!ed.item) return;
  const saved = await data.saveTable(ed.item, readGrid());
  if (!saved) { notify('Could not save ' + ed.item.name); return; }
  const moved = saved.file !== ed.item.file;
  ed.item = saved;
  ed.dirty = false;
  render(saved.value?.kind === 'table' ? saved.value.table : null);
  notify(moved ? `Saved as ${saved.file} (the table read from JSON is kept as it was)` : `Saved ${saved.file}`);
}

function edit(change: (t: Table) => void): void {
  const t = readGrid();
  change(t);
  render(t);
  setDirty(true);
}

/** Move to the cell below / above (Enter / Shift+Enter), like a spreadsheet. */
function moveDown(input: HTMLInputElement, up: boolean): void {
  const td = input.closest('td'), tr = td?.parentElement;
  if (!td || !tr) return;
  const next = (up ? tr.previousElementSibling : tr.nextElementSibling) as HTMLElement | null;
  next?.children[[...tr.children].indexOf(td)]?.querySelector('input')?.focus();
}

export function bindDataEditor(): void {
  const el = $('#dataEditor');
  el.addEventListener('input', () => setDirty(true));
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    if (!b) return;
    const act = b.dataset.de;
    if (act === 'close') closeDataEditor();
    else if (act === 'save') void save();
    else if (act === 'add-row') edit((t) => t.rows.push(t.columns.map(() => null)));
    else if (act === 'add-col') edit((t) => { t.columns.push(`Var${t.columns.length + 1}`); t.rows.forEach((r) => r.push(null)); });
    else if (b.dataset.delRow) edit((t) => t.rows.splice(+b.dataset.delRow!, 1));
    else if (b.dataset.delCol) edit((t) => { const i = +b.dataset.delCol!; t.columns.splice(i, 1); t.rows.forEach((r) => r.splice(i, 1)); });
  });
  // while it is open, keys belong to the editor (not the poster behind it)
  document.addEventListener('keydown', (e) => {
    if (!ed.item) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    else if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeDataEditor();
    else if (e.key === 'Enter' && (e.target as Element).matches('#dataEditor td input')) {
      e.preventDefault();
      moveDown(e.target as HTMLInputElement, e.shiftKey);
    }
    e.stopImmediatePropagation();
  }, true);
}
