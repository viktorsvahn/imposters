/* The poster as a web page: one self-contained HTML file — the paper as drawn
   in the editor (without the editing furniture), the styles it uses, its web
   fonts, images, plots inline (hover shows their data) and a small script that
   fits the paper to the window and shows the plots' hover text. Printing the
   page gives the paper at its true size. */

import { PX } from '../constants';
import { editor } from '../editor/store';
import { desktop } from '../project/backend';
import { escapeHtml } from '../util';
import { designCSS } from './design-css';
import { fontFaceRules } from './fonts';
import { dom } from './dom';

/** Classes the editor puts on tiles that the published page must not have. */
const EDITOR_CLASSES = ['live', 'selected', 'single', 'editing', 'overflow', 'scope', 'nofill'];

/** The paper as published: a copy without overlays, handles, selection and editing state. */
export function posterMarkup(): string {
  const paper = dom.paper.cloneNode(true) as HTMLElement;
  paper.querySelector('#scopeLayer')?.remove();
  paper.removeAttribute('id');
  paper.className = 'paper';
  paper.removeAttribute('style');
  paper.querySelectorAll('.handle').forEach((h) => h.remove());
  paper.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
  paper.querySelectorAll('[spellcheck]').forEach((e) => e.removeAttribute('spellcheck'));
  paper.querySelectorAll('.tile').forEach((t) => t.classList.remove(...EDITOR_CLASSES));
  paper.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  const { w, h } = editor.doc.paper;
  paper.style.width = w + 'mm';
  paper.style.height = h + 'mm';
  paper.style.background = getComputedStyle(dom.paper).background;
  return paper.outerHTML;
}

/** The app's style rules that draw tiles and plots (not the editor around them). */
function posterRules(): string {
  const keep = /\.tile|\.paper|\.plot-svg|data-ts|\.kids|\.bleed|\.content/;
  const skip = /#scopeLayer|\.guide|\.scoped|\.live|\.selected|\.editing|\.handle|\.overflow|\.nofill|\.fmt|\.card|\.pe-|#tiles|\.draft|\.seam|\.grid/;
  const out: string[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // a font sheet from another site
    for (const r of rules) {
      if (r instanceof CSSStyleRule && keep.test(r.selectorText) && !skip.test(r.selectorText)) out.push(r.cssText);
    }
  }
  return out.join('\n');
}

const fontLinks = (): string =>
  [...document.querySelectorAll<HTMLLinkElement>('link[id^="font-"]')].map((l) => `<link rel="stylesheet" href="${escapeHtml(l.href)}">`).join('\n');

/** Shown around the poster, and how it prints. */
function pageCss(): string {
  const { w, h } = editor.doc.paper;
  return `
html, body { margin: 0; background: #e9ebef; }
body { font-family: system-ui, sans-serif; }
.sizer { position: relative; margin: 16px auto; }
.paper { position: absolute; left: 0; top: 0; transform-origin: 0 0; box-shadow: 0 2px 14px rgba(0,0,0,.18); overflow: hidden; }
.tile > .content:empty::before { content: none; }
.tile .placeholder { visibility: hidden; }
.plot-svg [aria-label]:hover { filter: brightness(1.12) drop-shadow(0 0 2px rgba(0,0,0,.35)); }
.plot-tip { position: fixed; z-index: 10; pointer-events: none; max-width: 320px; padding: 6px 9px; border-radius: 6px;
  background: rgba(29,33,40,.94); color: #fff; font: 12px/1.45 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
.plot-tip span { color: #aab4c3; }
@page { size: ${w}mm ${h}mm; margin: 0; }
@media print {
  html, body { background: none; }
  .sizer { margin: 0; width: auto !important; height: auto !important; }
  .paper { position: relative; transform: none !important; box-shadow: none; }
  .plot-tip { display: none; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
}

/** The page's script: fit the paper to the window; hover text for plot marks. */
const VIEWER = `
(function () {
  var W = __W__, H = __H__;
  function fit() {
    var paper = document.querySelector('.paper'), sizer = document.querySelector('.sizer');
    if (!paper) return;
    var k = Math.max(0.05, (document.documentElement.clientWidth - 32) / W);
    paper.style.transform = 'scale(' + k + ')';
    sizer.style.width = W * k + 'px';
    sizer.style.height = H * k + 'px';
  }
  window.imposterFit = fit;
  window.addEventListener('resize', fit);
  fit();
  var tip = document.querySelector('.plot-tip');
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  document.addEventListener('pointermove', function (e) {
    var mark = e.target.closest && e.target.closest('.plot-svg [aria-label]');
    if (!mark) { tip.hidden = true; return; }
    tip.innerHTML = mark.getAttribute('aria-label').split('\\n').map(function (line) {
      var i = line.indexOf(': ');
      return i < 0 ? '<div>' + esc(line) + '</div>' : '<div><span>' + esc(line.slice(0, i)) + '</span> ' + esc(line.slice(i + 2)) + '</div>';
    }).join('');
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = (e.clientX + 14 + w > innerWidth ? e.clientX - 14 - w : e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 14 + h > innerHeight ? e.clientY - 14 - h : e.clientY + 14) + 'px';
  });
})();`;

/** The <head> styles of the page; when they change, the live view loads the page anew. */
export function pageHead(title: string): string {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)}</title>\n${fontLinks()}\n<style>\n${fontFaceRules(designCSS() + JSON.stringify(editor.doc.tiles))}\n${posterRules()}\n${designCSS()}\n${pageCss()}\n</style>`;
}

/** The whole page. With `embed`, images are put inside the file, so it works anywhere on its own. */
export async function publishHtml(title: string, embed: boolean): Promise<string> {
  let paper = posterMarkup();
  if (embed) paper = await embedImages(paper);
  const { w, h } = editor.doc.paper;
  const script = VIEWER.replace('__W__', String(w * PX)).replace('__H__', String(h * PX));
  return `<!doctype html>\n<html lang="en">\n<head>\n${pageHead(title)}\n</head>\n<body>\n` +
    `<div class="sizer">${paper}</div>\n<div class="plot-tip" hidden></div>\n<script>${script}</script>\n</body>\n</html>\n`;
}

/** Replace links to project files with the images themselves (data URLs). */
async function embedImages(html: string): Promise<string> {
  const prefix = 'project://local/';
  const srcs = [...new Set([...html.matchAll(/<img[^>]* src="([^"]+)"/g)].map((m) => m[1]).filter((s) => s.startsWith(prefix)))];
  for (const src of srcs) {
    const rel = src.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
    const data = await desktop?.readDataUrl(rel);
    if (data) html = html.split(`src="${src}"`).join(`src="${data}"`);
  }
  return html;
}
