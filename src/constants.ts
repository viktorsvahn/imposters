/** CSS pixels per millimetre. All geometry is stored in mm. */
export const PX = 96 / 25.4;
/** Smallest tile edge (mm). */
export const MIN = 5;
/** Geometric tolerance (mm). */
export const EPS = 0.01;

/** Paper sizes in mm (portrait). */
export const SIZES: Record<string, [number, number]> = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297],
  Letter: [215.9, 279.4], Tabloid: [279.4, 431.8], Slide: [254, 142.9],
};

export const HANDLES = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const;
export type Handle = (typeof HANDLES)[number];

/** localStorage keys (legacy keys are read once for migration). */
export const STORAGE = {
  doc: 'imposters:doc',
  prefs: 'imposters:prefs',
  legacyDoc: 'tiles-editor-doc',
  legacyPrefs: 'tiles-prefs',
} as const;
