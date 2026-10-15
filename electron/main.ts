/* Electron main process: one window, the open project folder, file access
   confined to that folder, and PDF export. */

import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT_SCHEME } from './api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const RECENT_FILE = () => path.join(app.getPath('userData'), 'recent.json');
const RECENT_MAX = 10;

let win: BrowserWindow | null = null;
let root: string | null = null;

// a separate settings folder (recent projects …), e.g. for tests
if (process.env.IMPOSTERS_USER_DATA) app.setPath('userData', process.env.IMPOSTERS_USER_DATA);

/** A project folder (or its project.json) given on the command line: `imposters <folder>`.
    A folder that doesn't exist yet becomes a new project. */
function projectArg(): string | null {
  const arg = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-'));
  if (!arg) return null;
  return path.resolve(path.basename(arg) === 'project.json' ? path.dirname(arg) : arg);
}

/** Absolute path of `rel` inside the open project; throws if it leaves the folder. */
function inProject(rel: string): string {
  if (!root) throw new Error('No project is open');
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('Path outside the project: ' + rel);
  return abs;
}

async function recent(): Promise<string[]> {
  try {
    const list = JSON.parse(await readFile(RECENT_FILE(), 'utf8'));
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

async function setRoot(dir: string): Promise<void> {
  root = path.resolve(dir);
  const list = [root, ...(await recent()).filter((p) => p !== root)].slice(0, RECENT_MAX);
  await writeFile(RECENT_FILE(), JSON.stringify(list, null, 1)).catch(() => {});
}

/* Writes go via a temporary file, so an interrupted save never leaves half a
   file. Each write is numbered: a slow write that finishes after a newer one
   to the same file is dropped instead of overwriting it. */
let writeNo = 0;
const latestWrite = new Map<string, number>();

/* On Windows a file another program has open for a moment (a virus scanner, the search indexer, a sync
   client …) can't be replaced: retry for a little while. */
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRIES = 12;
const busy = (err: unknown): boolean => BUSY.has((err as NodeJS.ErrnoException).code ?? '');

async function writeAtomic(abs: string, data: string | Uint8Array): Promise<void> {
  const n = ++writeNo, tmp = `${abs}.${n}.tmp`;
  latestWrite.set(abs, n);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(tmp, data);
  for (let i = 0; ; i++) {
    if (latestWrite.get(abs) !== n) { await rm(tmp, { force: true }); return; }
    try {
      renameSync(tmp, abs); // sync: nothing else can run between the check and the rename
      return;
    } catch (err) {
      if (!busy(err) || i >= RETRIES) { await rm(tmp, { force: true }); throw err; }
      await new Promise((r) => setTimeout(r, 20 * (i + 1)));
    }
  }
}

function writeAtomicSync(abs: string, data: string): void {
  const n = ++writeNo, tmp = `${abs}.${n}.tmp`;
  latestWrite.set(abs, n);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(tmp, data);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, abs);
      return;
    } catch (err) {
      if (!busy(err) || i >= RETRIES) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (i + 1)); // a short pause (no event loop here)
    }
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: PROJECT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerIpc(): void {
  ipcMain.handle('project:choose-new', async () => {
    const r = await dialog.showSaveDialog(win!, {
      title: 'New project', buttonLabel: 'Create project', defaultPath: 'Poster project',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (r.canceled || !r.filePath) return null;
    await mkdir(r.filePath, { recursive: true });
    await setRoot(r.filePath);
    return root;
  });
  ipcMain.handle('project:choose-open', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Open project folder', properties: ['openDirectory'] });
    const dir = r.filePaths[0];
    if (r.canceled || !dir) return null;
    if (!existsSync(path.join(dir, 'project.json'))) {
      const answer = await dialog.showMessageBox(win!, {
        type: 'question', buttons: ['Create project here', 'Cancel'], defaultId: 0, cancelId: 1,
        message: 'This folder is not an Imposters project.', detail: dir,
      });
      if (answer.response !== 0) return null;
    }
    await setRoot(dir);
    return root;
  });
  ipcMain.handle('project:open', async (_e, dir: string) => {
    if (!existsSync(dir)) return false;
    await setRoot(dir);
    return true;
  });
  ipcMain.handle('project:recent', async () => (await recent()).filter((p) => existsSync(p)));
  ipcMain.handle('project:reveal', async () => { if (root) await shell.openPath(root); });

  ipcMain.handle('fs:read', async (_e, rel: string) => {
    try {
      return await readFile(inProject(rel), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  });
  ipcMain.handle('fs:read-data-url', async (_e, rel: string) => {
    const MIME: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      avif: 'image/avif', bmp: 'image/bmp',
    };
    try {
      const data = await readFile(inProject(rel));
      return `data:${MIME[path.extname(rel).slice(1).toLowerCase()] ?? 'application/octet-stream'};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  });
  ipcMain.handle('fs:write', (_e, rel: string, data: string | Uint8Array) => writeAtomic(inProject(rel), data));
  ipcMain.on('fs:write-sync', (e, rel: string, data: string) => {
    try {
      writeAtomicSync(inProject(rel), data);
      e.returnValue = null;
    } catch (err) {
      e.returnValue = (err as Error).message;
    }
  });
  ipcMain.handle('fs:exists', (_e, rel: string) => existsSync(inProject(rel)));
  ipcMain.handle('fs:list', async (_e, rel: string) => readdir(inProject(rel)).catch(() => []));
  ipcMain.handle('fs:remove', (_e, rel: string) => rm(inProject(rel), { force: true }));

  /** Save an export: straight into IMPOSTERS_EXPORT_DIR (scripts, tests), else where the person says. */
  async function saveExport(name: string, ext: string, kind: string, data: string | Uint8Array): Promise<string | null> {
    const auto = process.env.IMPOSTERS_EXPORT_DIR;
    if (auto) {
      const file = path.join(auto, `${name}.${ext}`);
      await writeAtomic(file, data);
      return file;
    }
    const r = await dialog.showSaveDialog(win!, {
      title: `Export ${kind}`, defaultPath: path.join(root ? inProject('export') : app.getPath('documents'), `${name}.${ext}`),
      filters: [{ name: kind, extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    await writeAtomic(r.filePath, data);
    return r.filePath;
  }
  ipcMain.handle('export:pdf', async (_e, name: string) =>
    saveExport(name, 'pdf', 'PDF', await win!.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })));
  ipcMain.handle('export:html', (_e, name: string, html: string) => saveExport(name, 'html', 'Web page', html));
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1500, height: 950, show: false, title: 'Imposters',
    // no throttling when the window is covered or in the background: saving must not wait for it to be seen
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win!.show());
  win.on('closed', () => { win = null; });

  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(here, '../dist/index.html'));
}

app.whenReady().then(async () => {
  const arg = projectArg();
  if (arg) {
    await mkdir(arg, { recursive: true });
    await setRoot(arg); // the page opens the most recent project
  }
  protocol.handle(PROJECT_SCHEME, (req) => {
    try {
      const rel = decodeURIComponent(new URL(req.url).pathname.slice(1));
      return net.fetch(pathToFileURL(inProject(rel)).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  registerIpc();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
