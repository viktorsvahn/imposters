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
  /** space around the text (mm): left/right and top/bottom; null: the design's for this kind of tile */
  padX: number | null;
  padY: number | null;
  radius: number;
  borderW: number;
  borderC: string;
  borderSides: string; // subset of "trbl"
  /** the border (and corners) above are this tile's own; otherwise it has the design's border for its kind */
  ownBorder?: boolean;
  align: HAlign;
  vAlign: VAlign;
  cols: number; // text columns
  /** split long words at line ends (with a hyphen) */
  hyphens?: boolean;
  /** with text columns: lists run down each column (default) or across, row by row */
  flow?: 'down' | 'across';
  /** an image behind the text (a project image), how it fills the tile, and how strongly it shows (0–1) */
  bgImage?: string;
  bgImageFit?: 'cover' | 'contain';
  bgImageOpacity?: number;

  // container / layout
  inset: number | null; // inner margin (mm)
  gutter: number | null; // inner gutter across, between side-by-side tiles (mm); null = the design's
  gutterY?: number | null; // inner gutter down, between stacked tiles (mm); null = the design's
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
  lgy?: number;
}

export interface Paper {
  size: string;
  orientation: 'portrait' | 'landscape';
  w: number;
  h: number;
  margin: number;
  /** gap between side-by-side tiles (mm) */
  gutter: number;
  /** gap between tiles above each other (mm) */
  gutterY: number;
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
  /** letter spacing (em; 0 = normal, negative = tighter) */
  tracking?: number;
}

/** The kinds of tile the design gives a border: the poster's own tiles ("global"), tiles inside tiles
    ("local"), and the headers and footers of the poster and of tiles. */
export type BorderKind = 'global' | 'local' | 'header' | 'footer' | 'tileHeader' | 'tileFooter';

export interface Border {
  /** width (mm; 0 = none) */
  w: number;
  /** colour: #hex or @role */
  c: string;
  /** subset of "trbl" */
  sides: string;
  /** corner radius (mm) */
  radius: number;
}

export interface Space {
  x: number;
  y: number;
}

/** Things every poster with this design shows: a watermark behind everything, the banner's logo, the footer's logos. */
export interface Brand {
  /** a project image behind the whole poster (under all tiles), e.g. a pattern or a seal */
  watermark: { src: string; opacity: number; fit: 'cover' | 'contain' } | null;
  /** a logo in the poster's banner, on one side, h mm tall */
  logo: { src: string; side: 'left' | 'right'; h: number } | null;
  /** logos along the poster's footer, h mm tall */
  footerLogos: { srcs: string[]; h: number; align: 'spread' | 'left' | 'center' | 'right' };
}

/** How tables in text look: the heavy rules (under the header, at the end; pt) and the light lines between rows. */
export interface TableLook {
  rule: number;
  line: string;
}

export interface Design {
  brand: Brand;
  table: TableLook;
  /** the poster's colour scheme (a Paul Tol palette id, see model/palettes): offered for colours and plots */
  palette: string;
  /** borders by kind of tile */
  borders: Record<BorderKind, Border>;
  colors: Record<ColorRoleId, ColorRole>;
  styles: TextStyle[];
  /** space between tiles inside a tile (mm): across (side by side) and down (above each other); between the
      poster's own tiles it is paper.gutter / gutterY */
  localGutter: number;
  localGutterY: number;
  /** space around the text (mm) in tiles, and in headers and footers — left/right (x) and top/bottom (y) —
      unless a tile has its own */
  space: { text: Space; header: Space };
  /** in tile headers, the subtitle goes below the title (two rows) or beside it (one line) */
  tileSubtitle: 'below' | 'beside';
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
  /** gap between side-by-side tiles, and between tiles above each other */
  gutter: number;
  gutterY: number;
  columns: number;
}
