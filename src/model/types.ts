/* The document model. Everything here is plain JSON (saved as-is). */

export type TileType = 'text' | 'image';
export type BandRole = 'header' | 'footer';
export type HAlign = 'left' | 'center' | 'right' | 'justify';
export type VAlign = 'top' | 'middle' | 'bottom';

/**
 * A rectangular tile. Positions are mm, relative to the parent tile (or the
 * paper). A tile with `children` is a container ("divided tile"): its own
 * content is hidden and its children are laid out inside its inner margin.
 *
 * Colour fields hold "#rrggbb", "" (none / automatic) or "@role" — a link
 * to a design colour role (see Design.colors).
 */
export interface Tile {
  id: string;
  type: TileType;
  x: number;
  y: number;
  w: number;
  h: number;

  // content
  html: string;
  src: string;
  fit: 'cover' | 'contain';

  // look
  bg: string;
  color: string;
  ts: string; // text style id ('' = body)
  font: string; // font override id ('' = from text style)
  fontSize: number | null; // pt override
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  leading?: number | null; // line height factor
  ps?: number | null; // space after paragraphs (em)
  padding: number;
  radius: number;
  borderW: number;
  borderC: string;
  borderSides: string; // subset of "trbl"
  align: HAlign;
  vAlign: VAlign;
  cols: number; // text columns

  // container / layout
  inset: number | null; // inner margin (mm)
  gutter: number | null; // inner gutter (mm), null = paper gutter
  bleed: boolean; // background runs past the margin to the edge
  role?: BandRole; // header/footer of its container
  inBand?: BandRole; // a piece of a cut header/footer (legacy)
  innerBg?: string; // fill given to tiles created inside (see makeContainer)
  children?: Tile[];

  // layout cache: the frame the children were last laid out for (see reflow)
  lw?: number | null;
  lh?: number;
  li?: number;
  lg?: number;
}

export interface Paper {
  size: string;
  orientation: 'portrait' | 'landscape';
  w: number;
  h: number;
  margin: number;
  gutter: number;
  columns: number;
  bg: string;
}

export type ColorRoleId = 'paper' | 'tile' | 'header' | 'footer' | 'tileHeader' | 'tileFooter';

export interface ColorRole {
  bg: string;
  text: string;
}

export interface TextStyle {
  id: string;
  name: string;
  font: string;
  size: number;
  weight: string;
  italic: boolean;
  upper: boolean;
  color: string;
  enabled: boolean;
}

export interface Design {
  colors: Record<ColorRoleId, ColorRole>;
  styles: TextStyle[];
  recent: string[]; // colour history, newest first
  v: number;
}

export interface Doc {
  version: number;
  paper: Paper;
  tiles: Tile[];
  design: Design;
}

/* ---- geometry helpers shared by layout code ---- */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The layout frame of a level: its size, margin, gutter and column grid. */
export interface Frame {
  w: number;
  h: number;
  margin: number;
  gutter: number;
  columns: number;
}
