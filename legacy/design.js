'use strict';

/* =========================================================================
   Design ("master") settings: colour roles and text styles shared by the
   whole document. Tiles refer to them ("@tile", data-ts="h2"), so changing
   the design restyles everything that uses it.
   ========================================================================= */

/* Font catalogue: [id, label, CSS stack, Google Fonts family, weights]. */
const FONT_LIST = [
  ['sans', 'System sans', 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'],
  ['serif', 'System serif', 'Georgia, "Times New Roman", serif'],
  ['mono', 'Monospace', 'ui-monospace, Consolas, "Courier New", monospace'],
  ['condensed', 'Condensed', '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif'],
  ['inter', 'Inter', '"Inter", system-ui, sans-serif', 'Inter', '400;500;600;700;800'],
  ['montserrat', 'Montserrat', '"Montserrat", system-ui, sans-serif', 'Montserrat', '400;500;600;700;800'],
  ['lato', 'Lato', '"Lato", system-ui, sans-serif', 'Lato', '400;700;900'],
  ['raleway', 'Raleway', '"Raleway", system-ui, sans-serif', 'Raleway', '400;500;600;700;800'],
  ['oswald', 'Oswald', '"Oswald", "Arial Narrow", sans-serif', 'Oswald', '400;500;600;700'],
  ['roboto-slab', 'Roboto Slab', '"Roboto Slab", Georgia, serif', 'Roboto Slab', '400;500;600;700;800'],
  ['merriweather', 'Merriweather', '"Merriweather", Georgia, serif', 'Merriweather', '400;700;900'],
  ['playfair', 'Playfair Display', '"Playfair Display", Georgia, serif', 'Playfair Display', '400;500;600;700;800'],
  ['source-serif', 'Source Serif', '"Source Serif 4", Georgia, serif', 'Source Serif 4', '400;500;600;700;800'],
  ['libre-baskerville', 'Libre Baskerville', '"Libre Baskerville", Georgia, serif', 'Libre Baskerville', '400;700'],
];
const FONTS = Object.fromEntries(FONT_LIST.map(([id, , css]) => [id, css]));
const WEIGHTS = [['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold']];

/* Colour roles. Tiles store "@role" instead of a colour to follow the design. */
const ROLES = [
  ['paper', 'Paper', { textless: true }],
  ['tile', 'Tiles'],
  ['header', 'Poster header'],
  ['footer', 'Poster footer'],
  ['tileHeader', 'Tile headers'],
  ['tileFooter', 'Tile footers'],
];

/* The built-in text styles; more can be added with "+ Add text style". */
const BASE_STYLES = [
  ['title', 'Title', 'montserrat', 72, '800'],
  ['subtitle', 'Subtitle', 'montserrat', 36, '500'],
  ['body', 'Body', 'sans', 24, '400', { color: '#1a1a1a' }],
  ['h1', 'Heading 1', 'montserrat', 44, '700'],
  ['h2', 'Heading 2', 'montserrat', 36, '700'],
  ['h3', 'Heading 3', 'montserrat', 30, '600'],
  ['h4', 'Heading 4', 'montserrat', 26, '600'],
  ['h5', 'Heading 5', 'montserrat', 24, '600', { upper: true }],
];
const isBaseStyle = (id) => BASE_STYLES.some((b) => b[0] === id);

function defaultDesign() {
  const s = (id, name, font, size, weight, extra = {}) =>
    ({ id, name, font, size, weight, italic: false, upper: false, color: '', enabled: false, ...extra });
  return {
    colors: {
      paper: { bg: '#ffffff', text: '' },
      tile: { bg: '#f1f3f5', text: '' },
      header: { bg: '#1f3a5f', text: '#ffffff' },
      footer: { bg: '#1f3a5f', text: '#ffffff' },
      tileHeader: { bg: '', text: '' },
      tileFooter: { bg: '', text: '' },
    },
    styles: BASE_STYLES.map(([id, name, font, size, weight, extra]) => s(id, name, font, size, weight, { enabled: true, ...extra })),
    recent: [],     // colour history: every colour picked, newest first
    v: 2,
  };
}

/* Fill in anything missing (older documents, new roles/styles). */
function normalizeDesign(d) {
  const base = defaultDesign();
  d = d || {};
  d.colors = Object.assign(base.colors, d.colors || {});
  if (d.v !== 2) d.styles = [];   // the first design version had a different style set
  const have = new Map((d.styles || []).map((s) => [s.id, s]));
  d.styles = base.styles.map((s) => Object.assign(s, have.get(s.id) || {}))
    .concat((d.styles || []).filter((s) => !isBaseStyle(s.id)));
  d.recent = d.recent || [];
  d.v = 2;
  return d;
}

/* ---------------------------------------------------------------- colour history */

/* Remember a picked colour; every colour input offers the design colours and
   this history as swatches (via a shared <datalist>). */
function rememberColor(c) {
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) return;
  const r = doc.design.recent;
  const i = r.indexOf(c.toLowerCase());
  if (i === 0) return;
  if (i > 0) r.splice(i, 1);
  r.unshift(c.toLowerCase());
  r.length = Math.min(r.length, 16);
  updateSwatches();
}

let swatchKey = '';
function updateSwatches() {
  const d = doc.design, seen = new Set();
  const list = [];
  for (const c of Object.values(d.colors)) for (const v of [c.bg, c.text]) if (v) list.push(v.toLowerCase());
  list.push(...d.recent);
  const uniq = list.filter((c) => !seen.has(c) && seen.add(c));
  const key = uniq.join();
  if (key === swatchKey) return;
  swatchKey = key;
  $('#swatches').innerHTML = uniq.map((c) => `<option value="${c}"></option>`).join('');
}

const styleById = (id) => doc.design.styles.find((s) => s.id === id);
const offeredStyles = () => doc.design.styles.filter((s) => s.enabled || s.id === 'body');

/* "@role" → the design colour; "#hex" → itself; "" → none. */
function resolveBg(v) {
  if (v && v[0] === '@') return (doc.design.colors[v.slice(1)] || {}).bg || '';
  return v || '';
}
function resolveText(v) {
  if (v && v[0] === '@') return (doc.design.colors[v.slice(1)] || {}).text || '';
  return v || '';
}

/* ---------------------------------------------------------------- style sheet */

function styleDecl(s) {
  return `font-family:${FONTS[s.font] || FONTS.sans};font-size:${s.size}pt;font-weight:${s.weight};` +
    `font-style:${s.italic ? 'italic' : 'normal'};text-transform:${s.upper ? 'uppercase' : 'none'};` +
    (s.color ? `color:${s.color};` : '');
}

function designCSS() {
  const body = styleById('body');
  let css = `.paper{${styleDecl(body)}}\n`;
  for (const s of doc.design.styles) {
    css += `.tile>.content[data-ts="${s.id}"],.tile>.content [data-ts="${s.id}"],.fmt [data-ts="${s.id}"]{${styleDecl(s)}}\n`;
  }
  return css;
}

let designKey = null;
function applyDesignCSS() {
  updateSwatches();
  const key = JSON.stringify(doc.design);
  if (key === designKey) return;
  designKey = key;
  $('#designStyle').textContent = designCSS();
}

function loadFonts() {
  for (const [id, , , family, weights] of FONT_LIST) {
    if (!family || document.getElementById('font-' + id)) continue;
    const link = document.createElement('link');
    link.id = 'font-' + id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights}&display=swap`;
    document.head.appendChild(link);
  }
  // text metrics change once web fonts arrive
  if (document.fonts) document.fonts.ready.then(() => render());
}

/* ---------------------------------------------------------------- design tab */

const fontOptions = (withDefault) =>
  (withDefault ? '<option value="">Default font</option>' : '') +
  FONT_LIST.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');

function renderDesignTab() {
  const d = doc.design;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  $('#colorRoles').innerHTML = ROLES.map(([id, label, opt = {}]) => {
    const c = d.colors[id];
    return `<div class="role" data-role="${id}">
      <span class="role-name">${label}</span>
      <label title="Background"><input type="color" data-k="bg" value="${c.bg || '#ffffff'}"${c.bg ? '' : ' class="off"'}></label>
      <label class="check mini"><input type="checkbox" data-k="bgNone"${c.bg ? '' : ' checked'}> none</label>
      ${opt.textless ? '<span></span><span></span>' : `
      <label title="Text colour"><input type="color" data-k="text" value="${c.text || '#1a1a1a'}"${c.text ? '' : ' class="off"'}></label>
      <label class="check mini"><input type="checkbox" data-k="textAuto"${c.text ? '' : ' checked'}> auto</label>`}
    </div>`;
  }).join('');

  updateSwatches();
  $('#styleList').innerHTML = d.styles.map((s) => `
    <div class="style-card${s.enabled ? '' : ' disabled'}" data-style="${s.id}">
      <div class="row">
        ${s.id === 'body' ? '<span class="lock" title="Body text is always available">•</span>'
          : `<input type="checkbox" data-k="enabled"${s.enabled ? ' checked' : ''} title="Offer this style in the poster">`}
        <input type="text" data-k="name" value="${esc(s.name)}" title="Name shown when writing">
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
      <div class="fmt sample"><span data-ts="${s.id}">${esc(s.name)}</span></div>
    </div>`).join('') + '<button id="addStyle" class="add">+ Add text style</button>';
  for (const el of $('#tabDesign').querySelectorAll('input[type=color]')) el.setAttribute('list', 'swatches');
  for (const card of document.querySelectorAll('.style-card')) {
    const s = styleById(card.dataset.style);
    card.querySelector('[data-k=font]').value = s.font;
    card.querySelector('[data-k=weight]').value = s.weight;
  }
}

function bindDesignTab() {
  const update = (e, final) => {
    const el = e.target, k = el.dataset.k;
    if (!k) return;
    const role = el.closest('[data-role]'), card = el.closest('[data-style]');
    if (role) {
      const c = doc.design.colors[role.dataset.role];
      const row = (key) => role.querySelector(`[data-k=${key}]`);
      if (k === 'bg') { c.bg = el.value; row('bgNone').checked = false; el.classList.remove('off'); }
      if (k === 'bgNone') { c.bg = el.checked ? '' : row('bg').value; row('bg').classList.toggle('off', el.checked); }
      if (k === 'text') { c.text = el.value; row('textAuto').checked = false; el.classList.remove('off'); }
      if (k === 'textAuto') { c.text = el.checked ? '' : row('text').value; row('text').classList.toggle('off', el.checked); }
    } else if (card) {
      const s = styleById(card.dataset.style);
      const field = (key) => card.querySelector(`[data-k=${key}]`);
      if (k === 'enabled') { s.enabled = el.checked; card.classList.toggle('disabled', !el.checked); }
      else if (k === 'name') { s.name = el.value || s.id; card.querySelector(".sample span").textContent = s.name; }
      else if (k === 'size') { const v = parseFloat(el.value); if (v > 0) s.size = v; }
      else if (k === 'italic' || k === 'upper') s[k] = el.checked;
      else if (k === 'color') { s.color = el.value; field('colorAuto').checked = false; el.classList.remove('off'); }
      else if (k === 'colorAuto') { s.color = el.checked ? '' : field('color').value; field('color').classList.toggle('off', el.checked); }
      else s[k] = el.value;
    }
    render();
    if (final) commit();
  };
  $('#tabDesign').addEventListener('click', (e) => {
    if (e.target.id === 'addStyle') {
      const id = 'c' + uid();
      doc.design.styles.push({ id, name: 'New style', font: 'montserrat', size: 32, weight: '700',
        italic: false, upper: false, color: '', enabled: true });
      commit(); render(); renderDesignTab();
      const name = document.querySelector(`[data-style="${id}"] [data-k=name]`);
      name.focus(); name.select();
    } else if (e.target.dataset.del !== undefined) {
      const id = e.target.closest('[data-style]').dataset.style;
      doc.design.styles = doc.design.styles.filter((x) => x.id !== id);
      commit(); render(); renderDesignTab();
    }
  });
  $('#tabDesign').addEventListener('input', (e) => update(e, false));
  $('#tabDesign').addEventListener('change', (e) => update(e, true));
  $('#designReset').addEventListener('click', () => {
    if (!confirm('Reset all colours and text styles to the defaults?')) return;
    doc.design = defaultDesign();
    commit(); render(); renderDesignTab();
  });

  for (const b of document.querySelectorAll('.tabs [data-tab]')) {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  }
}

function showTab(name) {
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.classList.toggle('on', b.dataset.tab === name);
  $('#tabLayout').hidden = name !== 'layout';
  $('#tabDesign').hidden = name !== 'design';
  if (name === 'design') renderDesignTab();
}

/* ---------------------------------------------------------------- format bar */

/* Wrap loose inline content of an editable element into block <div>s so each
   paragraph can carry its own style; keeps the selection where it was. */
function blockify(c) {
  const sel = getSelection();
  const keep = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
  const isBlock = (n) => n.nodeType === 1 && /^(DIV|P|H[1-6]|UL|OL|LI|BLOCKQUOTE)$/.test(n.nodeName);
  let run = null;
  for (const n of [...c.childNodes]) {
    if (isBlock(n)) { run = null; continue; }
    if (!run) { run = document.createElement('div'); c.insertBefore(run, n); }
    run.appendChild(n);
    if (n.nodeName === 'BR') run = null;
  }
  if (keep) sel.setBaseAndExtent(...keep);
}

function applyBlockStyle(id) {
  const t = byId(state.editing);
  if (!t) return;
  const c = els.get(t.id).firstChild;
  blockify(c);
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const blocks = [...c.children].filter((b) => range.intersectsNode(b));
  for (const b of blocks) {
    // "body" is explicit only when the tile's own style is something else
    if (id === 'body' && !t.ts) delete b.dataset.ts; else b.dataset.ts = id;
  }
}
