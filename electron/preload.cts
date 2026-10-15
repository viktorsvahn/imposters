/* Exposes the desktop API (see api.ts) to the page as `window.desktop`. */

import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from './api.js';

const api: DesktopApi = {
  platform: process.platform,
  chooseNewProject: () => ipcRenderer.invoke('project:choose-new'),
  chooseOpenProject: () => ipcRenderer.invoke('project:choose-open'),
  openProject: (root) => ipcRenderer.invoke('project:open', root),
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  revealProject: () => ipcRenderer.invoke('project:reveal'),
  read: (rel) => ipcRenderer.invoke('fs:read', rel),
  readDataUrl: (rel) => ipcRenderer.invoke('fs:read-data-url', rel),
  write: (rel, data) => ipcRenderer.invoke('fs:write', rel, data),
  writeSync: (rel, data) => {
    const error = ipcRenderer.sendSync('fs:write-sync', rel, data);
    if (error) throw new Error(error);
  },
  exists: (rel) => ipcRenderer.invoke('fs:exists', rel),
  list: (rel) => ipcRenderer.invoke('fs:list', rel),
  remove: (rel) => ipcRenderer.invoke('fs:remove', rel),
  exportPdf: (name) => ipcRenderer.invoke('export:pdf', name),
  exportHtml: (name, html) => ipcRenderer.invoke('export:html', name, html),
};

contextBridge.exposeInMainWorld('desktop', api);
