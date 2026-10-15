/* Tables in text: insert one (empty, or a copy of a table from the Data
   sidebar), add and delete rows and columns, align a column. A table is part
   of the text it sits in, so every text format works on its cells. */

import { isNumeric } from '../model/plot';
import { workspace } from '../project/data';
import { escapeHtml } from '../util';
import { closeMenu, showMenu } from './menus';

/** Puts the caret back in the text being typed and returns that text's element. */
type Caret = () => HTMLDivElement | null;

/** The table cell the caret is in. */
function cellAt(c: HTMLElement): HTMLTableCellElement | null {
  const n = getSelection()?.anchorNode;
  const el = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
  const cell = el?.closest('td, th');
  return cell && c.contains(cell) ? (cell as HTMLTableCellElement) : null;
}

function tableHtml(columns: string[], rows: string[][], numeric: boolean[]): string {
  const cls = (i: number) => (numeric[i] ? ' class="num"' : '');
  const cell = (v: string) => escapeHtml(v) || '<br>';
  return `<table><thead><tr>${columns.map((c, i) => `<th${cls(i)}>${cell(c)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td${cls(i)}>${cell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><div><br></div>`;
}

const rowsOf = (cell: HTMLTableCellElement): HTMLTableRowElement[] => [...cell.closest('table')!.querySelectorAll('tr')];

function addRow(cell: HTMLTableCellElement, below: boolean): void {
  const tr = cell.parentElement as HTMLTableRowElement;
  const body = tr.parentElement!.tagName === 'THEAD' ? tr.closest('table')!.tBodies[0] : tr.parentElement!;
  const fresh = document.createElement('tr');
  for (const c of tr.cells) {
    const td = document.createElement('td');
    td.className = c.className;
    td.innerHTML = '<br>';
    fresh.appendChild(td);
  }
  if (tr.parentElement!.tagName === 'THEAD') body.prepend(fresh);
  else tr.parentElement!.insertBefore(fresh, below ? tr.nextSibling : tr);
}

function addColumn(cell: HTMLTableCellElement): void {
  const i = cell.cellIndex;
  for (const tr of rowsOf(cell)) {
    const c = document.createElement(tr.parentElement!.tagName === 'THEAD' ? 'th' : 'td');
    c.innerHTML = '<br>';
    tr.insertBefore(c, tr.cells[i + 1] ?? null);
  }
}

function deleteRow(cell: HTMLTableCellElement): void {
  const tr = cell.parentElement!, table = tr.closest('table')!;
  if (table.querySelectorAll('tbody tr').length <= 1 && tr.parentElement!.tagName === 'TBODY') { table.remove(); return; }
  tr.remove();
}

function deleteColumn(cell: HTMLTableCellElement): void {
  const i = cell.cellIndex, rows = rowsOf(cell);
  if (rows[0].cells.length <= 1) { cell.closest('table')!.remove(); return; }
  for (const tr of rows) tr.cells[i]?.remove();
}

function alignColumn(cell: HTMLTableCellElement, right: boolean): void {
  for (const tr of rowsOf(cell)) tr.cells[cell.cellIndex]?.classList.toggle('num', right);
}

/** The Table menu of the formatting toolbar. */
export function openTableMenu(btn: HTMLElement, caret: Caret, changed: () => void): void {
  const c = caret();
  if (!c) return;
  const cell = cellAt(c);
  const tables = workspace.items.filter((d) => d.value?.kind === 'table');
  const menu = document.createElement('div');
  menu.className = 'colormenu tablemenu';
  menu.innerHTML =
    (cell ? '<div class="cm-h">This table</div><div class="tm-col">' +
      '<button data-t="row-below">Add row below</button><button data-t="row-above">Add row above</button>' +
      '<button data-t="col">Add column to the right</button><button data-t="del-row">Delete row</button>' +
      '<button data-t="del-col">Delete column</button><button data-t="right">Column: align right (numbers)</button>' +
      '<button data-t="left">Column: align left</button></div>' : '') +
    '<div class="cm-h">Insert a table</div><div class="bm-row">' +
    '<label>rows<input type="number" class="tm-rows" min="1" max="50" value="3"></label>' +
    '<label>columns<input type="number" class="tm-cols" min="1" max="12" value="3"></label>' +
    '<button data-t="insert">Insert</button></div>' +
    (tables.length ? '<div class="cm-h">A copy of a table from the Data sidebar</div><div class="tm-col">' +
      tables.map((d) => `<button data-data="${escapeHtml(d.file)}">${escapeHtml(d.name)} <span class="muted">${d.size}</span></button>`).join('') + '</div>' : '');
  showMenu(menu, btn, 260);
  menu.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    if (!b) return;
    const box = caret();
    if (!box) return;
    const at = cellAt(box), t = b.dataset.t;
    if (t === 'insert') {
      const n = (sel: string, max: number) => Math.max(1, Math.min(max, Math.round(+menu.querySelector<HTMLInputElement>(sel)!.value || 1)));
      const cols = n('.tm-cols', 12), rows = n('.tm-rows', 50);
      document.execCommand('insertHTML', false, tableHtml(Array(cols).fill(''), Array.from({ length: rows }, () => Array(cols).fill('')), Array(cols).fill(false)));
    } else if (b.dataset.data) {
      const d = tables.find((x) => x.file === b.dataset.data);
      if (d?.value?.kind !== 'table') return;
      const tb = d.value.table, numeric = tb.columns.map((col) => isNumeric(tb, col));
      document.execCommand('insertHTML', false, tableHtml(tb.columns, tb.rows.map((r) => r.map((v) => (v === null ? '' : String(v)))), numeric));
    } else if (at) {
      if (t === 'row-below' || t === 'row-above') addRow(at, t === 'row-below');
      else if (t === 'col') addColumn(at);
      else if (t === 'del-row') deleteRow(at);
      else if (t === 'del-col') deleteColumn(at);
      else if (t === 'right' || t === 'left') alignColumn(at, t === 'right');
    }
    closeMenu();
    changed();
  });
}
