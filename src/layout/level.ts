/* A level is where tiles are laid out: the paper, or the inside of a tile.
   All layout tools work on one level: its tiles and its frame (size, margin,
   gutter). */

import { findTile, innerGutter } from '../model/tree';
import type { Doc, Frame, Tile } from '../model/types';

export interface Level {
  /** The tile whose inside this is, or null for the paper. */
  container: Tile | null;
  tiles: Tile[];
  frame: Frame;
}

export function frameOf(doc: Doc, c: Tile | null): Frame {
  if (!c) return doc.paper;
  return { w: c.w, h: c.h, margin: c.inset || 0, gutter: innerGutter(doc, c, 'x'), gutterY: innerGutter(doc, c, 'y'), columns: 0 };
}

export function levelOf(doc: Doc, containerId: string | null): Level {
  const c = findTile(doc, containerId);
  return { container: c, tiles: c ? (c.children ||= []) : doc.tiles, frame: frameOf(doc, c) };
}

/** Replace the tile list of a level (delete / reorder). */
export function setLevelTiles(doc: Doc, level: Level, list: Tile[]): void {
  if (level.container) level.container.children = list;
  else doc.tiles = list;
  level.tiles = list;
}
