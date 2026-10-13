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

test('fast repeated clicks keep typing (no mode change)', async () => {
  await addBody();
  const [sx, sy] = await at(300, 400);
  for (let i = 1; i <= 4; i++) await page.mouse.click(sx, sy, { clickCount: i });
  const v = await state(() => ({ scope: window.imposters.editor.view.scope, editing: !!window.imposters.editor.view.editing }));
  assert.deepEqual(v, { scope: null, editing: true });
});

test('Shift + click on an edge splits; Ctrl+Shift splits into equal parts', async () => {
  await addBody();
  await page.keyboard.down('Shift');
  await move(300, 789); // bottom edge, near the middle → ½
  await click(300, 789);
  await page.keyboard.up('Shift');
  let widths = await state(() => window.imposters.editor.doc.tiles.filter((t) => !t.role).map((t) => Math.round(t.w)));
  assert.deepEqual(widths, [272, 272]);

  await page.keyboard.press('Control+z');
  await page.keyboard.press('3');
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await move(300, 789);
  await click(300, 789);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  widths = await state(() => window.imposters.editor.doc.tiles.filter((t) => !t.role).map((t) => Math.round(t.w)));
  assert.deepEqual(widths, [178, 178, 178]);
});

test('cutting the header divides its contents into a square and keeps one zone', async () => {
  await page.keyboard.down('Shift');
  await move(122, 118);
  await click(122, 118);
  await page.keyboard.up('Shift');
  const h = await state(() => {
    const t = window.imposters.editor.doc.tiles[0];
    return { top: window.imposters.editor.doc.tiles.length, bg: t.bg, kids: t.children.map((k) => Math.round(k.w)) };
  });
  assert.deepEqual(h, { top: 2, bg: '@header', kids: [100, 444] });
});

test('formatting toolbar styles the selected tile', async () => {
  await addBody();
  await page.keyboard.press('Escape'); // keep the tile selected, not typing
  await page.click('[data-f=bold]');
  await page.click('[data-f=align-center]');
  const t = await state(() => { const t = window.imposters.editor.doc.tiles.at(-1); return [t.bold, t.align]; });
  assert.deepEqual(t, [true, 'center']);
});

test('design colours restyle the poster', async () => {
  await page.click('#designBtn');
  await page.evaluate(() => {
    const e = document.querySelector('[data-role=header] [data-k=bg]');
    e.value = '#aa2244';
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.tile .bleed')).backgroundColor);
  assert.equal(bg, 'rgb(170, 34, 68)');
  assert.deepEqual(errors, []);
});
