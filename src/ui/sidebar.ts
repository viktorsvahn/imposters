/* The left sidebar: Posters (the tree of base versions and their variants),
   Images (the project's image pool) and Data (the data workspace). The
   activity strip switches between them; clicking the open one folds it away. */

import { savePrefs, loadPrefs } from '../editor/prefs';
import { notify } from '../editor/hooks';
import { placeImage } from '../interaction/files';
import type { DataClass } from '../model/data';
import { posterTree, type AssetKind, type PosterNode } from '../model/project';
import { assetUrl } from '../project/backend';
import * as data from '../project/data';
import * as session from '../project/session';
import { project } from '../project/session';
import { escapeHtml } from '../util';
import { $, $$ } from '../view/dom';
import { closeDataEditor, openDataEditor } from './data-editor';
import { closePlotEditor, editPlot, newPlot } from './plot-editor';
import { isPlotSrc, plotRevision, plotSvg } from '../view/plot-svg';
import { icons } from './icons';
import { askName, openMenu, type MenuItem } from './project-bar';

export type SideTab = 'posters' | 'images' | 'data';

/** Drag types for library images and posters. */
export const ASSET_DRAG = 'application/x-imposters-asset';
const POSTER_DRAG = 'application/x-imposters-poster';

const side = {
  tab: 'posters' as SideTab | '',
  collapsed: new Set<string>(), // poster ids whose variants are folded away
  filter: 'all' as AssetKind | 'all',
  asset: null as string | null, // selected library image
  data: null as string | null, // selected data item (file)
  key: '',
};

/* ---- Posters ---- */

function posterRows(nodes: PosterNode[], depth: number): string {
  return nodes.map(({ poster: p, children }) => {
    const folded = side.collapsed.has(p.id), cur = p.id === project.poster?.id;
    const twisty = children.length ? `<button class="twisty" data-a="fold" title="${folded ? 'Show' : 'Hide'} variants">${folded ? '▸' : '▾'}</button>` : '<span class="twisty"></span>';
    return `<div class="node${cur ? ' current' : ''}" data-id="${p.id}" draggable="true" style="--depth:${depth}" title="${escapeHtml(p.file)}">` +
      `${twisty}<span class="name">${escapeHtml(p.name)}</span>` +
      `<button class="row-btn" data-a="variant" title="New variant of this poster (a copy, placed below it)">+</button>` +
      `<button class="row-btn" data-a="menu" title="More">⋯</button></div>` +
      (folded ? '' : posterRows(children, depth + 1));
  }).join('');
}

function renderPosters(): string {
  const m = project.manifest!;
  return `<div class="side-head"><h2>Posters</h2><button data-a="new-base" title="A new empty base poster">+ Base</button></div>` +
    `<div class="tree" data-drop="base">${posterRows(posterTree(m), 0)}` +
    `<p class="side-hint">Drag a poster onto another to make it a variant of it, or onto empty space to make it a base version.</p></div>`;
}

function posterMenu(btn: HTMLElement, id: string, at?: { x: number; y: number }): void {
  const p = project.manifest?.posters.find((x) => x.id === id);
  if (!p) return;
  const items: (MenuItem | '-')[] = [
    { label: 'Open', run: () => { if (closeDataEditor() && closePlotEditor()) void session.openPoster(id); } },
    { label: 'New variant', run: () => session.newVariant(id), title: 'A copy of this poster, placed below it' },
    '-',
    { label: 'Rename…', run: async () => { const n = await askName('Poster name', p.name); if (n) await session.renamePoster(id, n); } },
  ];
  if (p.parent) items.push({ label: 'Make base version', run: () => session.movePoster(id, null) });
  items.push({ label: 'Delete…', run: () => {
    if (confirm(`Delete the poster “${p.name}”? Its file is removed from the project; its variants move up a level.`)) void session.deletePoster(id);
  } });
  openMenu(btn, items, at);
}

/* ---- Images ---- */

const KINDS: { kind: AssetKind | 'all'; label: string; empty: string }[] = [
  { kind: 'all', label: 'All', empty: 'No images yet. Import some, or drop image files here.' },
  { kind: 'image', label: 'Imported', empty: 'Images you add from outside appear here. Import some, or drop image files here.' },
  { kind: 'drawing', label: 'Drawings', empty: 'Figures you draw in the drawing mode will appear here.' },
  { kind: 'plot', label: 'Plots', empty: 'No plots yet. Press New plot, or Plot in the Data sidebar, to make one from a table.' },
];

/** A thumbnail: plots inline (their pictures are kept in memory), other images as files. */
function thumb(src: string): string {
  if (!isPlotSrc(src)) return `<img src="${escapeHtml(assetUrl(src))}" alt="" loading="lazy" draggable="false">`;
  const svg = plotSvg(src);
  return svg ? `<div class="plot-svg">${svg}</div>` : '';
}

function renderImages(): string {
  const all = project.manifest!.assets;
  const shown = all.filter((a) => side.filter === 'all' || a.kind === side.filter);
  const tabs = KINDS.map((k) => {
    const n = k.kind === 'all' ? all.length : all.filter((a) => a.kind === k.kind).length;
    return `<button data-filter="${k.kind}" class="${side.filter === k.kind ? 'on' : ''}">${k.label}<span>${n}</span></button>`;
  }).join('');
  const grid = shown.length
    ? `<div class="pool">${shown.map((a) => `<div class="card${a.id === side.asset ? ' on' : ''}" data-asset="${a.id}" draggable="true" title="${escapeHtml(a.name)} — double-click to place, or drag onto the poster">` +
      `<div class="thumb">${thumb(a.src)}</div>` +
      `<span class="name">${escapeHtml(a.name)}</span><button class="row-btn" data-a="menu" title="More">⋯</button></div>`).join('')}</div>`
    : `<p class="side-empty">${KINDS.find((k) => k.kind === side.filter)!.empty}</p>`;
  return `<div class="side-head"><h2>Images</h2><button data-a="new-plot" title="Make a plot from a table in the Data sidebar">New plot</button>` +
    `<button data-a="import-images" title="Add image files to the project">Import…</button></div>` +
    `<div class="seg-tabs">${tabs}</div>${grid}`;
}

function assetMenu(btn: HTMLElement, id: string, at?: { x: number; y: number }): void {
  const a = project.manifest?.assets.find((x) => x.id === id);
  if (!a) return;
  openMenu(btn, [
    ...(a.kind === 'plot' ? [{ label: 'Edit plot', run: () => editPlot(a) }] : []),
    { label: 'Place on poster', run: () => placeImage(a.src), title: 'Into the selected image tile, or as a new tile' },
    { label: 'Rename…', run: async () => { const n = await askName('Image name', a.name); if (n) await session.renameAsset(id, n); } },
    { label: 'Remove from library…', run: async () => {
      const used = await session.assetUsage(a.src);
      const msg = used.length
        ? `“${a.name}” is used in: ${used.join(', ')}. Remove it from the library? (The posters keep showing it.)`
        : `Remove “${a.name}” from the library? Its file is deleted.`;
      if (confirm(msg)) await session.deleteAsset(id);
    } },
  ], at);
}

/* ---- Data ---- */

const CLASS_HINT: Record<DataClass, string> = {
  table: 'table — named columns of values', double: 'double — numbers', logical: 'logical — true / false',
  char: 'char — text', struct: 'struct — named fields', cell: 'cell — mixed values',
};

function preview(d: data.DataItem): string {
  if (d.error) return `<p class="side-error">Could not read ${escapeHtml(d.file)}: ${escapeHtml(d.error)}</p>`;
  const v = d.value!;
  if (v.kind === 'table') {
    const { columns, rows } = v.table, cut = rows.slice(0, 6);
    const cell = (c: unknown) => `<td${typeof c === 'string' ? ' class="txt"' : ''}>${c === null ? '' : escapeHtml(c)}</td>`;
    return `<table class="peek"><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>` +
      `<tbody>${cut.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>` +
      (rows.length > cut.length ? `<p class="side-hint">… ${rows.length - cut.length} more rows. Double-click to open.</p>` : '');
  }
  const text = JSON.stringify(v.value, null, 1);
  return `<pre class="peek">${escapeHtml(text.length > 800 ? text.slice(0, 800) + ' …' : text)}</pre>`;
}

const valueHtml = (): string => {
  const sel = data.workspace.items.find((d) => d.file === side.data);
  return sel ? `<h3>${escapeHtml(sel.name)}</h3>${preview(sel)}` : '';
};

function renderData(): string {
  const items = data.workspace.items;
  const rows = items.map((d) => `<tr class="${d.file === side.data ? 'on' : ''}${d.error ? ' bad' : ''}" data-file="${escapeHtml(d.file)}" title="${escapeHtml(d.file)} — double-click to open">` +
    `<td class="name">${escapeHtml(d.name)}</td><td>${d.error ? '—' : d.size}</td>` +
    `<td title="${d.cls ? CLASS_HINT[d.cls] : ''}">${d.error ? 'error' : d.cls}</td>` +
    `<td><button class="row-btn" data-a="menu" title="More">⋯</button></td></tr>`).join('');
  return `<div class="side-head"><h2>Data</h2>` +
    `<button data-a="new-plot" title="Plot the selected table">Plot</button>` +
    `<button data-a="import-data" title="Add CSV, TSV or JSON files to the project's data folder">Import…</button>` +
    `<button data-a="new-table" title="Make a table and save it as a CSV file">New table</button></div>` +
    (items.length
      ? `<table class="workspace"><thead><tr><th>Name</th><th>Size</th><th>Class</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="side-empty">No data yet. Import CSV, TSV or JSON files (or drop them here), or make a new table. They are kept in the project\'s data folder.</p>') +
    `<div class="value">${valueHtml()}</div>`;
}

function dataMenu(btn: HTMLElement, file: string, at?: { x: number; y: number }): void {
  const d = data.workspace.items.find((x) => x.file === file);
  if (!d) return;
  openMenu(btn, [
    { label: 'Open', run: () => openDataEditor(d) },
    ...(d.value?.kind === 'table' ? [{ label: 'Plot…', run: () => newPlot(d.name), title: 'Make a plot from this table' }] : []),
    { label: 'Rename…', run: async () => { const n = await askName('Data name', d.name); if (n) await data.renameData(d, n); } },
    { label: 'Delete…', run: () => { if (confirm(`Delete ${d.file} from the project's data folder?`)) void data.deleteData(d); } },
  ], at);
}

async function newTable(): Promise<void> {
  const name = await askName('Name of the new table', 'table');
  if (!name) return;
  const d = await data.newTable(name);
  if (d) { side.data = d.file; openDataEditor(d); }
}

/* ---- rendering ---- */

function stateKey(): string {
  const m = project.manifest;
  if (!m) return '';
  return JSON.stringify([side.tab, side.filter, side.asset, side.data, [...side.collapsed], project.poster?.id,
    m.posters.map((p) => [p.id, p.name, p.parent]), m.assets.map((a) => [a.id, a.name, a.kind, a.src.length]),
    data.workspace.version, plotRevision()]);
}

export function updateSidebar(): void {
  const open = !!side.tab && !!project.manifest;
  document.body.classList.toggle('side-open', open);
  $$<HTMLElement>('#activity [data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === side.tab));
  if (!open) return;
  const key = stateKey();
  if (key === side.key) return;
  side.key = key;
  const panel = $('#sidePanel');
  panel.dataset.tab = side.tab;
  panel.innerHTML = side.tab === 'posters' ? renderPosters() : side.tab === 'images' ? renderImages() : renderData();
}

function showTab(tab: SideTab): void {
  side.tab = side.tab === tab ? '' : tab;
  savePrefs({ side: side.tab });
  side.key = '';
  updateSidebar();
}

const refresh = (): void => { side.key = ''; updateSidebar(); };

/** Show a new selection without redrawing the panel (so a double-click still lands on the same element). */
function showSelection(): void {
  const panel = $('#sidePanel');
  $$<HTMLElement>('.card', panel).forEach((c) => c.classList.toggle('on', c.dataset.asset === side.asset));
  $$<HTMLElement>('tr[data-file]', panel).forEach((r) => r.classList.toggle('on', r.dataset.file === side.data));
  const value = $('.value', panel);
  if (value) value.innerHTML = valueHtml();
  side.key = stateKey();
}

/* ---- events ---- */

function onClick(e: MouseEvent): void {
  const t = e.target as HTMLElement;
  const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
  const node = t.closest<HTMLElement>('.node'), card = t.closest<HTMLElement>('[data-asset]');
  const row = t.closest<HTMLElement>('tr[data-file]'), filter = t.closest<HTMLElement>('[data-filter]');
  const btn = t.closest<HTMLElement>('button') ?? t;

  if (a === 'new-base') void session.newPoster();
  else if (a === 'import-images') $<HTMLInputElement>('#fileImages').click();
  else if (a === 'import-data') $<HTMLInputElement>('#fileData').click();
  else if (a === 'new-table') void newTable();
  else if (a === 'new-plot') newPlot(data.workspace.items.find((d) => d.file === side.data)?.name);
  else if (node) {
    const id = node.dataset.id!;
    if (a === 'fold') { if (!side.collapsed.delete(id)) side.collapsed.add(id); refresh(); }
    else if (a === 'variant') void session.newVariant(id);
    else if (a === 'menu') posterMenu(btn, id);
    else if (closeDataEditor() && closePlotEditor() && id !== project.poster?.id) void session.openPoster(id);
  } else if (card) {
    side.asset = card.dataset.asset!;
    showSelection();
    if (a === 'menu') assetMenu(btn, side.asset);
  } else if (row) {
    if (side.data !== row.dataset.file) { side.data = row.dataset.file!; showSelection(); }
    if (a === 'menu') dataMenu(btn, side.data);
  } else if (filter) {
    side.filter = filter.dataset.filter as AssetKind | 'all';
    refresh();
  }
}

function onDblClick(e: MouseEvent): void {
  const t = e.target as HTMLElement;
  if (t.closest('[data-a]')) return;
  const card = t.closest<HTMLElement>('[data-asset]'), row = t.closest<HTMLElement>('tr[data-file]');
  if (card) {
    const a = project.manifest?.assets.find((x) => x.id === card.dataset.asset);
    if (a?.kind === 'plot') void editPlot(a); // plots open for editing; drag them onto the poster to place them
    else if (a) placeImage(a.src);
  } else if (row) {
    const d = data.workspace.items.find((x) => x.file === row.dataset.file);
    if (d) openDataEditor(d);
  }
}

function onContextMenu(e: MouseEvent): void {
  const t = e.target as HTMLElement, at = { x: e.clientX, y: e.clientY };
  const node = t.closest<HTMLElement>('.node'), card = t.closest<HTMLElement>('[data-asset]');
  const row = t.closest<HTMLElement>('tr[data-file]');
  if (!node && !card && !row) return;
  e.preventDefault();
  if (node) posterMenu(node, node.dataset.id!, at);
  else if (card) assetMenu(card, card.dataset.asset!, at);
  else if (row) dataMenu(row, row.dataset.file!, at);
}

function bindDrag(panel: HTMLElement): void {
  panel.addEventListener('dragstart', (e) => {
    const t = e.target as HTMLElement, dt = e.dataTransfer!;
    const node = t.closest<HTMLElement>('.node'), card = t.closest<HTMLElement>('[data-asset]');
    if (node) { dt.setData(POSTER_DRAG, node.dataset.id!); dt.effectAllowed = 'move'; }
    else if (card) {
      const a = project.manifest?.assets.find((x) => x.id === card.dataset.asset);
      if (a) { dt.setData(ASSET_DRAG, a.src); dt.effectAllowed = 'copy'; }
    }
  });
  const target = (e: DragEvent) => (e.target as HTMLElement).closest<HTMLElement>('.node, [data-drop]');
  const clear = () => $$('.drop-on', panel).forEach((x) => x.classList.remove('drop-on'));
  panel.addEventListener('dragover', (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (types.includes(POSTER_DRAG)) {
      e.preventDefault();
      clear();
      target(e)?.classList.add('drop-on');
    } else if (types.includes('Files')) {
      e.preventDefault(); // files dropped here go into the library
      e.stopPropagation();
    }
  });
  panel.addEventListener('dragleave', clear);
  panel.addEventListener('drop', (e) => {
    const dt = e.dataTransfer!;
    clear();
    const id = dt.getData(POSTER_DRAG);
    if (id) {
      e.preventDefault();
      const to = target(e);
      const parent = to?.classList.contains('node') ? to.dataset.id! : null;
      if (parent !== id) void session.movePoster(id, parent).then(() => {
        const p = project.manifest?.posters.find((x) => x.id === id);
        if (p && p.parent !== parent) notify('A poster can’t become a variant of its own variant');
      });
      return;
    }
    const list = [...dt.files];
    if (!list.length) return;
    e.preventDefault();
    e.stopPropagation();
    void importFiles(list);
  });
}

async function importFiles(list: File[]): Promise<void> {
  const images = list.filter((f) => f.type.startsWith('image/'));
  const rest = list.filter((f) => !f.type.startsWith('image/'));
  for (const f of images) {
    try { await session.importImage(f); } catch (err) { notify(`Could not add ${f.name}: ${(err as Error).message}`); }
  }
  if (rest.length) {
    const added = await data.importDataFiles(rest);
    if (added.length < rest.length) notify('Only CSV, TSV and JSON files can be added as data');
    if (added[0]) { side.data = added[0].file; if (!images.length) showTabIfClosed('data'); }
  }
  if (images.length && !rest.length) showTabIfClosed('images');
  refresh();
}

function showTabIfClosed(tab: SideTab): void {
  if (side.tab !== tab) showTab(tab);
}

export function bindSidebar(): void {
  const strip = $('#activity');
  strip.innerHTML = (['posters', 'images', 'data'] as SideTab[]).map((t) =>
    `<button data-side="${t}" title="${t[0].toUpperCase() + t.slice(1)}">${icons[t]}<span>${t[0].toUpperCase() + t.slice(1)}</span></button>`).join('');
  strip.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-side]');
    if (b) showTab(b.dataset.side as SideTab);
  });
  side.tab = (loadPrefs().side as SideTab | '') ?? 'posters';

  const panel = $('#sidePanel');
  panel.addEventListener('click', onClick);
  panel.addEventListener('dblclick', onDblClick);
  panel.addEventListener('contextmenu', onContextMenu);
  bindDrag(panel);

  const pick = (sel: string) => $<HTMLInputElement>(sel).addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement, list = [...(input.files || [])];
    input.value = '';
    if (list.length) await importFiles(list);
  });
  pick('#fileImages');
  pick('#fileData');
}
