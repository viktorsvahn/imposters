/* Design ("master") settings: colour roles and text styles shared by the whole
   document. Tiles refer to them ("@tile", data-ts="h2"), so changing the
   design restyles everything that uses it. */

import { DEFAULT_PALETTE, paletteById } from './palettes';
import type { Brand, ColorRoleId, Design, TextStyle, Border, BorderKind, Space, Tile } from './types';

export interface FontDef {
  id: string;
  label: string;
  css: string;
  /** included: comes with the app (works everywhere, embedded in exports); computer: generic fonts of the
      computer; web: Google Fonts of older posters (loaded from the internet, offered only where used) */
  group: 'included' | 'computer' | 'web';
  /** Google Fonts family and weights (web fonts) */
  family?: string;
  weights?: string;
}

export const FONT_LIST: FontDef[] = [
  { id: 'heros', label: 'TeX Gyre Heros (Helvetica-like)', css: '"TeX Gyre Heros", Helvetica, Arial, sans-serif', group: 'included' },
  { id: 'termes', label: 'TeX Gyre Termes (Times-like)', css: '"TeX Gyre Termes", "Times New Roman", serif', group: 'included' },
  { id: 'lmroman', label: 'Latin Modern Roman (LaTeX)', css: '"Latin Modern Roman", "Computer Modern", serif', group: 'included' },
  { id: 'lmsans', label: 'Latin Modern Sans (LaTeX)', css: '"Latin Modern Sans", sans-serif', group: 'included' },
  { id: 'plex-mono', label: 'IBM Plex Mono', css: '"IBM Plex Mono", ui-monospace, monospace', group: 'included' },
  { id: 'helvetica', label: 'Helvetica / Arial', css: '"Helvetica Neue", Helvetica, Arial, sans-serif', group: 'computer' },
  { id: 'sans', label: 'System sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', group: 'computer' },
  { id: 'serif', label: 'System serif', css: 'Georgia, "Times New Roman", serif', group: 'computer' },
  { id: 'mono', label: 'System monospace', css: 'ui-monospace, Consolas, "Courier New", monospace', group: 'computer' },
  { id: 'condensed', label: 'Condensed', css: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif', group: 'computer' },
  { id: 'inter', label: 'Inter', css: '"Inter", system-ui, sans-serif', group: 'web', family: 'Inter', weights: '400;500;600;700;800' },
  { id: 'montserrat', label: 'Montserrat', css: '"Montserrat", system-ui, sans-serif', group: 'web', family: 'Montserrat', weights: '400;500;600;700;800' },
  { id: 'lato', label: 'Lato', css: '"Lato", system-ui, sans-serif', group: 'web', family: 'Lato', weights: '400;700;900' },
  { id: 'raleway', label: 'Raleway', css: '"Raleway", system-ui, sans-serif', group: 'web', family: 'Raleway', weights: '400;500;600;700;800' },
  { id: 'oswald', label: 'Oswald', css: '"Oswald", "Arial Narrow", sans-serif', group: 'web', family: 'Oswald', weights: '400;500;600;700' },
  { id: 'roboto-slab', label: 'Roboto Slab', css: '"Roboto Slab", Georgia, serif', group: 'web', family: 'Roboto Slab', weights: '400;500;600;700;800' },
  { id: 'merriweather', label: 'Merriweather', css: '"Merriweather", Georgia, serif', group: 'web', family: 'Merriweather', weights: '400;700;900' },
  { id: 'playfair', label: 'Playfair Display', css: '"Playfair Display", Georgia, serif', group: 'web', family: 'Playfair Display', weights: '400;500;600;700;800' },
  { id: 'source-serif', label: 'Source Serif', css: '"Source Serif 4", Georgia, serif', group: 'web', family: 'Source Serif 4', weights: '400;500;600;700;800' },
  { id: 'libre-baskerville', label: 'Libre Baskerville', css: '"Libre Baskerville", Georgia, serif', group: 'web', family: 'Libre Baskerville', weights: '400;700' },
];

export const FONTS: Record<string, string> = Object.fromEntries(FONT_LIST.map((f) => [f.id, f.css]));

/** Fonts installed on the computer are stored as "local:<family>". */
export const LOCAL_FONT = 'local:';
export const isLocalFont = (id: string): boolean => id.startsWith(LOCAL_FONT);

/** The CSS font-family of a font id ('' for none or unknown). */
export function fontCss(id: string): string {
  if (!id) return '';
  if (isLocalFont(id)) return `"${id.slice(LOCAL_FONT.length).replace(/"/g, '')}", sans-serif`;
  return FONTS[id] ?? '';
}

export function fontLabel(id: string): string {
  return isLocalFont(id) ? id.slice(LOCAL_FONT.length) : FONT_LIST.find((f) => f.id === id)?.label ?? id;
}

/** The font id of a CSS font-family (its first family), if it is one we know. */
export function fontIdOfCss(css: string, local: readonly string[] = []): string | null {
  const first = (c: string) => c.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  const fam = first(css);
  const known = FONT_LIST.find((f) => first(f.css) === fam);
  if (known) return known.id;
  const l = local.find((x) => x.toLowerCase() === fam);
  return l ? LOCAL_FONT + l : null;
}

export const WEIGHTS: [string, string][] = [
  ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold'],
];

/** Colour roles, in display order. Tiles store "@role" to follow the design. */
export const ROLES: { id: ColorRoleId; label: string; textless?: boolean }[] = [
  { id: 'paper', label: 'Paper', textless: true },
  { id: 'tile', label: 'Tiles' },
  { id: 'header', label: 'Poster header' },
  { id: 'footer', label: 'Poster footer' },
  { id: 'tileHeader', label: 'Tile headers' },
  { id: 'tileFooter', label: 'Tile footers' },
];

/** Built-in text styles; more can be added in the Design tab. Fonts are TeX Gyre Heros (included); sizes (pt) follow a typical A0 poster: banner
    title, section headings, body text and a grey caption for figures and notes. */
const BASE_STYLES: [string, string, string, number, string, Partial<TextStyle>?][] = [
  ['title', 'Poster title', 'heros', 61.5, '700', { tracking: -0.02 }],
  ['subtitle', 'Poster subtitle', 'heros', 28.5, '600'],
  ['tileTitle', 'Tile title', 'heros', 37.5, '700', { color: '#16202a' }],
  ['tileSubtitle', 'Tile subtitle', 'heros', 20.25, '400', { color: '#4a5866' }],
  ['body', 'Body', 'heros', 24.75, '400', { color: '#16202a' }],
  ['caption', 'Caption', 'heros', 20.25, '400', { color: '#33414f' }],
  ['h1', 'Heading 1', 'heros', 37.5, '700'],
  ['h2', 'Heading 2', 'heros', 28.5, '700'],
  ['h3', 'Heading 3', 'heros', 24.75, '700'],
  ['h4', 'Heading 4', 'heros', 20.25, '700'],
  ['h5', 'Heading 5', 'heros', 18, '600', { upper: true }],
];
export const isBaseStyle = (id: string): boolean => BASE_STYLES.some((b) => b[0] === id);

const DESIGN_VERSION = 2;

export const defaultBrand = (): Brand => ({ watermark: null, logo: null, footerLogos: { srcs: [], h: 20, align: 'spread' } });

export function defaultDesign(): Design {
  return {
    colors: {
      paper: { bg: '#ffffff', text: '' },
      tile: { bg: '', text: '' }, // no fill: tiles show the paper (the editor tints them so they can be seen)
      header: { bg: '#1f3a5f', text: '#ffffff' },
      footer: { bg: '#1f3a5f', text: '#ffffff' },
      tileHeader: { bg: '', text: '' },
      tileFooter: { bg: '', text: '' },
    },
    styles: BASE_STYLES.map(([id, name, font, size, weight, extra]) => ({
      id, name, font, size, weight, italic: false, upper: false, color: '', enabled: true, ...extra,
    })),
    palette: DEFAULT_PALETTE,
    brand: defaultBrand(),
    table: { rule: 2.25, line: '#c3cad2' },
    recent: [],
    borders: Object.fromEntries(BORDER_KINDS.map((k) => [k.id, noBorder()])) as Record<BorderKind, Border>,
    tileSubtitle: 'below',
    localGutter: 10.5,
    localGutterY: 6.5,
    space: { text: { x: 8, y: 8 }, header: { x: 8, y: 4 } },
    v: DESIGN_VERSION,
  };
}

/** The design's space around text for a kind of tile: headers and footers have their own. */
export const designSpace = (d: Design, t: Tile): Space => (t.role || t.inBand ? d.space.header : d.space.text);

/** The space around a tile's text (mm), left/right and top/bottom: its own, or the design's. */
export function paddingOf(d: Design, t: Tile): Space {
  const s = designSpace(d, t);
  return { x: t.padX ?? s.x, y: t.padY ?? s.y };
}

export const noBorder = (): Border => ({ w: 0, c: '#1a1a1a', sides: 'trbl', radius: 0 });

/** The kinds of tile with a design border, in display order. */
export const BORDER_KINDS: { id: BorderKind; label: string }[] = [
  { id: 'global', label: 'Tiles on the poster' },
  { id: 'local', label: 'Tiles inside tiles' },
  { id: 'header', label: 'Poster header' },
  { id: 'footer', label: 'Poster footer' },
  { id: 'tileHeader', label: 'Tile headers' },
  { id: 'tileFooter', label: 'Tile footers' },
];

/** Which design border a tile gets (parent: the tile it sits in). Pieces of a cut header/footer get none. */
export function borderKindOf(t: Tile, parent: Tile | null): BorderKind | null {
  if (parent && (parent.role || parent.inBand)) return null;
  const band = t.role ?? t.inBand;
  if (band) return parent ? (band === 'header' ? 'tileHeader' : 'tileFooter') : band;
  return parent ? 'local' : 'global';
}

/** The border a tile shows: its own, or the design's for its kind. */
export function borderOf(d: Design, t: Tile, parent: Tile | null): Border {
  if (t.ownBorder) return { w: t.borderW, c: t.borderC, sides: t.borderSides ?? 'trbl', radius: t.radius };
  const k = borderKindOf(t, parent);
  return k ? d.borders[k] : noBorder();
}

/** The text styles of the two kinds of header: the poster's banner, and the headers of tiles. */
export const HEADER_STYLES = { poster: ['title', 'subtitle'], tile: ['tileTitle', 'tileSubtitle'] } as const;

/** What a new header holds: a title row and a subtitle row, in the styles of its kind. */
export function headerHtml(kind: 'poster' | 'tile'): string {
  const [t, s] = HEADER_STYLES[kind];
  return kind === 'poster'
    ? `<div data-ts="${t}">Poster title</div><div data-ts="${s}">Authors · Affiliation</div>`
    : `<div data-ts="${t}">Title</div><div data-ts="${s}">Subtitle</div>`;
}

export function newTextStyle(id: string): TextStyle {
  return { id, name: 'New style', font: 'heros', size: 28.5, weight: '700', italic: false, upper: false, color: '', enabled: true };
}

const OLD_TILE_GREY = '#f1f3f5';

/** Fill in anything missing (older documents, new roles/styles). */
export function normalizeDesign(input: Partial<Design> | undefined): Design {
  const base = defaultDesign();
  const d = (input || {}) as Partial<Design>;
  const colors = Object.assign(base.colors, d.colors || {});
  // tiles used to be filled light grey by default; that grey only meant "here is a tile" — now the editor shows it
  if (colors.tile?.bg?.toLowerCase() === OLD_TILE_GREY) colors.tile = { ...colors.tile, bg: '' };
  // the first design version had a different style set
  const old = d.v === DESIGN_VERSION ? d.styles || [] : [];
  const have = new Map(old.map((s) => [s.id, s]));
  const styles = base.styles.map((s) => Object.assign(s, have.get(s.id) || {}))
    .concat(old.filter((s) => !isBaseStyle(s.id)));
  // the banner's styles were called just "Title" / "Subtitle" before tile headers had their own
  for (const s of styles) {
    if (s.id === 'title' && s.name === 'Title') s.name = 'Poster title';
    if (s.id === 'subtitle' && s.name === 'Subtitle') s.name = 'Poster subtitle';
  }
  const borders = Object.fromEntries(BORDER_KINDS.map((k) => [k.id, { ...noBorder(), ...(d.borders?.[k.id] || {}) }])) as Record<BorderKind, Border>;
  const b = d.brand, fl = b?.footerLogos;
  const brand: Brand = {
    watermark: b?.watermark?.src ? { src: b.watermark.src, opacity: b.watermark.opacity ?? 0.12, fit: b.watermark.fit === 'contain' ? 'contain' : 'cover' } : null,
    logo: b?.logo?.src ? { src: b.logo.src, side: b.logo.side === 'left' ? 'left' : 'right', h: b.logo.h ?? 50 } : null,
    footerLogos: { ...defaultBrand().footerLogos, ...fl, srcs: Array.isArray(fl?.srcs) ? fl!.srcs.filter(Boolean) : [] },
  };
  const table = { rule: 2.25, line: '#c3cad2', ...d.table };
  return { colors, styles, palette: paletteById(d.palette).id, brand, table, recent: d.recent || [], borders, localGutter: d.localGutter ?? 10.5, localGutterY: d.localGutterY ?? d.localGutter ?? 6.5, space: { text: { x: 8, y: 8, ...d.space?.text }, header: { x: 8, y: 4, ...d.space?.header } }, tileSubtitle: d.tileSubtitle === 'beside' ? 'beside' : 'below', v: DESIGN_VERSION };
}

export const styleById = (d: Design, id: string): TextStyle | undefined => d.styles.find((s) => s.id === id);
export const offeredStyles = (d: Design): TextStyle[] => d.styles.filter((s) => s.enabled || s.id === 'body');

const roleOf = (d: Design, v: string) => d.colors[v.slice(1) as ColorRoleId];

/** "@role" → the design fill; "#hex" → itself; "" → none. */
export function resolveBg(d: Design, v: string | null | undefined): string {
  if (v && v[0] === '@') return roleOf(d, v)?.bg || '';
  return v || '';
}

/** "@role" → the design text colour; "#hex" → itself; "" → automatic. */
export function resolveText(d: Design, v: string | null | undefined): string {
  if (v && v[0] === '@') return roleOf(d, v)?.text || '';
  return v || '';
}

/** Add a colour to the history (newest first). Returns false if nothing changed. */
export function rememberColor(d: Design, c: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) return false;
  const v = c.toLowerCase();
  const i = d.recent.indexOf(v);
  if (i === 0) return false;
  if (i > 0) d.recent.splice(i, 1);
  d.recent.unshift(v);
  d.recent.length = Math.min(d.recent.length, 16);
  return true;
}

/** Design colours in use plus the history: the swatches offered everywhere. */
export function swatchColors(d: Design): string[] {
  const list: string[] = paletteById(d.palette).colors.map((c) => c.toLowerCase());
  for (const c of Object.values(d.colors)) for (const v of [c.bg, c.text]) if (v) list.push(v.toLowerCase());
  list.push(...d.recent);
  return [...new Set(list)];
}
