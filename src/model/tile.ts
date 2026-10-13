import { uid } from '../util';
import type { Paper, Tile, TileType } from './types';

/** A new tile with every field set (props override the defaults). */
export function makeTile(paper: Paper, type: TileType, props: Partial<Tile> = {}): Tile {
  const base = Math.max(9, Math.round(paper.w / 25));
  return Object.assign(
    {
      id: uid(), type, x: 0, y: 0, w: 100, h: 80,
      html: '', src: '', fit: 'cover',
      bg: '@tile', color: '', ts: '',
      font: '', fontSize: null, padding: type === 'image' ? 0 : Math.round(base / 3),
      radius: 0, borderW: 0, borderC: '#1a1a1a', borderSides: 'trbl', align: 'left', vAlign: 'top',
      cols: 1, inset: 0, gutter: null, bleed: false,
    } as Tile,
    props,
  );
}

/** What a plain tile's content consists of (moved into / out of a sub-tile). */
export const CONTENT_KEYS = [
  'type', 'html', 'src', 'fit', 'bg', 'color', 'font', 'fontSize', 'padding', 'align', 'vAlign',
  'cols', 'ts', 'bold', 'italic', 'underline', 'leading', 'ps',
] as const satisfies readonly (keyof Tile)[];

export const hasContent = (t: Tile): boolean =>
  !!(t.src || (t.html || '').replace(/<[^>]*>|&nbsp;/g, '').trim());

/** Copy the content fields from one tile to another. */
export function copyContent(from: Tile, to: Tile, skip: (keyof Tile)[] = []): void {
  const src = from as unknown as Record<string, unknown>, dst = to as unknown as Record<string, unknown>;
  for (const k of CONTENT_KEYS) if (!skip.includes(k)) dst[k] = src[k];
}
