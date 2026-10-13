/* Drop-down menus of the formatting toolbar: colour (text / fill) and border.
   One menu is open at a time. */

import { editor } from '../editor/store';
import { ROLES, rememberColor } from '../model/design';
import type { Tile } from '../model/types';
import { dom } from '../view/dom';

let open: HTMLElement | null = null;

export const menuOpen = (): HTMLElement | null => open;

export function closeMenu(): void {
  open?.remove();
  open = null;
}

/** Show a menu element under a toolbar button. */
function show(menu: HTMLElement, btn: HTMLElement, width: number): void {
  closeMenu();
  dom.fmtbar.appendChild(menu);
  const r = btn.getBoundingClientRect(), host = dom.fmtbar.getBoundingClientRect();
  menu.style.left = Math.min(r.left - host.left, host.width - width) + 'px';
  menu.style.top = r.bottom - host.top + 4 + 'px';
  // keep the caret in the text being typed (except for the colour inputs)
  menu.addEventListener('pointerdown', (e) => { if (!(e.target as Element).matches('input')) e.preventDefault(); });
  open = menu;
}

/* ---- colour menu: design colours, history, none / automatic, custom ---- */

export function openColorMenu(btn: HTMLElement, kind: 'color' | 'fill', pick: (v: string) => void): void {
  const d = editor.doc.design, isFill = kind === 'fill';
  const roles = ROLES.filter((r) => (isFill ? d.colors[r.id].bg : d.colors[r.id].text));
  const swatch = (c: string) => `<button class="sw" data-v="${c}" title="${c}" style="background:${c}"></button>`;
  const menu = document.createElement('div');
  menu.className = 'colormenu';
  menu.innerHTML =
    `<button class="none" data-v="">${isFill ? 'No fill' : 'Automatic (text style)'}</button>` +
    (roles.length ? `<div class="cm-h">Design colours</div><div class="cm-roles">${roles.map((r) =>
      `<button class="role-sw" data-v="@${r.id}"><span style="background:${isFill ? d.colors[r.id].bg : d.colors[r.id].text}"></span>${r.label}</button>`).join('')}</div>` : '') +
    (d.recent.length ? `<div class="cm-h">Recent</div><div class="cm-grid">${d.recent.map(swatch).join('')}</div>` : '') +
    `<label class="cm-custom">Custom… <input type="color" value="${d.recent[0] || '#2a9d8f'}"></label>`;
  show(menu, btn, 230);
  const choose = (v: string) => {
    if (v && v[0] === '#') rememberColor(d, v);
    pick(v);
    closeMenu();
  };
  menu.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-v]');
    if (b) choose(b.dataset.v!);
  });
  const custom = menu.querySelector<HTMLInputElement>('input[type=color]')!;
  custom.addEventListener('change', () => choose(custom.value));
}

/* ---- border menu: sides, width, colour, corners ---- */

export interface BorderChange {
  borderW?: number;
  borderC?: string;
  borderSides?: string;
  radius?: number;
}

export function openBorderMenu(btn: HTMLElement, current: () => Tile | null, apply: (change: BorderChange) => void): void {
  const d = editor.doc.design;
  const colours = [...new Set(d.recent.concat(Object.values(d.colors).flatMap((c) => [c.bg, c.text]).filter(Boolean)))];
  const menu = document.createElement('div');
  menu.className = 'colormenu bordermenu';
  const sideBtn = (k: string, label: string) => `<button class="bm-side" data-side="${k}" title="${label}">${label}</button>`;
  menu.innerHTML =
    `<div class="cm-h">Sides</div><div class="bm-row">
      <button data-sides="trbl">All</button><button data-sides="">None</button>
      ${sideBtn('t', 'Top')}${sideBtn('b', 'Bottom')}${sideBtn('l', 'Left')}${sideBtn('r', 'Right')}</div>
    <div class="cm-h">Width (mm)</div><div class="bm-row">
      ${[0.25, 0.5, 1, 2, 3, 5].map((w) => `<button data-w="${w}">${w}</button>`).join('')}
      <input type="number" class="bm-w" min="0" step="0.25" title="Width (mm)"></div>
    <div class="cm-h">Colour</div><div class="cm-grid">
      ${colours.map((c) => `<button class="sw" data-c="${c}" title="${c}" style="background:${c}"></button>`).join('')}</div>
    <label class="cm-custom">Custom… <input type="color" class="bm-c"></label>
    <div class="cm-h">Corners (mm)</div><div class="bm-row">
      ${[0, 2, 5, 10, 20].map((r) => `<button data-r="${r}">${r}</button>`).join('')}</div>`;
  show(menu, btn, 250);

  const sync = () => {
    const t = current();
    if (!t || open !== menu) return;
    const on = t.borderW > 0, sides = on ? t.borderSides ?? 'trbl' : '';
    menu.querySelectorAll<HTMLElement>('[data-side]').forEach((b) => b.classList.toggle('on', sides.includes(b.dataset.side!)));
    menu.querySelector('[data-sides="trbl"]')!.classList.toggle('on', sides.length === 4);
    menu.querySelector('[data-sides=""]')!.classList.toggle('on', !on);
    menu.querySelectorAll<HTMLElement>('[data-w]').forEach((b) => b.classList.toggle('on', on && +b.dataset.w! === t.borderW));
    menu.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => b.classList.toggle('on', +b.dataset.r! === (t.radius || 0)));
    menu.querySelector<HTMLInputElement>('.bm-w')!.value = on ? String(t.borderW) : '';
    menu.querySelector<HTMLInputElement>('.bm-c')!.value = /^#/.test(t.borderC || '') ? t.borderC : '#1a1a1a';
  };
  const change = (c: BorderChange) => { apply(c); sync(); };

  menu.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    const t = current();
    if (!b || !t) return;
    const ds = b.dataset;
    if (ds.sides !== undefined) change(ds.sides ? { borderSides: ds.sides } : { borderW: 0 });
    else if (ds.side) {
      let sides = t.borderW > 0 ? t.borderSides ?? 'trbl' : '';
      sides = sides.includes(ds.side) ? sides.replace(ds.side, '') : sides + ds.side;
      change(sides ? { borderSides: sides } : { borderW: 0 });
    } else if (ds.w) change({ borderW: +ds.w });
    else if (ds.c) { rememberColor(d, ds.c); change({ borderC: ds.c }); }
    else if (ds.r !== undefined) change({ radius: +ds.r });
  });
  menu.querySelector<HTMLInputElement>('.bm-w')!.addEventListener('change', (e) =>
    change({ borderW: Math.max(0, +(e.target as HTMLInputElement).value || 0) }));
  menu.querySelector<HTMLInputElement>('.bm-c')!.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    rememberColor(d, v);
    change({ borderC: v });
  });
  sync();
}
