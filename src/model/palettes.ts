/* Paul Tol's colour schemes (P. Tol, "Colour Schemes", SRON/EPS/TN/09-002, https://personal.sron.nl/~pault/):
   distinct for colour-blind readers, printable in greyscale where noted, and a common choice in research.
   Qualitative schemes colour categories (groups in plots, design colours); sequential and diverging ones are
   for colour scales. The last colour of some qualitative schemes is grey ("bad data"). */

export type PaletteKind = 'qualitative' | 'sequential' | 'diverging';

export interface Palette {
  id: string;
  name: string;
  kind: PaletteKind;
  colors: string[];
  note?: string;
}

export const PALETTES: Palette[] = [
  { id: 'bright', name: 'Bright', kind: 'qualitative', colors: ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB'], note: 'the default; distinct for colour-blind readers' },
  { id: 'high-contrast', name: 'High contrast', kind: 'qualitative', colors: ['#004488', '#DDAA33', '#BB5566'], note: 'also works in greyscale' },
  { id: 'vibrant', name: 'Vibrant', kind: 'qualitative', colors: ['#EE7733', '#0077BB', '#33BBEE', '#EE3377', '#CC3311', '#009988', '#BBBBBB'] },
  { id: 'muted', name: 'Muted', kind: 'qualitative', colors: ['#CC6677', '#332288', '#DDCC77', '#117733', '#88CCEE', '#882255', '#44AA99', '#999933', '#AA4499', '#DDDDDD'], note: 'many groups' },
  { id: 'medium-contrast', name: 'Medium contrast', kind: 'qualitative', colors: ['#6699CC', '#004488', '#EECC66', '#994455', '#997700', '#EE99AA'], note: 'pairs; also works in greyscale' },
  { id: 'light', name: 'Light', kind: 'qualitative', colors: ['#77AADD', '#EE8866', '#EEDD88', '#FFAABB', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#DDDDDD'], note: 'backgrounds with text on them' },
  { id: 'pale', name: 'Pale', kind: 'qualitative', colors: ['#BBCCEE', '#CCEEFF', '#CCDDAA', '#EEEEBB', '#FFCCCC', '#DDDDDD'], note: 'fills behind black text' },
  { id: 'dark', name: 'Dark', kind: 'qualitative', colors: ['#222255', '#225555', '#225522', '#666633', '#663333', '#555555'], note: 'backgrounds with white text' },
  { id: 'sunset', name: 'Sunset', kind: 'diverging', colors: ['#364B9A', '#4A7BB7', '#6EA6CD', '#98CAE1', '#C2E4EF', '#EAECCC', '#FEDA8B', '#FDB366', '#F67E4B', '#DD3D2D', '#A50026'] },
  { id: 'burd', name: 'Blue–red', kind: 'diverging', colors: ['#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B'] },
  { id: 'prgn', name: 'Purple–green', kind: 'diverging', colors: ['#762A83', '#9970AB', '#C2A5CF', '#E7D4E8', '#F7F7F7', '#D9F0D3', '#ACD39E', '#5AAE61', '#1B7837'] },
  { id: 'ylorbr', name: 'Yellow–orange–brown', kind: 'sequential', colors: ['#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'] },
  { id: 'iridescent', name: 'Iridescent', kind: 'sequential', colors: ['#FEFBE9', '#FCF7D5', '#F5F3C1', '#EAF0B5', '#DDECBF', '#D0E7CA', '#C2E3D2', '#B5DDD8', '#A8D8DC', '#9BD2E1', '#8DCBE4', '#81C4E7', '#7BBCE7', '#7EB2E4', '#88A5DD', '#9398D2', '#9B8AC4', '#9D7DB2', '#9A709E', '#906388', '#805770', '#684957', '#46353A'] },
  { id: 'rainbow', name: 'Discrete rainbow', kind: 'sequential', colors: ['#D1BBD7', '#AE76A3', '#882E72', '#1965B0', '#5289C7', '#7BAFDE', '#4EB265', '#90C987', '#CAE0AB', '#F7F056', '#F6C141', '#F1932D', '#E8601C', '#DC050C'] },
];

export const DEFAULT_PALETTE = 'bright';

export const paletteById = (id: string | undefined): Palette =>
  PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE)!;

/** The qualitative scheme whose colours a list starts with (null: none — the colours were picked by hand). */
export function paletteOfColors(colors: string[]): Palette | null {
  const up = colors.map((c) => c.toUpperCase());
  return PALETTES.find((p) => p.kind === 'qualitative' && p.colors.every((c, i) => up[i] === c) && up.length === p.colors.length) ?? null;
}
