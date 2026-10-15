// Browser tests: drive the built app (dist/index.html) with real mouse and
// keyboard input. Run with `npm run test:e2e`. Needs Chrome or Chromium:
// set CHROME_PATH if it isn't found automatically.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import puppeteer from 'puppeteer-core';

const CHROMES = [
  process.env.CHROME_PATH,
  '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome', '/snap/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = CHROMES.find((p) => p && existsSync(p));

let server, browser, page, url;
const errors = [];

before(async () => {
  assert.ok(executablePath, 'Chrome/Chromium not found — set CHROME_PATH');
  const html = await readFile(new URL('../../dist/index.html', import.meta.url));
  server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  server?.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.imposters);
  // the geometry these tests were written for: 20 mm margins, 10 mm gaps, 4 mm inside tiles
  await page.evaluate(() => {
    const { editor, render } = window.imposters, d = editor.doc;
    Object.assign(d.paper, { margin: 20, gutter: 10, gutterY: 10 });
    Object.assign(d.design, { localGutter: 4, localGutterY: 4 });
    for (const t of d.tiles) Object.assign(t, { x: 20, w: d.paper.w - 40 });
    render();
  });
});

/* ---- helpers ---- */

/** Screen position of a point on the paper (mm). */
const at = (x, y) => page.evaluate(([x, y]) => {
  const r = document.getElementById('paper').getBoundingClientRect();
  const k = window.imposters.editor.view.zoom * 96 / 25.4;
  return [r.left + x * k, r.top + y * k];
}, [x, y]);

const state = (fn) => page.evaluate(fn);
const click = async (x, y, opts) => { const [sx, sy] = await at(x, y); await page.mouse.click(sx, sy, opts); };
const move = async (x, y) => { const [sx, sy] = await at(x, y); await page.mouse.move(sx, sy); };
const addBody = () => page.click('[data-act=add-text]'); // fills 20..574 × 130..791

/* ---- tests ---- */

test('starts with a header and footer, without errors', async () => {
  const roles = await state(() => window.imposters.editor.doc.tiles.map((t) => t.role));
  assert.deepEqual(roles, ['header', 'footer']);
  assert.deepEqual(errors, []);
});

test('one click on a text tile starts typing; Esc keeps the text', async () => {
  await addBody();
  await click(300, 400);
  assert.ok(await state(() => window.imposters.editor.view.editing));
  await page.keyboard.type('Hello poster');
  await page.keyboard.press('Escape');
  const html = await state(() => window.imposters.editor.doc.tiles.at(-1).html);
  assert.equal(html, 'Hello poster');
});

test('a double-click goes inside a tile; double-clicking while typing selects a word', async () => {
  const body = await state(() => { window.imposters.actions.addTile('text', { html: '<div>Some words here</div>' }); return window.imposters.editor.doc.tiles.at(-1).id; });
  await page.keyboard.press('Escape');
  const [sx, sy] = await at(300, 400);
  await page.mouse.click(sx, sy, { clickCount: 1 });
  await page.mouse.click(sx, sy, { clickCount: 2 });
  let v = await state(() => ({ scope: window.imposters.editor.view.scope, editing: !!window.imposters.editor.view.editing }));
  assert.deepEqual(v, { scope: body, editing: false });
  assert.equal(await page.$eval('#mask', (m) => getComputedStyle(m).display), 'block'); // the rest is greyed out
  // inside: click to type, and a later double-click selects a word (it doesn't go deeper)
  await page.mouse.click(sx, sy);
  await new Promise((r) => setTimeout(r, 700));
  await page.mouse.click(sx, sy, { clickCount: 1 });
  await page.mouse.click(sx, sy, { clickCount: 2 });
  v = await state(() => ({ scope: window.imposters.editor.view.scope, editing: !!window.imposters.editor.view.editing }));
  assert.deepEqual(v, { scope: body, editing: true });
});

test('Ctrl+Shift + click on an edge splits; Ctrl+Alt+Shift splits into equal parts; Shift-click selects', async () => {
  await addBody();
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await move(300, 789); // bottom edge, near the middle → ½
  await click(300, 789);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  let widths = await state(() => window.imposters.editor.doc.tiles.filter((t) => !t.role).map((t) => Math.round(t.w)));
  assert.deepEqual(widths, [272, 272]);

  await page.keyboard.down('Control');
  await page.keyboard.press('z');
  await page.keyboard.up('Control');
  await page.keyboard.press('3');
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await move(300, 789);
  await click(300, 789);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  widths = await state(() => window.imposters.editor.doc.tiles.filter((t) => !t.role).map((t) => Math.round(t.w)));
  assert.deepEqual(widths, [178, 178, 178]);

  // Shift alone: no split points; Shift-click selects several
  await page.keyboard.down('Shift');
  await move(300, 789);
  assert.equal(await page.$$eval('#hover .plus', (p) => p.length), 0);
  await click(100, 400);
  await click(300, 400);
  await page.keyboard.up('Shift');
  assert.equal(await state(() => window.imposters.editor.view.selected.size), 2);
});

test('cutting the header divides its contents into a square and keeps one zone', async () => {
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await move(122, 118);
  await click(122, 118);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  const h = await state(() => {
    const t = window.imposters.editor.doc.tiles[0];
    return { top: window.imposters.editor.doc.tiles.length, bg: t.bg, kids: t.children.map((k) => Math.round(k.w)) };
  });
  assert.deepEqual(h, { top: 2, bg: '@header', kids: [100, 450] }); // a true square (bleed included), 4 mm apart
});

test('formatting toolbar styles the selected tile', async () => {
  await addBody();
  await page.keyboard.press('Escape'); // keep the tile selected, not typing
  await page.click('[data-f=bold]');
  await page.click('[data-f=align-center]');
  const t = await state(() => { const t = window.imposters.editor.doc.tiles.at(-1); return [t.bold, t.align]; });
  assert.deepEqual(t, [true, 'center']);
});

test('inside a tile, Split divides that tile (not the poster)', async () => {
  await addBody();
  const top = await state(() => window.imposters.editor.doc.tiles.length);
  await page.keyboard.press('Escape');
  const [x, y] = await at(300, 400);
  await page.mouse.click(x, y, { clickCount: 1 });
  await page.mouse.click(x, y, { clickCount: 2 }); // go inside the body tile
  await page.waitForFunction(() => window.imposters.editor.view.scope);
  assert.equal(await page.$eval('[data-act=split-v]', (b) => b.disabled), false);
  await page.click('[data-act=split-v]');
  const r = await state(() => {
    const { editor } = window.imposters, scope = editor.doc.tiles.find((t) => t.id === editor.view.scope);
    return { top: editor.doc.tiles.length, inside: scope.children.filter((k) => !k.role).length };
  });
  assert.deepEqual(r, { top, inside: 2 });
  assert.deepEqual(errors, []);
});

test('dragging a header edge snaps to the header next door, and the tile under it follows', async () => {
  const ids = await state(() => {
    const { editor, actions, render } = window.imposters;
    const a = actions.addTile('text', { x: 20, y: 130, w: 272, h: 400, html: '<div>A</div>' });
    actions.setBand(a, 'header', true);
    const b = actions.addTile('text', { x: 302, y: 130, w: 272, h: 400, html: '<div>B</div>' });
    actions.setBand(b, 'header', true);
    b.children.find((k) => k.role).h = 60;
    b.lw = null;
    const ah = a.children.find((k) => k.role);
    editor.view.scope = a.id;
    editor.view.selected = new Set([ah.id]);
    render();
    return { a: a.id, ah: ah.id, h0: ah.h };
  });
  const handle = await page.evaluate((id) => { const r = document.querySelector(`[data-id="${id}"] > [data-handle="s"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, ids.ah);
  const k = await state(() => window.imposters.editor.view.zoom * 96 / 25.4);
  await page.mouse.move(handle[0], handle[1]);
  await page.mouse.down();
  await page.mouse.move(handle[0], handle[1] + (60 - ids.h0 - 1.5) * k, { steps: 8 }); // 1.5 mm short
  await page.mouse.up();
  const r = await page.evaluate((a) => {
    const t = window.imposters.editor.doc.tiles.find((x) => x.id === a), band = t.children.find((c) => c.role), under = t.children.find((c) => !c.role);
    return { band: Math.round(band.h * 10) / 10, under: Math.round(under.y * 10) / 10, bottom: Math.round((under.y + under.h) * 10) / 10, h: t.h };
  }, ids.a);
  assert.deepEqual(r, { band: 60, under: 64, bottom: 400, h: 400 }); // the tile under it follows, 4 mm below
});

test('borders: by kind in the design, a tile\'s own from the Border menu (also inside a tile)', async () => {
  await addBody();
  await page.keyboard.press('Escape');
  const border = (sel) => page.$eval(sel, (e) => getComputedStyle(e).borderBottomWidth + ' ' + getComputedStyle(e).borderBottomStyle);
  const bodyId = await state(() => window.imposters.editor.doc.tiles.at(-1).id);
  // global: every tile on the poster
  await page.click('#designBtn');
  await page.click('.delements [data-el=tiles]'); // Global → the poster's tiles
  await page.$eval('[data-border="global"] [data-k=w]', (i) => { i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.notEqual(await border(`[data-id="${bodyId}"]`), '0px none');
  await page.click('#masterClose'); // back to the poster
  // inside the tile: Border acts on it; its own border wins, and can go back to the design's
  const [x, y] = await at(300, 400);
  await page.mouse.click(x, y, { clickCount: 1 });
  await page.mouse.click(x, y, { clickCount: 2 });
  await page.waitForFunction(() => window.imposters.editor.view.scope);
  assert.equal(await page.$eval('[data-b=border]', (b) => b.disabled), false);
  await page.click('[data-b=border]');
  await page.click('.bordermenu [data-w="3"]');
  let t = await state(() => window.imposters.editor.doc.tiles.find((x) => x.id === window.imposters.editor.view.scope));
  assert.deepEqual([t.ownBorder, t.borderW], [true, 3]);
  await page.click('.bordermenu [data-design]');
  t = await state(() => window.imposters.editor.doc.tiles.find((x) => x.id === window.imposters.editor.view.scope));
  assert.equal(t.ownBorder, false);
  assert.deepEqual(errors, []);
});

test('merge: the selected tiles go inside one tile, contents kept and touching; not when another tile is in the way', async () => {
  await addBody();
  await page.keyboard.press('Escape');
  await page.keyboard.press('3');
  await state(() => { const ed = window.imposters.editor; ed.view.selected = new Set([ed.doc.tiles.at(-1).id]); window.imposters.render(); });
  await page.click('[data-act=split-v]'); // three columns on the poster
  const ids = await state(() => {
    const ts = window.imposters.editor.doc.tiles.filter((t) => !t.role);
    ts.forEach((t, i) => { t.html = `<div>part ${i + 1}</div>`; });
    window.imposters.render();
    return ts.map((t) => t.id);
  });
  const top = () => state(() => window.imposters.editor.doc.tiles.filter((t) => !t.role).map((t) =>
    [Math.round(t.w), t.html, (t.children ?? []).map((k) => [Math.round(k.x), Math.round(k.w), k.html])]));
  // the outer two: the middle one is in the way
  await page.evaluate((ids) => { const v = window.imposters.editor.view; v.selected = new Set([ids[0], ids[2]]); window.imposters.render(); }, ids);
  await page.click('[data-act=merge]');
  assert.equal((await top()).length, 3);
  // the first two: one tile with both inside it, side by side, touching
  await page.evaluate((ids) => { const v = window.imposters.editor.view; v.selected = new Set([ids[0], ids[1]]); window.imposters.render(); }, ids);
  await page.keyboard.press('m');
  assert.deepEqual(await top(), [
    [366, '', [[0, 181, '<div>part 1</div>'], [185, 181, '<div>part 2</div>']]], // 4 mm apart inside
    [178, '<div>part 3</div>', []],
  ]);
});

test('merge keeps what is being typed and divided tiles; merging the pieces of a split makes one tile again', async () => {
  // a tile split on the poster into two pieces; the left one divided inside
  await state(() => {
    const { editor, actions } = window.imposters;
    const t = actions.addTile('text', { x: 20, y: 130, w: 554, h: 400, html: '<div>left</div>' });
    editor.view.selected = new Set([t.id]);
    actions.splitSelected(true);
    const [l, r] = editor.doc.tiles.filter((x) => !x.role);
    r.html = '<div>right</div>';
    actions.enterTile(l);
    editor.view.selected = new Set([l.children[0].id]);
    actions.splitSelected(false);
    l.children[1].html = '<div>left below</div>';
    actions.exitScope();
    window.imposters.render();
  });
  // type in the right piece, then Shift-click the left one and merge: nothing is lost
  const [x, y] = await at(450, 300);
  await page.mouse.click(x, y);
  await page.keyboard.type(' and more');
  await page.keyboard.down('Shift');
  await click(150, 300);
  await page.keyboard.up('Shift');
  await page.keyboard.press('m');
  const r = await state(() => {
    const ts = window.imposters.editor.doc.tiles.filter((t) => !t.role);
    const kids = (t) => (t.children ?? []).map((k) => ({ w: Math.round(k.w), html: k.html, kids: kids(k) }));
    return ts.map((t) => ({ w: Math.round(t.w), kids: kids(t) }));
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].w, 554); // the whole width again
  const [left, right] = r[0].kids;
  assert.equal(left.kids.length, 2); // still divided
  assert.equal(left.kids[1].html, '<div>left below</div>');
  assert.match(right.html, /right and more/);
  assert.equal(left.w + right.w + 4, 554); // the inside-tile gutter between them
  assert.deepEqual(errors, []);
});

test('making a tile smaller takes the unused room of the tiles inside it first', async () => {
  const long = '<div>' + 'Lots of text that more than fills its tile. '.repeat(150) + '</div>';
  const r = await page.evaluate((long) => {
    const { editor, actions, render } = window.imposters;
    const t = actions.addTile('text', { x: 20, y: 130, w: 300, h: 600, html: '<div>Short.</div>' });
    actions.enterTile(t);
    editor.view.selected = new Set([t.children[0].id]);
    actions.splitSelected(false); // two rows of 300 mm
    t.children[1].html = long;
    actions.exitScope();
    render();
    const fullBefore = t.children[1].h, shortBefore = t.children[0].h;
    t.h = 450; // 150 mm smaller
    render();
    return { short: Math.round(t.children[0].h), full: Math.round(t.children[1].h), fullBefore: Math.round(fullBefore), shortBefore: Math.round(shortBefore) };
  }, long);
  assert.equal(r.full, r.fullBefore); // the full tile keeps its height
  assert.equal(r.short, r.shortBefore - 150); // the short one gave up its empty room
});

test('Ctrl+Alt + drag on the line between tiles opens space between them; with Shift between all of them', async () => {
  const id = await state(() => {
    const { editor, actions, render } = window.imposters;
    editor.doc.design.localGutter = 0; // touching columns to start with
    const t = actions.addTile('text', { x: 20, y: 130, w: 300, h: 300, html: '<div>x</div>' });
    actions.enterTile(t);
    editor.view.parts = 3;
    editor.view.selected = new Set();
    actions.splitSelected(true); // three touching columns of 100 mm inside
    editor.view.selected = new Set();
    render();
    return t.id;
  });
  const cols = () => page.evaluate((id) => window.imposters.editor.doc.tiles.find((t) => t.id === id).children.map((k) => [Math.round(k.x), Math.round(k.w)]), id);
  assert.deepEqual(await cols(), [[0, 100], [100, 100], [200, 100]]);
  const k = await state(() => window.imposters.editor.view.zoom * 96 / 25.4);
  const drag = async (mods, dx) => {
    const [x, y] = await at(20 + 100, 280); // on the line between the first two columns
    await page.mouse.move(x, y);
    for (const m of mods) await page.keyboard.down(m); // the hover follows the keys
    await page.mouse.down();
    await page.mouse.move(x + dx * k, y, { steps: 5 });
    await page.mouse.up();
    for (const m of [...mods].reverse()) await page.keyboard.up(m);
  };
  await drag(['Control', 'Alt'], 5); // that gap: 5 mm off each side
  assert.deepEqual(await cols(), [[0, 95], [105, 95], [200, 100]]);
  await drag(['Control', 'Alt', 'Shift'], 8); // every gap 8 mm more each side
  assert.deepEqual(await cols(), [[0, 87], [113, 79], [208, 92]]);
});

test('Design → Spacing sets the gap between the poster\'s tiles and the smaller one inside tiles', async () => {
  const id = await state(() => {
    const { editor, actions, render } = window.imposters;
    const t = actions.addTile('text', { x: 20, y: 130, w: 554, h: 661, html: '<div>x</div>' });
    actions.enterTile(t);
    editor.view.selected = new Set();
    actions.splitSelected(true);
    actions.exitScope();
    render();
    return t.id;
  });
  const gaps = () => page.evaluate((id) => {
    const doc = window.imposters.editor.doc, t = doc.tiles.find((x) => x.id === id), [a, b] = t.children;
    return { inside: Math.round((b.x - (a.x + a.w)) * 10) / 10, belowHeader: Math.round((t.y - 120) * 10) / 10 };
  }, id);
  assert.deepEqual(await gaps(), { inside: 4, belowHeader: 10 });
  await page.click('#designBtn');
  const set = (k, ax, v) => page.$eval(`[data-k=${k}][data-ax=${ax}]`, (i, v) => { i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  await page.click('[data-group=local]'); // Local → tiles inside tiles
  await set('gutterLocal', 'x', '6'); // across: between the side-by-side tiles inside
  await page.click('[data-group=global]'); // Global → paper & spacing
  await set('gutterGlobal', 'y', '16'); // down: between the header and the tile below it
  assert.deepEqual(await gaps(), { inside: 6, belowHeader: 16 });
  await set('gutterGlobal', 'x', '12'); // across on the poster: no side-by-side tiles here, nothing moves down
  assert.deepEqual(await gaps(), { inside: 6, belowHeader: 16 });
  assert.deepEqual(await state(() => { const { paper, design } = window.imposters.editor.doc; return [paper.gutter, paper.gutterY, design.localGutter, design.localGutterY]; }), [12, 16, 6, 4]);
});

test('a merged tile of divided tiles shrinks into its empty room; no text gets cut off', async () => {
  const r = await state(() => {
    const { editor, actions, render } = window.imposters;
    const make = (x) => {
      const t = actions.addTile('text', { x, y: 130, w: 272, h: 600, html: '<div>one</div><div>two</div><div>three</div><div>four</div><div>five</div><div>six</div>' });
      actions.enterTile(t);
      editor.view.selected = new Set();
      actions.splitSelected(false);
      t.children[1].html = '<div>Another short line.</div>';
      actions.exitScope();
      return t;
    };
    const a = make(20), b = make(302);
    editor.view.selected = new Set([a.id, b.id]);
    actions.mergeSelected();
    const box = editor.doc.tiles.find((t) => t.children?.includes(a));
    render();
    // just enough height for six lines above one: shrinking in proportion would cut the six off
    const need = (el) => el.querySelector(':scope > .content').scrollHeight / (96 / 25.4);
    const [top, bottom] = a.children.map((k) => need(document.querySelector(`[data-id="${k.id}"]`)));
    box.h = top + bottom + editor.doc.design.localGutter + 2;
    render();
    const leaves = [...document.querySelectorAll(`[data-id="${box.id}"] .tile:not(.section)`)];
    return leaves.map((el) => el.offsetHeight >= el.querySelector(':scope > .content').scrollHeight - 1);
  });
  assert.equal(r.length, 4);
  assert.deepEqual(r, [true, true, true, true]);
});

test('vertical position of text works, also in text columns', async () => {
  for (const cols of [1, 2]) {
    const off = await state((cols) => {
      const { editor, actions, render } = window.imposters;
      const t = actions.addTile('text', { x: 20, y: 130, w: 300, h: 300, html: '<div>Short text in a tall tile.</div>', cols, vAlign: 'bottom' });
      editor.view.selected = new Set(); render();
      const el = document.querySelector(`[data-id="${t.id}"]`), words = el.querySelector(':scope > .content > div');
      const tile = el.getBoundingClientRect(), text = words.getBoundingClientRect();
      editor.view.selected = new Set([t.id]); actions.deleteSelected();
      return (text.top - tile.top) / tile.height; // where the words start, as a share of the tile's height
    }, cols);
    assert.ok(off > 0.5, `text in the lower half (${cols} column${cols > 1 ? 's' : ''}): starts at ${Math.round(off * 100)} %`);
  }
});

test('a tile can\'t be made smaller than its text: dragging further stretches like a rubber band and springs back', async () => {
  const id = await state(() => {
    const { editor, actions, render } = window.imposters;
    const t = actions.addTile('text', { x: 20, y: 130, w: 272, h: 300, html: '<div>one</div><div>two</div><div>three</div>' });
    editor.view.selected = new Set([t.id]); render();
    return t.id;
  });
  const need = await page.evaluate((id) => document.querySelector(`[data-id="${id}"] > .content`).scrollHeight / (96 / 25.4), id);
  const handle = await page.evaluate((id) => { const r = document.querySelector(`[data-id="${id}"] > [data-handle="s"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, id);
  const k = await state(() => window.imposters.editor.view.zoom * 96 / 25.4);
  const h = () => page.evaluate((id) => window.imposters.editor.doc.tiles.find((t) => t.id === id).h, id);
  await page.mouse.move(handle[0], handle[1]);
  await page.mouse.down();
  await page.mouse.move(handle[0], handle[1] - 290 * k, { steps: 10 }); // far past the text
  const during = await h();
  assert.ok(during < need && during > need - 13, `stretches a little past the text: ${during} vs ${need}`);
  await page.mouse.up();
  assert.ok(Math.abs(await h() - need) < 0.5, 'springs back to the height the text needs');
  // typing a smaller height is refused too
  await page.click('#panelBtn');
  await page.$eval('#tH', (i) => { i.value = '5'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.ok(Math.abs(await h() - need) < 0.5);
});

test('design colours restyle the poster', async () => {
  await page.click('#designBtn');
  await page.click('.delements [data-el=banner]');
  await page.evaluate(() => {
    const e = document.querySelector('[data-role=header] [data-k=bg]');
    e.value = '#aa2244';
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.tile .bleed')).backgroundColor);
  assert.equal(bg, 'rgb(170, 34, 68)');
  assert.deepEqual(errors, []);
});

test('design: the master poster has every kind of element; clicking one opens its settings, which change the poster', async () => {
  await addBody();
  await page.keyboard.press('Escape');
  await page.click('#designBtn');
  assert.equal(await page.$eval('#master', (m) => m.hidden), false);
  assert.equal(await page.$eval('#stage', (s) => getComputedStyle(s).display), 'none');
  // one of every element
  const has = await page.evaluate(() => {
    const m = document.querySelector('#masterTiles');
    return ['h1', 'h2', 'h3', 'caption', 'tileTitle', 'title'].every((id) => m.querySelector(`[data-ts="${id}"]`)) && !!m.querySelector('table') && !!m.querySelector('[data-el=palette]') && !!m.querySelector('ul') && !!m.querySelector('ol');
  });
  assert.equal(has, true);
  // a heading: its text style, under Text & colour; every heading 2 is outlined
  await page.click('#masterTiles [data-ts="h2"]');
  assert.equal(await page.$eval('.dgroups .on', (b) => b.dataset.group), 'shared');
  assert.deepEqual(await page.$$eval('.dpanel .style-card', (c) => c.map((x) => x.dataset.style)), ['h2']);
  assert.ok(await page.$$eval('#masterTiles .master-pick[data-ts="h2"]', (x) => x.length) >= 1);
  await page.$eval('.dpanel [data-k=size]', (i) => { i.value = '40'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await state(() => window.imposters.editor.doc.design.styles.find((s) => s.id === 'h2').size), 40);
  // a tile inside a tile: the local settings
  await page.evaluate(() => document.querySelector('#masterTiles [data-ts="caption"]').closest('.kids > .tile, .tile').click());
  await page.click('[data-group=local]');
  assert.equal(await page.$eval('.delements .on', (b) => b.dataset.el), 'local');
  // the palette: Paul Tol's schemes; the poster's scheme changes
  await page.click('#masterTiles [data-el=palette]');
  await page.click('.pal[data-palette=vibrant]');
  assert.equal(await state(() => window.imposters.editor.doc.design.palette), 'vibrant');
  assert.equal(await page.$eval('#masterTiles [data-el=palette] span', (s) => getComputedStyle(s).backgroundColor), 'rgb(238, 119, 51)');
  // the banner, as a whole
  await page.click('#masterTiles .tile');
  assert.equal(await page.$eval('.delements .on', (b) => b.dataset.el), 'banner');
  await page.click('#masterClose');
  assert.equal(await page.$eval('#master', (m) => m.hidden), true);
  assert.deepEqual(errors, []);
});

test('watermark and logos come from the design: behind the poster, in the banner and along the footer', async () => {
  const r = await state(() => {
    const { editor, render } = window.imposters;
    const img = (c) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="${c}"/></svg>`);
    editor.doc.design.brand = { watermark: { src: img('red'), opacity: 0.2, fit: 'cover' }, logo: { src: img('blue'), side: 'right', h: 30 }, footerLogos: { srcs: [img('green'), img('gold')], h: 12, align: 'spread' } };
    render();
    const head = document.querySelector('#tiles > .tile'), foot = [...document.querySelectorAll('#tiles > .tile')].at(-1);
    return {
      watermark: getComputedStyle(document.querySelector('#paper > .watermark')).opacity,
      logo: head.querySelectorAll(':scope > .brand img').length,
      footer: foot.querySelectorAll(':scope > .brand img').length,
      spread: getComputedStyle(foot.querySelector(':scope > .brand')).justifyContent,
    };
  });
  assert.deepEqual(r, { watermark: '0.2', logo: 1, footer: 2, spread: 'space-between' });
  // gone again when the design has none
  await state(() => { const { editor, render } = window.imposters; editor.doc.design.brand.watermark = null; render(); });
  assert.equal(await page.$('#paper > .watermark'), null);
});
