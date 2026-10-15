/* The editor's state: the document being edited plus the view state (what is
   selected, which level you are working on, zoom, the current drag …).
   Selectors give the commonly needed derived values. */

import type { Handle } from '../constants';
import type { CutPlan } from '../layout/cuts';
import { levelOf, type Level } from '../layout/level';
import type { Seam } from '../layout/seams';
import { newDocument } from '../model/document';
import { findTile, originOf } from '../model/tree';
import type { Doc, Point, Rect, Tile } from '../model/types';

/** What a click / drag at the pointer would do (shown as an overlay). */
export type Hover =
  | { type: 'cut'; plan: CutPlan }
  | { type: 'free'; rect: Rect }
  | { type: 'seam'; seam: Seam };

export interface PointerInfo {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

interface DragBase {
  start: Point;
  moved?: boolean;
}

/** An ongoing pointer gesture on the paper. */
export type Drag =
  | (DragBase & { mode: 'cut'; plan: CutPlan })
  | (DragBase & { mode: 'free'; rect: Rect })
  | (DragBase & {
      mode: 'seam'; seam: Seam; origs: Map<string, { p: number; l: number }>; minDelta: number; maxDelta: number;
      /** every tile of the level as it was (Ctrl+Alt opens space, also between all of them) */
      level: Map<string, { p: number; l: number }>;
      /** the seam moved last (it springs back within minDelta…maxDelta on release) */
      delta?: number;
    })
  | (DragBase & {
      mode: 'resize'; handle: Handle; id: string; orig: Rect;
      /** tiles under a header that follow its bottom edge (their own bottom stays), and their minimum heights */
      below?: Map<string, { y: number; h: number; min: number }>;
      /** the smallest size the tile's content allows */
      min: { w: number; h: number };
    })
  | (DragBase & {
      mode: 'move'; origs: Map<string, { x: number; y: number }>; bbox: Rect; clickedId: string;
      shift: boolean; at: { clientX: number; clientY: number }; deepId: string;
    })
  | (DragBase & { mode: 'draw'; rect?: Rect });

export interface ViewState {
  zoom: number;
  /** equal parts for Ctrl+Shift cuts and the Split buttons */
  parts: number;
  /** the tile you are inside (null = the paper) */
  scope: string | null;
  selected: Set<string>;
  /** the tile being typed in */
  editing: string | null;
  snap: boolean;
  showOverflow: boolean;
  spell: boolean;
  drag: Drag | null;
  hover: Hover | null;
  lastPointer: PointerInfo | null;
  /** tile that receives the next picked image (null = new tile) */
  imageTarget: string | null;
}

export const editor: { doc: Doc; view: ViewState } = {
  doc: newDocument(),
  view: {
    zoom: 1, parts: 2, scope: null, selected: new Set(), editing: null,
    snap: true, showOverflow: false, spell: false,
    drag: null, hover: null, lastPointer: null, imageTarget: null,
  },
};

/* ---- selectors ---- */

export const tileById = (id: string | null | undefined): Tile | null => findTile(editor.doc, id);

/** The tile you are inside (null on the paper). */
export const scopeTile = (): Tile | null => findTile(editor.doc, editor.view.scope);

/** The level being edited: its tiles and frame. */
export const level = (): Level => levelOf(editor.doc, editor.view.scope);

export const selectedTiles = (): Tile[] => level().tiles.filter((t) => editor.view.selected.has(t.id));

/** Paper position of the current level's origin. */
export const scopeOrigin = (): Point => originOf(editor.doc, scopeTile());

export const select = (...ids: string[]): void => { editor.view.selected = new Set(ids); };
