/* The font library: the fonts that come with the app, the fonts installed on the computer (Chromium's Local
   Font Access), and web fonts that older posters still use. */

import { editor } from '../editor/store';
import { FONT_LIST, fontLabel, isLocalFont, LOCAL_FONT } from '../model/design';
import { walk } from '../model/tree';
import type { Doc } from '../model/types';
import { escapeHtml } from '../util';

let families: string[] = [];
let loading: Promise<void> | null = null;
const listeners: (() => void)[] = [];

/** Families of the fonts installed on this computer (empty until loaded, or where the browser can't tell). */
export const localFamilies = (): readonly string[] => families;

/** Ask the computer for its fonts (once); `onChange` runs when the list arrives. */
export function loadLocalFonts(onChange?: () => void): Promise<void> {
  if (onChange) listeners.push(onChange);
  loading ??= (async () => {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
    if (!query) return;
    try {
      const fonts = await query();
      families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
    } catch {
      families = []; // not allowed: the included and generic fonts remain
    }
    for (const fn of listeners) fn();
  })();
  return loading;
}

/** Font ids a document uses: its text styles and tiles' own fonts. */
export function usedFonts(doc: Doc): Set<string> {
  const out = new Set(doc.design.styles.map((s) => s.font));
  walk(doc.tiles, (t) => { if (t.font) out.add(t.font); });
  return out;
}

const opt = (id: string, label: string) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
const group = (label: string, items: string[]) => (items.length ? `<optgroup label="${label}">${items.join('')}</optgroup>` : '');

/** The options of a font picker, grouped: included, on this computer, and fonts the poster uses that are
    neither (older web fonts, or installed fonts missing on this computer). */
export function fontOptions(withDefault: boolean): string {
  const used = usedFonts(editor.doc), have = new Set(families);
  const missing = [...used].filter((id) => isLocalFont(id) && !have.has(id.slice(LOCAL_FONT.length)));
  return (withDefault ? '<option value="">Default font</option>' : '') +
    group('Included: works everywhere', FONT_LIST.filter((f) => f.group === 'included').map((f) => opt(f.id, f.label))) +
    group('On this computer', [
      ...FONT_LIST.filter((f) => f.group === 'computer').map((f) => opt(f.id, f.label)),
      ...families.map((f) => opt(LOCAL_FONT + f, f)),
    ]) +
    group('Web fonts (older posters)', FONT_LIST.filter((f) => f.group === 'web' && used.has(f.id)).map((f) => opt(f.id, f.label))) +
    group('Not on this computer', missing.map((id) => opt(id, fontLabel(id) + ' (missing)')));
}

/** Load the web fonts the poster uses (older posters), once each. */
export function ensureWebFonts(): void {
  const used = usedFonts(editor.doc);
  for (const f of FONT_LIST) {
    if (f.group !== 'web' || !f.family || !used.has(f.id) || document.getElementById('font-' + f.id)) continue;
    const link = document.createElement('link');
    link.id = 'font-' + f.id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights}&display=swap`;
    document.head.appendChild(link);
  }
}

/** The included fonts' @font-face rules for the families a page uses (`text`: its styles and markup). */
export function fontFaceRules(text: string): string {
  const out: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const fam = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (fam && text.includes(fam)) out.push(r.cssText);
    }
  }
  return out.join('\n');
}

/** Rebuild the toolbar's and tile panel's font pickers (new fonts found, another poster opened). */
export function refreshFontPickers(): void {
  for (const sel of document.querySelectorAll<HTMLSelectElement>('select[data-font-picker]')) {
    const v = sel.value;
    sel.innerHTML = fontOptions(true);
    sel.value = v;
  }
}
