/* The design as CSS (text styles), web fonts, and the colour swatch list
   offered by every colour input. */

import { editor } from '../editor/store';
import { fontCss, FONTS, styleById, swatchColors } from '../model/design';
import { ensureWebFonts } from './fonts';
import type { TextStyle } from '../model/types';
import { $ } from './dom';

function styleDecl(s: TextStyle): string {
  return `font-family:${fontCss(s.font) || FONTS.heros};font-size:${s.size}pt;font-weight:${s.weight};` +
    `font-style:${s.italic ? 'italic' : 'normal'};text-transform:${s.upper ? 'uppercase' : 'none'};` +
    (s.color ? `color:${s.color};` : '') + (s.tracking ? `letter-spacing:${s.tracking}em;` : '');
}

/** Text styles apply to tiles (data-ts on the content), paragraphs inside
    them, and previews in the UI (.fmt). Body styles the paper itself. */
export function designCSS(): string {
  const d = editor.doc.design, body = styleById(d, 'body')!;
  let css = `.paper{${styleDecl(body)}--tbl-rule:${d.table.rule}pt;--tbl-line:${d.table.line};}\n`;
  for (const s of d.styles) {
    css += `.tile>.content[data-ts="${s.id}"],.tile>.content [data-ts="${s.id}"],.fmt [data-ts="${s.id}"]{${styleDecl(s)}}\n`;
  }
  // tile headers: the subtitle on the same line as the title
  if (d.tileSubtitle === 'beside') {
    css += '.tile>.content>[data-ts="tileTitle"],.tile>.content>[data-ts="tileSubtitle"]{display:inline;margin:0}\n' +
      '.tile>.content>[data-ts="tileTitle"]{margin-right:.6em}\n';
  }
  return css;
}

let designKey = '';
export function applyDesignCSS(): void {
  updateSwatches();
  const key = JSON.stringify(editor.doc.design);
  if (key === designKey) return;
  designKey = key;
  ensureWebFonts();
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

/** Web fonts older posters use come from the internet; call `onReady` once the fonts have arrived (text
    metrics change). The included fonts are part of the app. */
export function loadFonts(onReady: () => void): void {
  ensureWebFonts();
  document.fonts?.ready.then(onReady);
}
