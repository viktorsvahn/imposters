/* The master poster: the design shown as a poster with one of every element. Click an element to open its
   settings in the Design panel; every element sharing that setting is outlined. */

import { PX } from '../constants';
import { editor } from '../editor/store';
import { masterKeyOfTile, specimenDoc, type MasterKey } from '../layout/specimen';
import { resolveBg } from '../model/design';
import { walk } from '../model/tree';
import type { Doc, Tile } from '../model/types';
import { $ } from '../view/dom';
import { renderTileTree, renderWatermark, type TileElement } from '../view/paper';

const els = new Map<string, TileElement>();
let spec: Doc | null = null;
const kinds = new Map<string, MasterKey>();
let picked: MasterKey = 'paper';
let onPick: (key: MasterKey) => void = () => {};

export const masterVisible = (): boolean => !$('#master').hidden;

export function showMaster(on: boolean): void {
  $('#master').hidden = !on;
  document.body.classList.toggle('master-open', on);
  if (on) renderMaster();
}

/** Draw the master poster from the open poster's paper and design. */
export function renderMaster(): void {
  if (!masterVisible()) return;
  spec = specimenDoc(editor.doc);
  kinds.clear();
  walk(spec.tiles, (t: Tile, parent: Tile | null) => { kinds.set(t.id, masterKeyOfTile(t, parent)); });
  const paper = $('#masterPaper'), stage = $('#masterStage'), p = spec.paper;
  const z = Math.min((stage.clientWidth - 48) / (p.w * PX), (stage.clientHeight - 48) / (p.h * PX));
  const s = paper.style;
  s.width = p.w + 'mm'; s.height = p.h + 'mm';
  s.transform = `scale(${z})`;
  s.setProperty('--inv', String(1 / z));
  s.background = resolveBg(spec.design, p.bg) || '#ffffff';
  $('#masterSizer').style.width = p.w * PX * z + 'px';
  $('#masterSizer').style.height = p.h * PX * z + 'px';
  renderWatermark(paper, spec.design);
  renderTileTree({ doc: spec, view: { scope: null, selected: new Set(), editing: null, showOverflow: false, spell: false } }, $('#masterTiles'), els);
  highlight();
}

/** Outline what the picked setting applies to. */
function highlight(): void {
  const root = $('#masterPaper');
  root.querySelectorAll('.master-pick').forEach((e) => e.classList.remove('master-pick'));
  root.classList.toggle('master-pick-paper', picked === 'paper' || picked === 'watermark');
  const mark = (e: Element) => e.classList.add('master-pick');
  if (picked.startsWith('style:')) {
    const id = CSS.escape(picked.slice(6));
    root.querySelectorAll(`[data-ts="${id}"]`).forEach(mark);
    // text without a style of its own is body text
    if (id === 'body') root.querySelectorAll('.tile > .content:not([data-ts]) > :is(div, ul, ol):not([data-ts])').forEach(mark);
  } else if (picked === 'table') root.querySelectorAll('table').forEach(mark);
  else if (picked === 'palette') root.querySelectorAll('[data-el="palette"]').forEach(mark);
  else for (const [id, k] of kinds) if (k === picked) { const el = els.get(id); if (el) mark(el); }
}

export function setMasterPick(key: MasterKey): void {
  picked = key;
  if (masterVisible()) highlight();
}

/** The kind of element at a click on the master poster. */
function keyAt(target: Element): MasterKey {
  const tile = target.closest<HTMLElement>('.tile');
  if (!tile) return 'paper';
  const kind = kinds.get(tile.dataset.id!) ?? 'tiles';
  // headers and footers are picked as a whole (their settings include their text styles)
  if (kind === 'banner' || kind === 'footer' || kind === 'tileHeader' || kind === 'tileFooter') return kind;
  const el = target.closest('[data-el]');
  if (el) return (el as HTMLElement).dataset.el as MasterKey;
  if (target.closest('table')) return 'table';
  const styled = target.closest<HTMLElement>('[data-ts]');
  if (styled && tile.contains(styled)) return `style:${styled.dataset.ts}`;
  if (target.closest('.content > *')) return 'style:body';
  return kind;
}

export function bindMaster(pick: (key: MasterKey) => void): void {
  onPick = pick;
  $('#masterStage').addEventListener('click', (e) => {
    const key = keyAt(e.target as Element);
    setMasterPick(key);
    onPick(key);
  });
  new ResizeObserver(() => renderMaster()).observe($('#masterStage'));
}
