/* Design ("master") settings: colour roles and text styles shared by the whole
   document. Tiles refer to them ("@tile", data-ts="h2"), so changing the
   design restyles everything that uses it. */

import type { ColorRoleId, Design, TextStyle } from './types';

export interface FontDef {
  id: string;
  label: string;
  css: string;
  /** Google Fonts family and weights, for web fonts. */
  family?: string;
  weights?: string;
}

export const FONT_LIST: FontDef[] = [
  { id: 'sans', label: 'System sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { id: 'serif', label: 'System serif', css: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Monospace', css: 'ui-monospace, Consolas, "Courier New", monospace' },
  { id: 'condensed', label: 'Condensed', css: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif' },
  { id: 'inter', label: 'Inter', css: '"Inter", system-ui, sans-serif', family: 'Inter', weights: '400;500;600;700;800' },
  { id: 'montserrat', label: 'Montserrat', css: '"Montserrat", system-ui, sans-serif', family: 'Montserrat', weights: '400;500;600;700;800' },
  { id: 'lato', label: 'Lato', css: '"Lato", system-ui, sans-serif', family: 'Lato', weights: '400;700;900' },
  { id: 'raleway', label: 'Raleway', css: '"Raleway", system-ui, sans-serif', family: 'Raleway', weights: '400;500;600;700;800' },
  { id: 'oswald', label: 'Oswald', css: '"Oswald", "Arial Narrow", sans-serif', family: 'Oswald', weights: '400;500;600;700' },
  { id: 'roboto-slab', label: 'Roboto Slab', css: '"Roboto Slab", Georgia, serif', family: 'Roboto Slab', weights: '400;500;600;700;800' },
  { id: 'merriweather', label: 'Merriweather', css: '"Merriweather", Georgia, serif', family: 'Merriweather', weights: '400;700;900' },
  { id: 'playfair', label: 'Playfair Display', css: '"Playfair Display", Georgia, serif', family: 'Playfair Display', weights: '400;500;600;700;800' },
  { id: 'source-serif', label: 'Source Serif', css: '"Source Serif 4", Georgia, serif', family: 'Source Serif 4', weights: '400;500;600;700;800' },
  { id: 'libre-baskerville', label: 'Libre Baskerville', css: '"Libre Baskerville", Georgia, serif', family: 'Libre Baskerville', weights: '400;700' },
];

export const FONTS: Record<string, string> = Object.fromEntries(FONT_LIST.map((f) => [f.id, f.css]));

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

/** Built-in text styles; more can be added in the Design tab. */
const BASE_STYLES: [string, string, string, number, string, Partial<TextStyle>?][] = [
  ['title', 'Title', 'montserrat', 72, '800'],
  ['subtitle', 'Subtitle', 'montserrat', 36, '500'],
  ['body', 'Body', 'sans', 24, '400', { color: '#1a1a1a' }],
  ['h1', 'Heading 1', 'montserrat', 44, '700'],
  ['h2', 'Heading 2', 'montserrat', 36, '700'],
  ['h3', 'Heading 3', 'montserrat', 30, '600'],
  ['h4', 'Heading 4', 'montserrat', 26, '600'],
  ['h5', 'Heading 5', 'montserrat', 24, '600', { upper: true }],
];
export const isBaseStyle = (id: string): boolean => BASE_STYLES.some((b) => b[0] === id);

const DESIGN_VERSION = 2;

export function defaultDesign(): Design {
  return {
    colors: {
      paper: { bg: '#ffffff', text: '' },
      tile: { bg: '#f1f3f5', text: '' },
      header: { bg: '#1f3a5f', text: '#ffffff' },
      footer: { bg: '#1f3a5f', text: '#ffffff' },
      tileHeader: { bg: '', text: '' },
      tileFooter: { bg: '', text: '' },
    },
    styles: BASE_STYLES.map(([id, name, font, size, weight, extra]) => ({
      id, name, font, size, weight, italic: false, upper: false, color: '', enabled: true, ...extra,
    })),
    recent: [],
    v: DESIGN_VERSION,
  };
}

export function newTextStyle(id: string): TextStyle {
  return { id, name: 'New style', font: 'montserrat', size: 32, weight: '700', italic: false, upper: false, color: '', enabled: true };
}

/** Fill in anything missing (older documents, new roles/styles). */
export function normalizeDesign(input: Partial<Design> | undefined): Design {
  const base = defaultDesign();
  const d = (input || {}) as Partial<Design>;
  const colors = Object.assign(base.colors, d.colors || {});
  // the first design version had a different style set
  const old = d.v === DESIGN_VERSION ? d.styles || [] : [];
  const have = new Map(old.map((s) => [s.id, s]));
  const styles = base.styles.map((s) => Object.assign(s, have.get(s.id) || {}))
    .concat(old.filter((s) => !isBaseStyle(s.id)));
  return { colors, styles, recent: d.recent || [], v: DESIGN_VERSION };
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
  const list: string[] = [];
  for (const c of Object.values(d.colors)) for (const v of [c.bg, c.text]) if (v) list.push(v.toLowerCase());
  list.push(...d.recent);
  return [...new Set(list)];
}
