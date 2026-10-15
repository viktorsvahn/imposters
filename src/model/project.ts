/* A project is a folder: project.json (this manifest) lists the posters — a
   tree of base versions and the variants made from them — each saved as its
   own file under posters/, and the image library (files under assets/).
   Data files live under data/. Everything here is plain JSON. */

import { uid } from '../util';

export const PROJECT_FILE = 'project.json';
export const PROJECT_VERSION = 1;
export const POSTER_DIR = 'posters';
export const IMAGE_DIR = 'assets/images';
export const DATA_DIR = 'data';

export interface PosterEntry {
  id: string;
  name: string;
  /** path relative to the project folder */
  file: string;
  /** the poster this one is a variant of (null = a base version) */
  parent: string | null;
}

/** Where a library image comes from: added from outside, drawn in the app, or a plot. */
export type AssetKind = 'image' | 'drawing' | 'plot';

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  name: string;
  /** what an image tile shows: a project path (desktop app) or a data URL (browser) */
  src: string;
}

export interface Manifest {
  version: number;
  name: string;
  posters: PosterEntry[];
  /** the poster that was open last */
  active: string | null;
  assets: AssetEntry[];
}

export const newManifest = (name: string): Manifest =>
  ({ version: PROJECT_VERSION, name, posters: [], active: null, assets: [] });

/** Validate a saved manifest (older or hand-edited files get missing fields). */
export function loadManifest(raw: unknown): Manifest {
  const m = raw as Partial<Manifest> | null;
  if (!m || typeof m !== 'object' || !Array.isArray(m.posters)) throw new Error('Not an Imposters project');
  const posters: PosterEntry[] = m.posters.filter((p) => p && typeof p.file === 'string')
    .map((p) => ({ id: p.id || uid(), name: p.name || 'Poster', file: p.file, parent: p.parent ?? null }));
  // a parent that is missing, or that would make a loop, makes the poster a base version
  for (const p of posters) {
    if (p.parent && (!posters.some((x) => x.id === p.parent) || isWithin(posters, p.parent, p.id))) p.parent = null;
  }
  const active = posters.some((p) => p.id === m.active) ? m.active! : posters[0]?.id ?? null;
  const assets: AssetEntry[] = (Array.isArray(m.assets) ? m.assets : [])
    .filter((a) => a && typeof a.src === 'string' && a.src)
    .map((a) => ({ id: a.id || uid(), kind: ASSET_KINDS.includes(a.kind) ? a.kind : 'image', name: a.name || 'Image', src: a.src }));
  return { version: m.version ?? PROJECT_VERSION, name: m.name || 'Project', posters, active, assets };
}

/* ---- the poster tree ---- */

/** True if poster `id` is `ancestor` or lies below it. */
function isWithin(posters: PosterEntry[], id: string | null, ancestor: string): boolean {
  for (let n = 0; id && n <= posters.length; n++) {
    if (id === ancestor) return true;
    id = posters.find((p) => p.id === id)?.parent ?? null;
  }
  return false;
}

export interface PosterNode {
  poster: PosterEntry;
  children: PosterNode[];
}

/** The posters as a tree: base versions with their variants below them (in list order). */
export function posterTree(m: Manifest): PosterNode[] {
  const build = (parent: string | null): PosterNode[] =>
    m.posters.filter((p) => p.parent === parent).map((poster) => ({ poster, children: build(poster.id) }));
  return build(null);
}

/** Make `id` a variant of `parent` (null = a base version). False if that would make a loop. */
export function setPosterParent(m: Manifest, id: string, parent: string | null): boolean {
  const p = m.posters.find((x) => x.id === id);
  if (!p || (parent && (!m.posters.some((x) => x.id === parent) || isWithin(m.posters, parent, id)))) return false;
  p.parent = parent;
  return true;
}

/** A file-name-safe version of `s` ("Variant B (wide)" → "variant-b-wide"). */
export const slugify = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  || 'poster';

/** `base`, or "base 2", "base 3" … — the first one not in `taken`. */
export function uniqueName(base: string, taken: string[]): string {
  const set = new Set(taken.map((s) => s.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!set.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

/** Add a poster called (a unique version of) `name`, with its own file. */
export function addPosterEntry(m: Manifest, name: string, parent: string | null = null): PosterEntry {
  const unique = uniqueName(name.trim() || 'Poster', m.posters.map((p) => p.name));
  const files = m.posters.map((p) => p.file);
  let file = `${POSTER_DIR}/${slugify(unique)}.poster.json`;
  for (let i = 2; files.includes(file); i++) file = `${POSTER_DIR}/${slugify(unique)}-${i}.poster.json`;
  const entry = { id: uid(), name: unique, file, parent };
  // variants go right after their family, so the list reads like the tree
  let at = m.posters.length;
  if (parent) {
    const last = m.posters.map((x, i) => (isWithin(m.posters, x.id, parent) ? i : -1)).filter((i) => i >= 0).pop();
    if (last !== undefined) at = last + 1;
  }
  m.posters.splice(at, 0, entry);
  return entry;
}

/** Rename a poster (its file keeps its name, so links to it stay valid). */
export function renamePosterEntry(m: Manifest, id: string, name: string): void {
  const p = m.posters.find((x) => x.id === id);
  if (!p || !name.trim()) return;
  p.name = uniqueName(name.trim(), m.posters.filter((x) => x !== p).map((x) => x.name));
}

/** Remove a poster from the list (its variants move up to its parent); the next one becomes active. */
export function removePosterEntry(m: Manifest, id: string): PosterEntry | null {
  const i = m.posters.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const [gone] = m.posters.splice(i, 1);
  for (const p of m.posters) if (p.parent === id) p.parent = gone.parent;
  if (m.active === id) m.active = m.posters[Math.min(i, m.posters.length - 1)]?.id ?? null;
  return gone;
}

/* ---- the image library ---- */

export const ASSET_KINDS: AssetKind[] = ['image', 'drawing', 'plot'];

/** Add an image to the library — or return the entry that already shows `src`. */
export function addAsset(m: Manifest, kind: AssetKind, name: string, src: string): AssetEntry {
  const have = m.assets.find((a) => a.src === src);
  if (have) return have;
  const entry = { id: uid(), kind, name: uniqueName(name.trim() || 'Image', m.assets.map((a) => a.name)), src };
  m.assets.push(entry);
  return entry;
}

/** A name for a library entry made from a file name ("fig_3.final.png" → "fig_3.final"). */
export const nameFromFile = (fileName: string): string => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Image';

/** True for image sources that are not project files (inline data, web, blob). */
export const isExternalSrc = (src: string): boolean => /^(data|https?|blob|file):/i.test(src);

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/avif': 'avif', 'image/bmp': 'bmp',
};

/** File extension for an image, from its MIME type or else its file name. */
export function imageExt(mime: string, fileName = ''): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  return EXT[mime.toLowerCase()] || (fromName === 'jpeg' ? 'jpg' : fromName) || 'png';
}

/** Split a base64 data URL into its MIME type and bytes (null if it isn't one). */
export function decodeDataUrl(src: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
  if (!m) return null;
  if (!m[2]) return { mime: m[1], bytes: new TextEncoder().encode(decodeURIComponent(m[3])) };
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}
