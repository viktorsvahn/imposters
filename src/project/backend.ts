/* Where project files are kept. In the desktop app: the project folder, through
   the preload API. In a plain browser (dev server, browser tests): one built-in
   project kept in localStorage, with images inlined as data URLs. */

import type { DesktopApi } from '../../electron/api';
import { isExternalSrc } from '../model/project';

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}

export interface ProjectFiles {
  read(rel: string): Promise<string | null>;
  write(rel: string, data: string | Uint8Array): Promise<void>;
  /** Write before returning (the last save while the page closes). */
  writeSync(rel: string, data: string): void;
  exists(rel: string): Promise<boolean>;
  /** File names in a folder (none if it doesn't exist). */
  list(rel: string): Promise<string[]>;
  remove(rel: string): Promise<void>;
}

export const desktop: DesktopApi | null = typeof window !== 'undefined' ? window.desktop ?? null : null;

const BROWSER_KEY = 'imposters:fs:';

const browserFiles: ProjectFiles = {
  read: async (rel) => localStorage.getItem(BROWSER_KEY + rel),
  write: async (rel, data) => {
    if (typeof data !== 'string') throw new Error('Binary files need the desktop app');
    localStorage.setItem(BROWSER_KEY + rel, data);
  },
  writeSync: (rel, data) => localStorage.setItem(BROWSER_KEY + rel, data),
  exists: async (rel) => localStorage.getItem(BROWSER_KEY + rel) !== null,
  list: async (rel) => {
    const prefix = BROWSER_KEY + rel.replace(/\/?$/, '/');
    return Object.keys(localStorage).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
      .filter((n) => !n.includes('/'));
  },
  remove: async (rel) => localStorage.removeItem(BROWSER_KEY + rel),
};

export const files: ProjectFiles = desktop ?? browserFiles;

/** The URL to show an image source: project files are served by the desktop app. */
export const assetUrl = (src: string): string =>
  !src || isExternalSrc(src) || !desktop ? src : 'project://local/' + src.split('/').map(encodeURIComponent).join('/');
