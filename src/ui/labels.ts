import { firstLeaf } from '../model/tree';
import type { Tile } from '../model/types';

/** A short name for a tile (its first text), for breadcrumbs and titles. */
export function tileLabel(t: Tile): string {
  const div = document.createElement('div');
  div.innerHTML = firstLeaf(t).html || '';
  const s = [...div.childNodes].map((n) => n.textContent!.trim()).filter(Boolean).join(' · ');
  return s ? (s.length > 18 ? s.slice(0, 17) + '…' : s) : 'Section';
}
