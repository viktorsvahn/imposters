'use strict';

/* =========================================================================
   Formatting toolbar (word-processor style). While typing, it styles the
   paragraph / selected text; otherwise it styles the selected tiles.
   Fill, vertical alignment, line/paragraph spacing and text columns are
   always tile settings.
   ========================================================================= */

const fmt = { range: null };
const fmtEl = () => $('#fmtbar');
const editingContent = () => (state.editing && els.get(state.editing) ? els.get(state.editing).firstChild : null);

/* ---- keeping the caret while using the toolbar ---- */

document.addEventListener('selectionchange', () => {
  const c = editingContent(), sel = getSelection();
  if (c && sel.rangeCount && c.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    fmt.range = sel.getRangeAt(0).cloneRange();
    updateFormatBar();
  }
});

function restoreRange() {
  const c = editingContent();
  if (!c) return null;
  c.focus({ preventScroll: true });
  if (fmt.range && c.contains(fmt.range.commonAncestorContainer)) {
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(fmt.range);
  }
  return c;
}

/* The paragraph (direct child block of the content) holding a node. */
function blockOf(c, node) {
  while (node && node.parentNode !== c) node = node.parentNode;
  return node && node.nodeType === 1 ? node : null;
}

/* With only a caret, inline formatting applies to its whole paragraph. */
function selectParagraphIfCollapsed(c) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  blockify(c);
  const b = blockOf(c, sel.anchorNode) || c;
  const r = document.createRange();
  r.selectNodeContents(b);
  sel.removeAllRanges();
  sel.addRange(r);
}

function exec(cmd, value) {
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, value);
}

/* execCommand only knows sizes 1–7; mark with 7 and turn that into points. */
function setInlineSize(c, pt) {
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontSize', false, '7');
  const made = [];
  for (const f of c.querySelectorAll('font[size="7"]')) {
    const span = document.createElement('span');
    span.style.fontSize = pt + 'pt';
    span.append(...f.childNodes);
    f.replaceWith(span);
    made.push(span);
  }
  if (made.length) {
    const r = document.createRange();
    r.setStartBefore(made[0]);
    r.setEndAfter(made[made.length - 1]);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }
}

function selectedBlocks(c) {
  blockify(c);
  const sel = getSelection();
  if (!sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  return [...c.children].filter((b) => r.intersectsNode(b));
}

/* ---- applying ---- */

/* Text-level actions: on the text while typing, on the tiles otherwise. */
function fmtText(action, value) {
  const c = state.editing ? restoreRange() : null;
  if (c) {
    if (action === 'style') applyBlockStyle(value);
    else if (action === 'align') for (const b of selectedBlocks(c)) b.style.textAlign = value;
    else if (action === 'list') exec(value === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
    else if (action === 'clear') { selectParagraphIfCollapsed(c); exec('removeFormat'); }
    else if (['bold', 'italic', 'underline'].includes(action)) exec(action);
    else {
      selectParagraphIfCollapsed(c);
      if (action === 'font') exec('fontName', value ? FONTS[value] : FONTS[styleById('body').font]);
      if (action === 'size') setInlineSize(c, value);
      if (action === 'color') exec('foreColor', resolveText(value) || '#1a1a1a');
    }
    const s = getSelection();
    if (s.rangeCount) fmt.range = s.getRangeAt(0).cloneRange();
    updateFormatBar();
    return;
  }
  const ts = selectedTiles();
  if (!ts.length) return;
  const prop = { style: 'ts', font: 'font', size: 'fontSize', color: 'color', align: 'align' }[action];
  if (prop) {
    const v = action === 'style' && value === 'body' ? '' : value;
    for (const t of ts) applyStyle(t, prop, v);
  } else if (['bold', 'italic', 'underline'].includes(action)) {
    const on = !lookOf(ts[0]).text[action];
    for (const t of ts) applyStyle(t, action, on);
  } else if (action === 'clear') {
    for (const t of ts) for (const k of ['font', 'fontSize', 'color', 'bold', 'italic', 'underline']) applyStyle(t, k, k === 'fontSize' ? null : k === 'color' || k === 'font' ? '' : false);
  }
  commit(); render();
}

/* Tile-level settings (also while typing: they apply to the tile being edited). */
function fmtTile(prop, value) {
  const ts = state.editing ? [byId(state.editing)] : selectedTiles();
  if (!ts.length) return;
  for (const t of ts) applyStyle(t, prop, value);
  if (state.editing) {
    // don't rebuild the text being typed; just restyle the tile
    const t = ts[0], el = els.get(t.id);
    updateTileEl(el, t, parentOf(t.id));
    restoreRange();
  } else {
    commit(); render();
  }
  updateFormatBar();
}

/* ---- colour menu (design colours, history, none, custom) ---- */

function openColorMenu(btn, kind) {
  closeColorMenu();
  const d = doc.design, isFill = kind === 'fill';
  const roles = ROLES.filter(([id]) => (isFill ? d.colors[id].bg : d.colors[id].text));
  const sw = (v, color, label) => `<button class="sw" data-v="${v}" title="${label}" style="background:${color}"></button>`;
  const menu = document.createElement('div');
  menu.className = 'colormenu';
  menu.innerHTML =
    `<button class="none" data-v="">${isFill ? 'No fill' : 'Automatic (text style)'}</button>` +
    (roles.length ? `<div class="cm-h">Design colours</div><div class="cm-roles">${roles.map(([id, label]) =>
      `<button class="role-sw" data-v="@${id}"><span style="background:${isFill ? d.colors[id].bg : d.colors[id].text}"></span>${label}</button>`).join('')}</div>` : '') +
    (d.recent.length ? `<div class="cm-h">Recent</div><div class="cm-grid">${d.recent.map((c) => sw(c, c, c)).join('')}</div>` : '') +
    `<label class="cm-custom">Custom… <input type="color" value="${d.recent[0] || '#2a9d8f'}"></label>`;
  fmtEl().appendChild(menu);
  const r = btn.getBoundingClientRect(), host = fmtEl().getBoundingClientRect();
  menu.style.left = r.left - host.left + 'px';
  menu.style.top = r.bottom - host.top + 4 + 'px';
  const pick = (v, final = true) => {
    if (v && v[0] === '#') rememberColor(v);
    if (isFill) fmtTile('bg', v); else fmtText('color', v);
    if (final) closeColorMenu();
  };
  menu.addEventListener('pointerdown', (e) => { if (e.target.type !== 'color') e.preventDefault(); });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) pick(b.dataset.v);
  });
  const custom = menu.querySelector('input[type=color]');
  custom.addEventListener('change', () => pick(custom.value));
  fmt.menu = menu;
}

function closeColorMenu() {
  if (fmt.menu) { fmt.menu.remove(); fmt.menu = null; }
}

/* ---- header / footer / bleed ---- */

/* What the header/footer buttons act on: the selected (or typed-in) tile,
   else the tile you are inside, else the poster (null). A header/footer
   itself stands for the tile it belongs to. */
function bandTarget() {
  let t = state.editing ? byId(state.editing) : selectedTiles().length === 1 ? selectedTiles()[0] : scopeTile();
  if (t && t.role) t = parentOf(t.id);
  return t;
}

function fmtBand(role) {
  if (state.editing) stopEditing();
  const c = bandTarget();
  const on = !bandOf(c, role);
  if (c && on) makeContainer(c, true);
  toggleBand(c, role, on);
  if (c && !on && c.children && !c.children.length) delete c.children;
  if (c && (parentOf(c.id) ? parentOf(c.id).id : null) === state.scope) state.selected = new Set([c.id]);
  commit(); render();
}

function fmtBleed() {
  const t = state.editing ? byId(state.editing) : selectedTiles()[0] || scopeTile();
  if (!t) return;
  const on = !t.bleed;
  for (const x of state.editing || !selectedTiles().length ? [t] : selectedTiles()) x.bleed = on;
  commit(); render();
}

/* ---- borders ---- */

const borderTargets = () => (state.editing ? [byId(state.editing)] : selectedTiles());

function setBorder(props) {
  const ts = borderTargets();
  if (!ts.length) return;
  for (const t of ts) {
    Object.assign(t, props);
    if (props.borderW === undefined && !(t.borderW > 0) && (props.borderSides || props.borderC)) t.borderW = 0.5;
  }
  if (state.editing) {
    const t = ts[0];
    updateTileEl(els.get(t.id), t, parentOf(t.id));
    restoreRange();
  } else {
    commit(); render();
  }
  if (fmt.menu && fmt.menu.classList.contains('bordermenu')) syncBorderMenu();
  updateFormatBar();
}

function openBorderMenu(btn) {
  closeColorMenu();
  const d = doc.design;
  const colours = [...new Set(d.recent.concat(Object.values(d.colors).flatMap((c) => [c.bg, c.text]).filter(Boolean)))];
  const menu = document.createElement('div');
  menu.className = 'colormenu bordermenu';
  const sideBtn = (k, label) => `<button class="bm-side" data-side="${k}" title="${label}">${label}</button>`;
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
  fmtEl().appendChild(menu);
  const r = btn.getBoundingClientRect(), host = fmtEl().getBoundingClientRect();
  menu.style.left = Math.min(r.left - host.left, host.width - 250) + 'px';
  menu.style.top = r.bottom - host.top + 4 + 'px';
  menu.addEventListener('pointerdown', (e) => { if (!e.target.matches('input')) e.preventDefault(); });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const t = borderTargets()[0];
    if (!t) return;
    if (b.dataset.sides !== undefined) setBorder(b.dataset.sides ? { borderSides: b.dataset.sides } : { borderW: 0 });
    else if (b.dataset.side) {
      let sides = t.borderW > 0 ? t.borderSides ?? 'trbl' : '';
      sides = sides.includes(b.dataset.side) ? sides.replace(b.dataset.side, '') : sides + b.dataset.side;
      setBorder(sides ? { borderSides: sides } : { borderW: 0 });
    } else if (b.dataset.w) setBorder({ borderW: +b.dataset.w });
    else if (b.dataset.c) { rememberColor(b.dataset.c); setBorder({ borderC: b.dataset.c }); }
    else if (b.dataset.r !== undefined) setBorder({ radius: +b.dataset.r });
  });
  menu.querySelector('.bm-w').addEventListener('change', (e) => setBorder({ borderW: Math.max(0, +e.target.value || 0) }));
  menu.querySelector('.bm-c').addEventListener('change', (e) => { rememberColor(e.target.value); setBorder({ borderC: e.target.value }); });
  fmt.menu = menu;
  syncBorderMenu();
}

function syncBorderMenu() {
  const t = borderTargets()[0], menu = fmt.menu;
  if (!t || !menu) return;
  const on = t.borderW > 0, sides = on ? t.borderSides ?? 'trbl' : '';
  for (const b of menu.querySelectorAll('[data-side]')) b.classList.toggle('on', sides.includes(b.dataset.side));
  menu.querySelector('[data-sides="trbl"]').classList.toggle('on', sides.length === 4);
  menu.querySelector('[data-sides=""]').classList.toggle('on', !on);
  for (const b of menu.querySelectorAll('[data-w]')) b.classList.toggle('on', on && +b.dataset.w === t.borderW);
  for (const b of menu.querySelectorAll('[data-r]')) b.classList.toggle('on', +b.dataset.r === (t.radius || 0));
  menu.querySelector('.bm-w').value = on ? t.borderW : '';
  menu.querySelector('.bm-c').value = /^#/.test(t.borderC || '') ? t.borderC : '#1a1a1a';
}

/* ---- reflecting the current state ---- */

function updateFormatBar() {
  const bar = fmtEl();
  if (!bar || !doc) return;
  const c = editingContent(), ts = selectedTiles();
  const active = !!c || ts.length > 0;
  bar.classList.toggle('inactive', !active);
  for (const el of bar.querySelectorAll('[data-f]')) el.disabled = !active;
  for (const el of bar.querySelectorAll('[data-edit-only]')) el.disabled = !c;

  // header / footer / bleed: available without a selection too
  const bt = bandTarget();
  bar.querySelector('[data-b=header]').classList.toggle('on', !!bandOf(bt, 'header'));
  bar.querySelector('[data-b=footer]').classList.toggle('on', !!bandOf(bt, 'footer'));
  for (const r of ['header', 'footer']) {
    bar.querySelector(`[data-b=${r}]`).title = `${bandOf(bt, r) ? 'Remove' : 'Add'} a ${r} — ${bt ? 'on this tile' : 'on the poster'}`;
  }
  const bt2 = borderTargets()[0];
  bar.querySelector('[data-b=border]').disabled = !bt2;
  bar.querySelector('[data-b=border]').classList.toggle('on', !!(bt2 && bt2.borderW > 0));
  const bleedT = state.editing ? byId(state.editing) : selectedTiles()[0] || scopeTile();
  bar.querySelector('[data-b=bleed]').disabled = !bleedT;
  bar.querySelector('[data-b=bleed]').classList.toggle('on', !!(bleedT && bleedT.bleed));

  // style options follow the design
  const opts = offeredStyles().map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  const sel = $('#fStyle');
  if (sel._opts !== opts) { sel.innerHTML = opts; sel._opts = opts; }
  if (!active) return;

  const t = c ? byId(state.editing) : ts[0];
  const look = lookOf(t).text;
  let node = null;
  if (c) {
    const s = getSelection();
    node = s.rangeCount && c.contains(s.anchorNode) ? s.anchorNode : c;
    if (node.nodeType !== 1) node = node.parentNode;
  } else {
    const le = els.get(look.id);
    node = le && le.firstChild;
  }
  const cs = node ? getComputedStyle(node) : null;
  const block = c && node ? blockOf(c, node) : null;
  const setv = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };

  setv('#fStyle', (block && block.dataset && block.dataset.ts) || look.ts || 'body');
  const fam = cs ? cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase() : '';
  const font = FONT_LIST.find(([, , css]) => css.split(',')[0].replace(/["']/g, '').trim().toLowerCase() === fam);
  setv('#fFont', c ? (font ? font[0] : '') : look.font || '');
  setv('#fSize', cs ? Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 : '');
  const on = (id, v) => bar.querySelector(`[data-f="${id}"]`).classList.toggle('on', !!v);
  on('bold', c ? document.queryCommandState('bold') : look.bold || (cs && +cs.fontWeight >= 600));
  on('italic', c ? document.queryCommandState('italic') : look.italic || (cs && cs.fontStyle === 'italic'));
  on('underline', c ? document.queryCommandState('underline') : look.underline);
  const align = cs ? cs.textAlign.replace('start', 'left') : '';
  for (const a of ['left', 'center', 'right', 'justify']) on('align-' + a, align === a);
  for (const v of ['top', 'middle', 'bottom']) on('valign-' + v, (t.vAlign || 'top') === v);
  $('#fColor').style.setProperty('--sw', cs ? cs.color : '#000');
  const fill = resolveBg(lookOf(t).fill.bg);
  $('#fFill').style.setProperty('--sw', fill || 'transparent');
  $('#fFill').classList.toggle('nofill', !fill);
  setv('#fLine', lookOf(t).text.leading || '');
  setv('#fSpace', t.ps ?? '');
  setv('#fCols', t.cols || 1);
}

/* ---- wiring ---- */

function bindFormatBar() {
  const bar = fmtEl();
  $('#fFont').innerHTML = fontOptions(true);
  // buttons never take focus, so the caret stays in the text
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') && !e.target.closest('.colormenu')) e.preventDefault();
  });
  bar.addEventListener('click', (e) => {
    const bb = e.target.closest('button[data-b]');
    if (bb && !bb.disabled) {
      if (bb.dataset.b === 'border') return fmt.menu ? closeColorMenu() : openBorderMenu(bb);
      return bb.dataset.b === 'bleed' ? fmtBleed() : fmtBand(bb.dataset.b);
    }
    const b = e.target.closest('button[data-f]');
    if (!b || b.disabled) return;
    const f = b.dataset.f;
    if (f === 'color' || f === 'fill') return fmt.menu ? closeColorMenu() : openColorMenu(b, f);
    if (f.startsWith('align-')) fmtText('align', f.slice(6));
    else if (f.startsWith('valign-')) fmtTile('vAlign', f.slice(7));
    else if (f === 'ul' || f === 'ol') fmtText('list', f);
    else if (f === 'size-up' || f === 'size-down') {
      const cur = parseFloat($('#fSize').value) || 24;
      const steps = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 108, 120, 144];
      const next = f === 'size-up' ? steps.find((s) => s > cur) || cur + 12 : [...steps].reverse().find((s) => s < cur) || Math.max(4, cur - 2);
      fmtText('size', next);
    } else fmtText(f);
  });
  $('#fStyle').addEventListener('change', (e) => fmtText('style', e.target.value));
  $('#fFont').addEventListener('change', (e) => fmtText('font', e.target.value));
  $('#fSize').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (v > 0) fmtText('size', v); });
  $('#fSize').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  $('#fLine').addEventListener('change', (e) => fmtTile('leading', e.target.value ? +e.target.value : null));
  $('#fSpace').addEventListener('change', (e) => fmtTile('ps', e.target.value === '' ? null : +e.target.value));
  $('#fCols').addEventListener('change', (e) => fmtTile('cols', +e.target.value));
  document.addEventListener('pointerdown', (e) => {
    if (fmt.menu && !fmt.menu.contains(e.target) && !e.target.closest('[data-f=color],[data-f=fill],[data-b=border]')) closeColorMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fmt.menu) closeColorMenu(); }, true);
}
