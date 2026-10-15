/* Project controls: the project menu in the toolbar, the welcome screen
   (desktop app, no project open), and the pop-up menu and name dialog that
   the sidebar uses as well. */

import { saveDocument } from '../interaction/files';
import { desktop } from '../project/backend';
import * as session from '../project/session';
import { project } from '../project/session';
import { escapeHtml } from '../util';
import { $ } from '../view/dom';

export interface MenuItem {
  label: string;
  run: () => unknown;
  title?: string;
}

let menu: HTMLElement | null = null;
let menuBtn: HTMLElement | null = null;
let started = false;

export function closeMenu(): void {
  menu?.remove();
  menu = menuBtn = null;
}

/** A pop-up menu under `btn` (or at a point). Opening it again from the same button closes it. */
export function openMenu(btn: HTMLElement, items: (MenuItem | '-')[], at?: { x: number; y: number }): void {
  const toggle = menuBtn === btn;
  closeMenu();
  if (toggle) return;
  const m = document.createElement('div');
  m.className = 'popmenu';
  for (const it of items) {
    if (it === '-') { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.textContent = it.label;
    if (it.title) b.title = it.title;
    b.addEventListener('click', () => { closeMenu(); it.run(); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), x = at?.x ?? r.left, y = at?.y ?? r.bottom + 4;
  m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) + 'px';
  menu = m;
  menuBtn = btn;
}

/** Ask for a name. Resolves to the trimmed text, or null when cancelled. */
export function askName(label: string, value: string): Promise<string | null> {
  const dlg = $<HTMLDialogElement>('#askDialog');
  const input = $<HTMLInputElement>('#askInput');
  $('#askLabel').textContent = label;
  input.value = value;
  dlg.returnValue = '';
  dlg.showModal();
  input.select();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' && input.value.trim() ? input.value.trim() : null),
      { once: true });
  });
}

const folderName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() || p;

async function projectMenu(btn: HTMLElement): Promise<void> {
  const items: (MenuItem | '-')[] = [];
  if (desktop) {
    const recent = (await desktop.recentProjects()).filter((p) => p !== project.root).slice(0, 6);
    items.push(
      { label: 'New project…', run: session.createProject },
      { label: 'Open project…', run: session.chooseProject, title: 'Ctrl+O' },
      ...recent.map((p) => ({ label: '↺ ' + folderName(p), title: p, run: () => session.openRecentProject(p) })),
      '-',
    );
  }
  items.push(
    { label: 'Rename project…', run: async () => {
      const name = await askName('Project name', project.manifest?.name || '');
      if (name) await session.renameProject(name);
    } },
    { label: 'Import poster (.json)…', run: () => $<HTMLInputElement>('#fileDoc').click(),
      title: 'Add a saved poster file to this project as a new base poster' },
  );
  if (desktop) items.push({ label: 'Show project folder', run: () => desktop!.revealProject() });
  else items.push({ label: 'Download poster (.json)', run: saveDocument });
  openMenu(btn, items);
}

async function renderWelcome(): Promise<void> {
  const recent = desktop ? await desktop.recentProjects() : [];
  $('#welcomeRecent').innerHTML = recent.length
    ? '<h2>Recent projects</h2>' + recent.map((p) =>
      `<button class="recent" data-root="${escapeHtml(p)}"><b>${escapeHtml(folderName(p))}</b><span>${escapeHtml(p)}</span></button>`).join('')
    : '';
}

export function updateProjectBar(): void {
  const m = project.manifest;
  $('#projectBtn').textContent = (m?.name || 'No project') + ' ▾';
  $('#posterName').textContent = project.poster?.name ?? '';
  const welcome = $('#welcome'), show = started && !m;
  if (welcome.hidden === show) {
    welcome.hidden = !show;
    if (show) void renderWelcome();
  }
}

/** Mark startup done: from now on the welcome screen shows whenever no project is open. */
export function projectStarted(): void {
  started = true;
  updateProjectBar();
}

export function bindProjectBar(): void {
  $('#projectBtn').addEventListener('click', (e) => void projectMenu(e.currentTarget as HTMLElement));

  $('#welcome').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.proj === 'new') void session.createProject();
    else if (b.dataset.proj === 'open') void session.chooseProject();
    else if (b.dataset.root) void session.openRecentProject(b.dataset.root);
  });

  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (menu && !menu.contains(t) && !menuBtn?.contains(t)) closeMenu();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu) { closeMenu(); e.stopImmediatePropagation(); return; }
    // no editing behind the welcome screen
    if (!$('#welcome').hidden) e.stopImmediatePropagation();
  }, true);
}
