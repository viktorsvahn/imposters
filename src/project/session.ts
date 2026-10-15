/* The open project: its manifest, the poster (variant) being edited, saving,
   and images copied into the project folder. */

import { STORAGE } from '../constants';
import { resetHistory } from '../editor/history';
import { hooks, notify, render } from '../editor/hooks';
import { editor } from '../editor/store';
import { zoomFit } from '../interaction/zoom';
import { loadDocument, newDocument } from '../model/document';
import {
  addAsset, addPosterEntry, decodeDataUrl, IMAGE_DIR, imageExt, isExternalSrc, loadManifest, nameFromFile, newManifest,
  PROJECT_FILE, removePosterEntry, renamePosterEntry, setPosterParent, slugify, uniqueName, type AssetEntry, type Manifest,
  type PosterEntry,
} from '../model/project';
import type { Doc, Tile } from '../model/types';
import { uid } from '../util';
import { forgetPlots } from '../view/plot-svg';
import { preparePrint } from '../view/print';
import { publishHtml } from '../view/publish';
import { desktop, files } from './backend';
import { loadWorkspace } from './data';

const SAVE_DELAY = 400; // ms after the last change

export const project = {
  /** the project folder ('' for the browser's built-in project) */
  root: null as string | null,
  manifest: null as Manifest | null,
  poster: null as PosterEntry | null,
};

export const projectOpen = (): boolean => !!project.manifest;

const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() || 'Project';

/* ---- saving ---- */

let pending: { file: string; json: string } | null = null;
let last = { file: '', json: '' };
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();
let failWarned = false;

/** Save the current poster soon (called after every change). */
export function queueSave(json: string): void {
  const p = project.poster;
  if (!p) return;
  if (last.file === p.file && last.json === json) {
    // back to what is on disk (e.g. a change undone before it was saved): drop the save still waiting
    if (pending?.file === p.file) { pending = null; clearTimeout(timer); }
    return;
  }
  pending = { file: p.file, json };
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), SAVE_DELAY);
}

/** Finish any pending save. */
export async function flush(): Promise<void> {
  clearTimeout(timer);
  const p = pending;
  pending = null;
  if (p) {
    writing = writing
      .then(() => files.write(p.file, JSON.stringify(JSON.parse(p.json), null, 1)))
      .then(() => { last = p; failWarned = false; }, (err: Error) => {
        if (!failWarned) {
          notify(desktop ? 'Could not save: ' + err.message
            : 'Autosave failed (document too large) — use Save to keep your work');
        }
        failWarned = true;
      });
  }
  await writing;
}

/** Save what is pending right now, without waiting (the page is closing or reloading). */
function flushNow(): void {
  if (editor.view.editing) hooks.stopEditing();
  clearTimeout(timer);
  const p = pending;
  pending = null;
  if (p) {
    try { files.writeSync(p.file, JSON.stringify(JSON.parse(p.json), null, 1)); } catch { /* nothing left to tell */ }
  }
}

const writeManifest = (): Promise<void> => files.write(PROJECT_FILE, JSON.stringify(project.manifest, null, 1));

/* ---- images ---- */

async function hashName(bytes: Uint8Array): Promise<string> {
  if (!crypto.subtle) return uid();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Copy an image into the project (named by its content, so repeats are stored once). */
async function storeImage(bytes: Uint8Array, mime: string, fileName = ''): Promise<string> {
  const rel = `${IMAGE_DIR}/${await hashName(bytes)}.${imageExt(mime, fileName)}`;
  if (!(await files.exists(rel))) await files.write(rel, bytes);
  return rel;
}

const dataUrlOf = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

/** An image source for a picked / dropped / pasted file — a project file, or inline in
    the browser — added to the image library. */
export async function importImage(file: File): Promise<string> {
  const src = desktop ? await storeImage(new Uint8Array(await file.arrayBuffer()), file.type, file.name) : await dataUrlOf(file);
  await addToLibrary(src, nameFromFile(file.name || 'Image'));
  return src;
}

async function addToLibrary(src: string, name: string): Promise<AssetEntry | null> {
  const m = project.manifest;
  if (!m) return null;
  const n = m.assets.length, a = addAsset(m, 'image', name, src);
  if (m.assets.length !== n) { await writeManifest(); render(); }
  return a;
}

/** Move images inlined in `doc` (older files, imports) into the project folder. */
async function internalizeImages(doc: Doc): Promise<void> {
  if (!desktop) return;
  const walk = async (ts: Tile[]): Promise<void> => {
    for (const t of ts) {
      const data = t.src && decodeDataUrl(t.src);
      if (data) { t.src = await storeImage(data.bytes, data.mime); await addToLibrary(t.src, 'Image'); }
      if (t.children) await walk(t.children);
    }
  };
  await walk(doc.tiles);
}

/** Add a saved plot to the library, or rename the entry it already has. */
export async function addPlotAsset(name: string, src: string, id: string | null): Promise<AssetEntry | null> {
  const m = project.manifest;
  if (!m) return null;
  const have = m.assets.find((a) => a.id === id || a.src === src);
  if (have) have.name = uniqueName(name.trim() || 'Plot', m.assets.filter((a) => a !== have).map((a) => a.name));
  const a = have ?? addAsset(m, 'plot', name || 'Plot', src);
  await writeManifest();
  render();
  return a;
}

/** Add image files put into assets/images by hand to the library. */
async function scanImages(m: Manifest): Promise<void> {
  if (!desktop) return;
  for (const f of await files.list(IMAGE_DIR)) {
    if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(f)) addAsset(m, 'image', nameFromFile(f), `${IMAGE_DIR}/${f}`);
  }
}

export async function renameAsset(id: string, name: string): Promise<void> {
  const m = project.manifest, a = m?.assets.find((x) => x.id === id);
  if (!m || !a || !name.trim()) return;
  a.name = uniqueName(name.trim(), m.assets.filter((x) => x !== a).map((x) => x.name));
  await writeManifest();
  render();
}

/** Names of the posters that show `src`. */
export async function assetUsage(src: string): Promise<string[]> {
  const m = project.manifest;
  if (!m) return [];
  const uses = (ts: Tile[]): boolean => ts.some((t) => t.src === src || (!!t.children && uses(t.children)));
  const names: string[] = [];
  for (const p of m.posters) {
    let tiles: Tile[] = [];
    if (p.id === project.poster?.id) tiles = editor.doc.tiles;
    else { try { tiles = loadDocument(JSON.parse((await files.read(p.file)) || 'null')).tiles; } catch { /* unreadable */ } }
    if (uses(tiles)) names.push(p.name);
  }
  return names;
}

/** Remove an image from the library; its file goes too unless a poster still shows it. */
export async function deleteAsset(id: string): Promise<void> {
  const m = project.manifest, a = m?.assets.find((x) => x.id === id);
  if (!m || !a) return;
  m.assets = m.assets.filter((x) => x !== a);
  if (!isExternalSrc(a.src) && !(await assetUsage(a.src)).length) {
    if (desktop || a.kind === 'plot') await files.remove(a.src);
    if (a.kind === 'plot') await files.remove(a.src.replace(/\.svg$/, '.plot.json'));
  }
  await writeManifest();
  render();
}

/* ---- posters ---- */

/** Finish typing and saving in the poster being left. */
async function leavePoster(): Promise<void> {
  if (editor.view.editing) hooks.stopEditing();
  await flush();
}

function show(doc: Doc): void {
  editor.doc = doc;
  Object.assign(editor.view, { scope: null, editing: null, selected: new Set(), drag: null, hover: null });
  resetHistory(); // also saves the poster if loading completed or changed it
  hooks.docReplaced();
  render();
  zoomFit();
}

function updateTitle(): void {
  const m = project.manifest, p = project.poster;
  document.title = m && p ? `${p.name} — ${m.name} — Imposters` : 'Imposters';
}

/** Switch to another poster of the project. */
export async function openPoster(id: string): Promise<void> {
  const m = project.manifest, p = m?.posters.find((x) => x.id === id);
  if (!m || !p) return;
  await leavePoster();
  let doc: Doc;
  try {
    const text = await files.read(p.file);
    doc = text === null ? newDocument() : loadDocument(JSON.parse(text));
    if (text === null) notify(`${p.file} was missing — started an empty poster`);
  } catch (err) {
    notify(`Could not open ${p.name}: ${(err as Error).message}`);
    return;
  }
  await internalizeImages(doc);
  project.poster = p;
  last = { file: '', json: '' };
  if (m.active !== id) { m.active = id; await writeManifest(); }
  updateTitle();
  show(doc);
}

async function addPoster(name: string, doc: Doc, parent: string | null = null): Promise<void> {
  const m = project.manifest;
  if (!m) return;
  await leavePoster();
  await internalizeImages(doc);
  const p = addPosterEntry(m, name, parent);
  await files.write(p.file, JSON.stringify(doc, null, 1));
  await writeManifest();
  await openPoster(p.id);
}

/** A new empty base poster. */
export const newPoster = (): Promise<void> => addPoster('Poster', newDocument());

/** A variant of poster `id`: a copy of it, placed below it in the tree. */
export async function newVariant(id: string): Promise<void> {
  const src = project.manifest?.posters.find((p) => p.id === id);
  if (!src) return;
  let doc: Doc;
  if (src.id === project.poster?.id) {
    if (editor.view.editing) hooks.stopEditing();
    doc = JSON.parse(JSON.stringify(editor.doc));
  } else {
    try {
      doc = loadDocument(JSON.parse((await files.read(src.file)) || 'null'));
    } catch (err) {
      notify(`Could not read ${src.name}: ${(err as Error).message}`);
      return;
    }
  }
  await addPoster(src.name, doc, src.id);
}

/** Make a poster a variant of another (null = a base version). */
export async function movePoster(id: string, parent: string | null): Promise<void> {
  if (!project.manifest || !setPosterParent(project.manifest, id, parent)) return;
  await writeManifest();
  render();
}

/** Add a poster from a saved .json file as a new variant. */
export async function importPoster(text: string, fileName: string): Promise<void> {
  let doc: Doc;
  try {
    doc = loadDocument(JSON.parse(text));
  } catch (err) {
    notify('Could not open file: ' + (err as Error).message);
    return;
  }
  await addPoster(fileName.replace(/(\.poster)?\.json$/i, '') || 'Imported', doc);
}

export async function renamePoster(id: string, name: string): Promise<void> {
  if (!project.manifest) return;
  renamePosterEntry(project.manifest, id, name);
  await writeManifest();
  updateTitle();
  render();
}

export async function deletePoster(id: string): Promise<void> {
  const m = project.manifest;
  if (!m) return;
  if (m.posters.length < 2) { notify('A project needs at least one poster'); return; }
  const wasActive = project.poster?.id === id;
  if (wasActive) await leavePoster();
  const gone = removePosterEntry(m, id);
  if (!gone) return;
  await files.remove(gone.file);
  await writeManifest();
  if (wasActive) { project.poster = null; await openPoster(m.active!); } else render();
}

export async function renameProject(name: string): Promise<void> {
  if (!project.manifest || !name.trim()) return;
  project.manifest.name = name.trim();
  await writeManifest();
  updateTitle();
  render();
}

/* ---- projects ---- */

/** Load the project in the folder just opened (creating it if the folder is new). */
async function loadProject(root: string, legacyDoc?: string | null): Promise<boolean> {
  let m: Manifest;
  try {
    const text = await files.read(PROJECT_FILE);
    m = text === null ? newManifest(baseName(root)) : loadManifest(JSON.parse(text));
  } catch (err) {
    notify('Could not open project: ' + (err as Error).message);
    return false;
  }
  if (!m.posters.length) {
    let doc = newDocument();
    try { if (legacyDoc) doc = loadDocument(JSON.parse(legacyDoc)); } catch { /* unreadable: start fresh */ }
    const p = addPosterEntry(m, 'Poster');
    await files.write(p.file, JSON.stringify(doc, null, 1));
    m.active = p.id;
  }
  await scanImages(m);
  forgetPlots();
  project.root = root;
  project.manifest = m;
  project.poster = null;
  await writeManifest();
  await loadWorkspace();
  await openPoster(m.active!);
  return true;
}

async function switchProject(choose: () => Promise<string | null>): Promise<boolean> {
  await leavePoster();
  const prev = project.root, root = await choose();
  if (!root) return false;
  if (await loadProject(root)) return true;
  if (prev) await desktop!.openProject(prev); // keep saving where the open poster lives
  return false;
}

export const createProject = (): Promise<boolean> => switchProject(() => desktop!.chooseNewProject());
export const chooseProject = (): Promise<boolean> => switchProject(() => desktop!.chooseOpenProject());
export const openRecentProject = (root: string): Promise<boolean> =>
  switchProject(async () => ((await desktop!.openProject(root)) ? root : (notify('Folder not found: ' + root), null)));

/** Open the last project (desktop) or the built-in one (browser). False if nothing was opened. */
export async function startProject(): Promise<boolean> {
  // beforeunload is the one Electron runs in time when a window closes; pagehide covers browsers
  window.addEventListener('beforeunload', flushNow);
  window.addEventListener('pagehide', flushNow);
  if (!desktop) {
    // the browser keeps one project; the poster autosaved by older versions becomes its first poster
    const legacy = localStorage.getItem(STORAGE.doc) ?? localStorage.getItem(STORAGE.legacyDoc);
    return loadProject('Browser project', legacy);
  }
  const [lastRoot] = await desktop.recentProjects();
  return lastRoot ? openRecentProject(lastRoot) : false;
}

/** Save the poster as a web page (one file, images inside; plots keep their hover). */
export async function exportHtml(): Promise<void> {
  if (editor.view.editing) hooks.stopEditing();
  const name = slugify(project.poster?.name || 'poster');
  const html = await publishHtml(project.poster?.name || 'Poster', true);
  if (!desktop) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = name + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }
  try {
    const saved = await desktop.exportHtml(name, html);
    if (saved) notify('Saved ' + saved);
  } catch (err) {
    notify('HTML export failed: ' + (err as Error).message);
  }
}

/** Save to PDF at the paper size (desktop), or open the print dialog (browser). */
export async function exportPdf(): Promise<void> {
  if (!desktop) { window.print(); return; }
  preparePrint();
  try {
    const saved = await desktop.exportPdf(slugify(project.poster?.name || 'poster'));
    if (saved) notify('Saved ' + saved);
  } catch (err) {
    notify('PDF export failed: ' + (err as Error).message);
  }
  render();
}
