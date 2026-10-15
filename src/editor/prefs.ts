/* View preferences (per browser, not part of the document). */

import { STORAGE } from '../constants';

export interface Prefs {
  /** mark text that doesn't fit its tile */
  overflow: boolean;
  /** spell check while typing */
  spell: boolean;
  /** show the settings panel */
  panel: boolean;
  /** the open sidebar tab ('' = folded away) */
  side: string;
  /** the live view (the poster as published) is shown, and its width (px) */
  live: boolean;
  liveWidth: number;
}

const DEFAULTS: Prefs = { overflow: false, spell: false, panel: false, side: 'posters', live: false, liveWidth: 560 };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE.prefs) ?? localStorage.getItem(STORAGE.legacyPrefs);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(change: Partial<Prefs>): void {
  try {
    localStorage.setItem(STORAGE.prefs, JSON.stringify({ ...loadPrefs(), ...change }));
  } catch {
    /* storage unavailable: preferences just won't persist */
  }
}
