/* The design as CSS (text styles), web fonts, and the colour swatch list
   offered by every colour input. */

import { editor } from '../editor/store';
import { FONT_LIST, FONTS, styleById, swatchColors } from '../model/design';
import type { TextStyle } from '../model/types';
import { $ } from './dom';

function styleDecl(s: TextStyle): string {
  return `font-family:${FONTS[s.font] || FONTS.sans};font-size:${s.size}pt;font-weight:${s.weight};` +
    `font-style:${s.italic ? 'italic' : 'normal'};text-transform:${s.upper ? 'uppercase' : 'none'};` +
    (s.color ? `color:${s.color};` : '');
}

/** Text styles apply to tiles (data-ts on the content), paragraphs inside
    them, and previews in the UI (.fmt). Body styles the paper itself. */
export function designCSS(): string {
  const d = editor.doc.design, body = styleById(d, 'body')!;
  let css = `.paper{${styleDecl(body)}}\n`;
  for (const s of d.styles) {
    css += `.tile>.content[data-ts="${s.id}"],.tile>.content [data-ts="${s.id}"],.fmt [data-ts="${s.id}"]{${styleDecl(s)}}\n`;
  }
  return css;
}

let designKey = '';
export function applyDesignCSS(): void {
  updateSwatches();
  const key = JSON.stringify(editor.doc.design);
  if (key === designKey) return;
  designKey = key;
  $('#designStyle').textContent = designCSS();
}

let swatchKey = '';
export function updateSwatches(): void {
  const list = swatchColors(editor.doc.design), key = list.join();
  if (key === swatchKey) return;
  swatchKey = key;
  $('#swatches').innerHTML = list.map((c) => `<option value="${c}"></option>`).join('');
}

/** Every colour input offers the swatches (via the shared <datalist>). */
export function attachSwatches(root: ParentNode = document): void {
  for (const el of root.querySelectorAll('input[type=color]:not([list])')) el.setAttribute('list', 'swatches');
}

/** Load the Google Fonts of the catalogue; call `onReady` once they arrive
    (text metrics change). Offline, system fallbacks are used. */
export function loadFonts(onReady: () => void): void {
  for (const f of FONT_LIST) {
    if (!f.family || document.getElementById('font-' + f.id)) continue;
    const link = document.createElement('link');
    link.id = 'font-' + f.id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights}&display=swap`;
    document.head.appendChild(link);
  }
  document.fonts?.ready.then(onReady);
}
