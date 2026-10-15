/* The desktop API the preload script exposes to the page as `window.desktop`.
   File paths are relative to the open project folder; the main process refuses
   anything that points outside it. */

export interface DesktopApi {
  platform: string;

  /** Ask for a new project folder (created if needed) and open it. Returns its path. */
  chooseNewProject(): Promise<string | null>;
  /** Ask for an existing project folder and open it. Returns its path. */
  chooseOpenProject(): Promise<string | null>;
  /** Open a project folder by path (e.g. a recent one). False if it no longer exists. */
  openProject(root: string): Promise<boolean>;
  /** Recently opened project folders, newest first. */
  recentProjects(): Promise<string[]>;
  /** Show the project folder in the file manager. */
  revealProject(): Promise<void>;

  read(rel: string): Promise<string | null>;
  /** A file as a data: URL (images, for pages that must carry them inside). */
  readDataUrl(rel: string): Promise<string | null>;
  write(rel: string, data: string | Uint8Array): Promise<void>;
  /** Write and wait for it — for the last save while the page is closing. */
  writeSync(rel: string, data: string): void;
  exists(rel: string): Promise<boolean>;
  list(rel: string): Promise<string[]>;
  remove(rel: string): Promise<void>;

  /** Print the page to a PDF (CSS page size) and ask where to save it. Returns the saved path. */
  exportPdf(name: string): Promise<string | null>;
  /** Save a web page (asks where, in export/). Returns the saved path. */
  exportHtml(name: string, html: string): Promise<string | null>;
}

/** URL scheme for files inside the open project: project://local/<relative path>. */
export const PROJECT_SCHEME = 'project';
