/* Typing in tiles (contentEditable) and paragraph-level styling. */

import { commit } from '../editor/history';
import { render } from '../editor/hooks';
import { editor, select, tileById } from '../editor/store';
import { isSection, parentOf } from '../model/tree';
import type { Tile } from '../model/types';
import { contentEl, invalidateContent } from '../view/paper';
import type { ClientPoint } from './coords';

/** The content element being typed in (null when not typing). */
export const editingContent = (): HTMLDivElement | null => contentEl(editor.view.editing);

export function startEditing(t: Tile | null, at: ClientPoint | null = null): void {
  if (!t || isSection(t) || t.type !== 'text') return;
  editor.view.editing = t.id;
  select(t.id);
  render();
  const c = contentEl(t.id)!;
  c.contentEditable = 'true';
  c.focus();
  let range = at && t.html && document.caretRangeFromPoint ? document.caretRangeFromPoint(at.clientX, at.clientY) : null;
  if (!range || !c.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(c);
    if (t.html) range.collapse(false);
  }
  const sel = getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Write the typed text back into the document and leave typing mode. */
export function stopEditing(): void {
  const id = editor.view.editing;
  if (!id) return;
  editor.view.editing = null;
  const t = tileById(id), c = contentEl(id);
  if (t && c) {
    c.contentEditable = 'false';
    let html = c.innerHTML.trim();
    if (html === '<br>' || (!c.textContent!.trim() && !c.querySelector('img'))) html = '';
    t.html = html;
    invalidateContent(id);
  }
  getSelection()?.removeAllRanges();
  commit();
  render();
}

/** A click (no drag) on a text tile starts typing at that spot. The tile may be
    nested anywhere: the editor moves to its level first. */
export function clickToType(t: Tile | null, at: ClientPoint): boolean {
  if (!t || isSection(t) || t.type !== 'text') return false;
  const p = parentOf(editor.doc, t.id);
  editor.view.scope = p ? p.id : null;
  startEditing(t, at);
  return true;
}

/** Put the caret at the end of an editable element. */
export function caretToEnd(c: HTMLElement): void {
  const r = document.createRange();
  r.selectNodeContents(c);
  r.collapse(false);
  const sel = getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
}

/* ---- paragraphs ---- */

/** The paragraph (direct child block of the content) holding a node. */
export function blockOf(c: HTMLElement, node: Node | null): HTMLElement | null {
  while (node && node.parentNode !== c) node = node.parentNode;
  return node && node.nodeType === 1 ? (node as HTMLElement) : null;
}

/** Wrap loose inline content into block <div>s so each paragraph can carry its
    own style; keeps the selection where it was. */
export function blockify(c: HTMLElement): void {
  const sel = getSelection()!;
  const keep = sel.rangeCount ? [sel.anchorNode!, sel.anchorOffset, sel.focusNode!, sel.focusOffset] as const : null;
  const isBlock = (n: Node) => n.nodeType === 1 && /^(DIV|P|H[1-6]|UL|OL|LI|BLOCKQUOTE)$/.test(n.nodeName);
  let run: HTMLDivElement | null = null;
  for (const n of [...c.childNodes]) {
    if (isBlock(n)) { run = null; continue; }
    if (!run) { run = document.createElement('div'); c.insertBefore(run, n); }
    run.appendChild(n);
    if (n.nodeName === 'BR') run = null;
  }
  if (keep) sel.setBaseAndExtent(...keep);
}

/** The paragraphs the selection touches. */
export function selectedBlocks(c: HTMLElement): HTMLElement[] {
  blockify(c);
  const sel = getSelection()!;
  if (!sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  return ([...c.children] as HTMLElement[]).filter((b) => r.intersectsNode(b));
}

/** Give the selected paragraphs a text style. */
export function applyBlockStyle(id: string): void {
  const t = tileById(editor.view.editing), c = editingContent();
  if (!t || !c) return;
  for (const b of selectedBlocks(c)) {
    // "body" is explicit only when the tile's own style is something else
    if (id === 'body' && !t.ts) delete b.dataset.ts;
    else b.dataset.ts = id;
  }
}

/** With only a caret, inline formatting applies to its whole paragraph. */
export function selectParagraphIfCollapsed(c: HTMLElement): void {
  const sel = getSelection()!;
  if (!sel.rangeCount || !sel.isCollapsed) return;
  blockify(c);
  const b = blockOf(c, sel.anchorNode) || c;
  const r = document.createRange();
  r.selectNodeContents(b);
  sel.removeAllRanges();
  sel.addRange(r);
}
