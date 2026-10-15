import { defaultDesign, headerHtml, normalizeDesign } from './design';
import { makeTile } from './tile';
import type { Doc, Tile } from './types';

export const DOC_VERSION = 1;

/** A new poster: A1 portrait with a header (title) and footer that bleed. */
export function newDocument(): Doc {
  const paper = { size: 'A1', orientation: 'portrait' as const, w: 594, h: 841, margin: 37, gutter: 24, gutterY: 10, columns: 0, bg: '@paper' };
  const doc: Doc = { version: DOC_VERSION, paper, tiles: [], design: defaultDesign() };
  doc.tiles.push(makeTile(paper, 'text', {
    role: 'header', x: paper.margin, y: 0, w: paper.w - 2 * paper.margin, h: 120, bleed: true,
    html: headerHtml('poster'),
    bg: '@header', color: '@header', align: 'center', vAlign: 'middle',
  }));
  doc.tiles.push(makeTile(paper, 'text', {
    role: 'footer', x: paper.margin, y: paper.h - 40, w: paper.w - 2 * paper.margin, h: 40, bleed: true,
    html: '', bg: '@footer', color: '@footer', vAlign: 'middle',
  }));
  return doc;
}

/** Validate and complete a saved document (older files get missing fields). */
export function loadDocument(raw: unknown): Doc {
  const d = raw as Partial<Doc> | null;
  if (!d || !d.paper || !Array.isArray(d.tiles)) throw new Error('Not an Imposters document');
  // the padding tiles used to get automatically: now the design's space around text
  const oldPad = Math.round(Math.max(9, Math.round(d.paper.w / 25)) / 3);
  // one gutter became across and down
  d.paper.gutterY ??= d.paper.gutter;
  const fix = (t: Tile): Tile => {
    const n = makeTile(d.paper!, t.type || 'text', t);
    if (!('gutterY' in t)) n.gutterY = n.gutter;
    // one padding for all sides became left/right and top/bottom
    const old = (t as Tile & { padding?: number }).padding;
    if (!('padX' in t) && old !== undefined) {
      n.padX = n.padY = n.type === 'text' && old === oldPad ? null : old; // the automatic padding: the design's now
    }
    delete (n as Tile & { padding?: number }).padding;
    if (n.ownBorder === undefined && (n.borderW > 0 || n.radius > 0)) n.ownBorder = true;
    if (n.children) n.children = n.children.map(fix);
    return n;
  };
  return {
    version: d.version ?? DOC_VERSION,
    paper: d.paper,
    tiles: d.tiles.map(fix),
    design: normalizeDesign(d.design),
  };
}
