/* Axis helpers: lets one piece of code handle horizontal and vertical cases.
   A cut/seam "along x" sits at an x position (a vertical line). */

import { EPS } from '../constants';

export type Axis = 'x' | 'y';

export interface AxisKeys {
  /** position along the axis */
  p: 'x' | 'y';
  /** length along the axis */
  l: 'w' | 'h';
  /** cross-axis position */
  cp: 'x' | 'y';
  /** cross-axis length */
  cl: 'w' | 'h';
  size: 'w' | 'h';
}

export const AX: Record<Axis, AxisKeys> = {
  x: { p: 'x', l: 'w', cp: 'y', cl: 'h', size: 'w' },
  y: { p: 'y', l: 'h', cp: 'x', cl: 'w', size: 'h' },
};

export const otherAxis = (ax: Axis): Axis => (ax === 'x' ? 'y' : 'x');

/** Open-interval overlap (touching does not count). */
export const overlaps = (a1: number, a2: number, b1: number, b2: number): boolean => a1 < b2 - EPS && b1 < a2 - EPS;

/** Snap edge kinds: s = start (left/top), e = end, c = centre. */
export type EdgeKind = 's' | 'e' | 'c';
export type Edges = Partial<Record<EdgeKind, number>>;

export const edgesOf = (pos: number, len: number): Edges => ({ s: pos, e: pos + len, c: pos + len / 2 });
