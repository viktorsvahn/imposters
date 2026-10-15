/* The master poster: a specimen built from a poster's paper and design, with one of every kind of element —
   the poster's own banner and footer, poster tiles, a tile header and footer, tiles inside a tile, every text
   style, lists, a table, a figure and the palette. Its design is the poster's design itself (the same object),
   so changing it on the master poster changes the poster. */

import { headerHtml } from '../model/design';
import { DOC_VERSION } from '../model/document';
import { paletteById } from '../model/palettes';
import { makeTile } from '../model/tile';
import { walk } from '../model/tree';
import type { Doc, Tile } from '../model/types';
import { clone, escapeHtml } from '../util';
import { toggleBand } from './bands';
import { makeContainer } from './containers';

/** The kinds of element on the master poster; each has its settings. */
export type MasterKey = 'paper' | 'watermark' | 'banner' | 'footer' | 'tiles' | 'local' | 'tileHeader' | 'tileFooter'
  | 'fonts' | 'palette' | 'table' | `style:${string}`;

const LOREM = 'Body text: the running text of the poster, with <b>bold</b>, <i>italic</i>, x<sup>2</sup> and H<sub>2</sub>O.';

function figure(colors: string[]): string {
  const vals = [0.55, 0.8, 0.42, 0.95, 0.66, 0.3, 0.75];
  const bars = colors.slice(0, 7).map((c, i) => {
    const h = vals[i] * 100;
    return `<rect x="${18 + i * 40}" y="${118 - h}" width="28" height="${h}" fill="${c}" rx="2"/>`;
  }).join('');
  return `<svg data-el="palette" viewBox="0 0 300 126" width="100%" style="display:block">${bars}` +
    '<line x1="10" y1="118.5" x2="296" y2="118.5" stroke="#16202a" stroke-width="1.5"/></svg>';
}

/** A tile with a header (title and subtitle) above its text. */
function withHeader(doc: Doc, t: Tile, title: string, subtitle: string): void {
  makeContainer(doc, t, true);
  const band = toggleBand(doc, t, 'header', true)!;
  band.html = `<div data-ts="tileTitle">${title}</div><div data-ts="tileSubtitle">${subtitle}</div>`;
}

export function specimenDoc(src: Doc): Doc {
  const { paper, design } = src;
  const doc: Doc = { version: DOC_VERSION, paper, design, tiles: [] };
  const M = paper.margin, W = paper.w - 2 * M, G = paper.gutter, GY = paper.gutterY;

  // the poster's own banner and footer (or new ones)
  const banner = src.tiles.find((t) => t.role === 'header');
  const footer = src.tiles.find((t) => t.role === 'footer');
  const top = banner ? clone(banner) : makeTile(paper, 'text', {
    role: 'header', x: M, y: 0, w: W, h: Math.round(paper.h * 0.12), bleed: true, html: headerHtml('poster'),
    bg: '@header', color: '@header', align: 'center', vAlign: 'middle',
  });
  const bottom = footer ? clone(footer) : makeTile(paper, 'text', {
    role: 'footer', x: M, y: paper.h - 40, w: W, h: 40, bleed: true, bg: '@footer', color: '@footer', vAlign: 'middle',
  });
  if (!footer) bottom.html = '<div>Footer: funding, acknowledgements, contact</div>';
  doc.tiles.push(top, bottom);

  const y0 = top.y + top.h + GY, y1 = bottom.y - GY, H = y1 - y0, cw = (W - 2 * G) / 3;
  const col = (i: number) => M + i * (cw + G);
  const add = (props: Partial<Tile>) => { const t = makeTile(paper, 'text', props); doc.tiles.push(t); return t; };

  // column 1: a poster tile with a header; a figure with its caption
  const a = add({ x: col(0), y: y0, w: cw, h: H * 0.58,
    html: `<div data-ts="h1">Heading 1</div><div>${LOREM}</div><ul><li>A bulleted list</li><li>with a second item</li></ul>` +
      '<ol><li>A numbered list</li><li>with a second item</li></ol>' });
  withHeader(doc, a, 'Tile title', 'Tile subtitle: a poster tile with a header');
  const pal = paletteById(design.palette);
  add({ x: col(0), y: y0 + H * 0.58 + GY, w: cw, h: H * 0.42 - GY,
    html: `<div>${figure(pal.colors)}</div><div data-ts="caption"><b>Figure 1.</b> A caption in the Caption style. The bars use the palette (${escapeHtml(pal.name)}, Paul Tol).</div>` });

  // column 2: a tile divided into tiles, with a tile header and footer
  const c = add({ x: col(1), y: y0, w: cw, h: H, html: '<div>Tiles inside a tile</div>' }); // content becomes the inner area
  withHeader(doc, c, 'Tiles inside a tile', 'Their gaps, borders and headers are the local settings');
  toggleBand(doc, c, 'footer', true)!.html = '<div data-ts="caption">Tile footer</div>';
  const body = c.children!.find((k) => !k.role)!;
  const lg = design.localGutter, lgy = design.localGutterY, w2 = (body.w - lg) / 2, h2 = (body.h - lgy) / 2;
  const local = (i: number, html: string): Tile => makeTile(paper, 'text', {
    x: body.x + (i % 2) * (w2 + lg), y: body.y + Math.floor(i / 2) * (h2 + lgy), w: w2, h: h2, html,
  });
  c.children = c.children!.filter((k) => k !== body).concat([
    local(0, `<div data-ts="h2">Heading 2</div><div>Text in a tile inside a tile.</div>`),
    local(1, '<div data-ts="h3">Heading 3</div><div data-ts="h4">Heading 4</div><div data-ts="h5">Heading 5</div>'),
    local(2, '<table data-el="table"><thead><tr><th>Set</th><th class="num">Size</th><th class="num">Error</th></tr></thead>' +
      '<tbody><tr><td>Small</td><td class="num">8,016</td><td class="num">0.41</td></tr><tr><td>Medium</td><td class="num">42,824</td><td class="num">0.19</td></tr>' +
      '<tr><td>Large</td><td class="num">221,824</td><td class="num">0.31</td></tr></tbody></table>'),
    local(3, '<div data-ts="caption">Caption text: figure captions, notes and sources, in grey.</div>'),
  ]);

  // column 3: every other text style; the palette
  const styles = design.styles.filter((s) => (s.enabled || s.id === 'body') && !['title', 'subtitle', 'tileTitle', 'tileSubtitle'].includes(s.id));
  const d = add({ x: col(2), y: y0, w: cw, h: H * 0.62,
    html: styles.map((s) => `<div data-ts="${escapeHtml(s.id)}">${escapeHtml(s.name)}</div>`).join('') });
  withHeader(doc, d, 'Text styles', 'Click one to change it');
  add({ x: col(2), y: y0 + H * 0.62 + GY, w: cw, h: H * 0.38 - GY,
    html: `<div data-el="palette" style="display:flex;flex-wrap:wrap;gap:2mm">${pal.colors.map((k) =>
      `<span style="display:inline-block;width:12mm;height:12mm;border-radius:1mm;background:${k}"></span>`).join('')}</div>` +
      `<div data-ts="caption">Palette: ${escapeHtml(pal.name)} (Paul Tol)</div>` });

  // stable ids, so the master poster's elements are reused from one drawing to the next
  let n = 0;
  walk(doc.tiles, (t) => { t.id = 'master-' + n++; });
  return doc;
}

/** Which kind of element a tile of the master poster is. */
export function masterKeyOfTile(t: Tile, parent: Tile | null): MasterKey {
  if (!parent && t.role === 'header') return 'banner';
  if (!parent && t.role === 'footer') return 'footer';
  if (t.role === 'header') return 'tileHeader';
  if (t.role === 'footer') return 'tileFooter';
  return parent ? 'local' : 'tiles';
}
