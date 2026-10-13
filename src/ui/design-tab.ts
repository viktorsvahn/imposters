/* The Design tab: colour roles and text styles for the whole poster. */

import { commit } from '../editor/history';
import { render } from '../editor/hooks';
import { editor } from '../editor/store';
import { defaultDesign, isBaseStyle, newTextStyle, ROLES, styleById, WEIGHTS } from '../model/design';
import type { ColorRoleId, TextStyle } from '../model/types';
import { escapeHtml, uid } from '../util';
import { $, $$ } from '../view/dom';
import { attachSwatches } from '../view/design-css';
import { fontOptions } from './formatbar';

export function renderDesignTab(): void {
  const d = editor.doc.design;
  $('#colorRoles').innerHTML = ROLES.map((r) => {
    const c = d.colors[r.id];
    return `<div class="role" data-role="${r.id}">
      <span class="role-name">${r.label}</span>
      <label title="Background"><input type="color" data-k="bg" value="${c.bg || '#ffffff'}"${c.bg ? '' : ' class="off"'}></label>
      <label class="check mini"><input type="checkbox" data-k="bgNone"${c.bg ? '' : ' checked'}> none</label>
      ${r.textless ? '<span></span><span></span>' : `
      <label title="Text colour"><input type="color" data-k="text" value="${c.text || '#1a1a1a'}"${c.text ? '' : ' class="off"'}></label>
      <label class="check mini"><input type="checkbox" data-k="textAuto"${c.text ? '' : ' checked'}> auto</label>`}
    </div>`;
  }).join('');

  $('#styleList').innerHTML = d.styles.map((s) => `
    <div class="style-card${s.enabled ? '' : ' disabled'}" data-style="${s.id}">
      <div class="row">
        ${s.id === 'body' ? '<span class="lock" title="Body text is always available">•</span>'
          : `<input type="checkbox" data-k="enabled"${s.enabled ? ' checked' : ''} title="Offer this style in the poster">`}
        <input type="text" data-k="name" value="${escapeHtml(s.name)}" title="Name shown when writing">
        ${isBaseStyle(s.id) ? '' : '<button class="del" data-del title="Remove this style">×</button>'}
      </div>
      <div class="row">
        <select data-k="font">${fontOptions(false)}</select>
        <input type="number" data-k="size" min="4" step="1" value="${s.size}" title="Size (pt)">
      </div>
      <div class="row">
        <select data-k="weight">${WEIGHTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <label class="check mini" title="Italic"><input type="checkbox" data-k="italic"${s.italic ? ' checked' : ''}> <i>Italic</i></label>
        <label class="check mini" title="All capitals"><input type="checkbox" data-k="upper"${s.upper ? ' checked' : ''}> CAPS</label>
      </div>
      <div class="row">
        <span class="muted">Colour</span>
        <input type="color" data-k="color" value="${s.color || '#1a1a1a'}" title="Colour"${s.color ? '' : ' class="off"'}>
        <label class="check mini" title="Use the surrounding text colour"><input type="checkbox" data-k="colorAuto"${s.color ? '' : ' checked'}> auto</label>
      </div>
      <div class="fmt sample"><span data-ts="${s.id}">${escapeHtml(s.name)}</span></div>
    </div>`).join('') + '<button id="addStyle" class="add">+ Add text style</button>';
  attachSwatches($('#tabDesign'));
  for (const card of $$('.style-card')) {
    const s = styleById(d, card.dataset.style!)!;
    $<HTMLSelectElement>('[data-k=font]', card).value = s.font;
    $<HTMLSelectElement>('[data-k=weight]', card).value = s.weight;
  }
}

/** Apply one edited field of the Design tab to the document. */
function update(e: Event, final: boolean): void {
  const el = e.target as HTMLInputElement, k = el.dataset.k;
  if (!k) return;
  const d = editor.doc.design;
  const roleRow = el.closest<HTMLElement>('[data-role]'), card = el.closest<HTMLElement>('[data-style]');
  if (roleRow) {
    const c = d.colors[roleRow.dataset.role as ColorRoleId];
    const field = (key: string) => $<HTMLInputElement>(`[data-k=${key}]`, roleRow);
    if (k === 'bg') { c.bg = el.value; field('bgNone').checked = false; el.classList.remove('off'); }
    if (k === 'bgNone') { c.bg = el.checked ? '' : field('bg').value; field('bg').classList.toggle('off', el.checked); }
    if (k === 'text') { c.text = el.value; field('textAuto').checked = false; el.classList.remove('off'); }
    if (k === 'textAuto') { c.text = el.checked ? '' : field('text').value; field('text').classList.toggle('off', el.checked); }
  } else if (card) {
    const s = styleById(d, card.dataset.style!)!;
    const field = (key: string) => $<HTMLInputElement>(`[data-k=${key}]`, card);
    if (k === 'enabled') { s.enabled = el.checked; card.classList.toggle('disabled', !el.checked); }
    else if (k === 'name') { s.name = el.value || s.id; $('.sample span', card).textContent = s.name; }
    else if (k === 'size') { const v = parseFloat(el.value); if (v > 0) s.size = v; }
    else if (k === 'italic' || k === 'upper') s[k] = el.checked;
    else if (k === 'color') { s.color = el.value; field('colorAuto').checked = false; el.classList.remove('off'); }
    else if (k === 'colorAuto') { s.color = el.checked ? '' : field('color').value; field('color').classList.toggle('off', el.checked); }
    else if (k === 'font' || k === 'weight') (s as TextStyle)[k] = el.value;
  }
  render();
  if (final) commit();
}

export function showTab(name: 'layout' | 'design'): void {
  $$('.tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('#tabLayout').hidden = name !== 'layout';
  $('#tabDesign').hidden = name !== 'design';
  if (name === 'design') renderDesignTab();
}

export const designTabVisible = (): boolean => !$('#tabDesign').hidden;

export function bindDesignTab(): void {
  const tab = $('#tabDesign');
  tab.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, d = editor.doc.design;
    if (t.id === 'addStyle') {
      const id = 'c' + uid();
      d.styles.push(newTextStyle(id));
      commit();
      render();
      renderDesignTab();
      const name = $<HTMLInputElement>(`[data-style="${id}"] [data-k=name]`);
      name.focus();
      name.select();
    } else if (t.dataset.del !== undefined) {
      const id = t.closest<HTMLElement>('[data-style]')!.dataset.style;
      d.styles = d.styles.filter((x) => x.id !== id);
      commit();
      render();
      renderDesignTab();
    }
  });
  tab.addEventListener('input', (e) => update(e, false));
  tab.addEventListener('change', (e) => update(e, true));
  $('#designReset').addEventListener('click', () => {
    if (!confirm('Reset all colours and text styles to the defaults?')) return;
    editor.doc.design = defaultDesign();
    commit();
    render();
    renderDesignTab();
  });
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab as 'layout' | 'design')));
}
