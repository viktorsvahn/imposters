// Desktop tests: start the Electron app on a temporary project folder and
// check what lands on disk. Run with `npm run test:e2e` (builds first).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import puppeteer from 'puppeteer-core';

const appDir = fileURLToPath(new URL('../..', import.meta.url));
let dir, proj, app, browser, page;

const readJson = async (rel) => JSON.parse(await readFile(path.join(proj, rel), 'utf8'));
const settle = () => new Promise((r) => setTimeout(r, 700)); // autosave runs 400 ms after a change
const session = (fn, ...args) => page.evaluate(fn, ...args);
/** Move the mouse onto a box (from just beside it, so a move event always happens). */
const hoverBox = async (b) => { await page.mouse.move(b.x - 20, b.y - 20); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 }); };

/** Start the app on the project folder; resolves once the page has opened it. */
async function launch() {
  const env = { ...process.env, IMPOSTERS_USER_DATA: path.join(dir, 'user-data'), IMPOSTERS_EXPORT_DIR: path.join(dir, 'pdf') };
  delete env.ELECTRON_RUN_AS_NODE; // set by VS Code; it would start Electron as plain Node
  app = spawn(electron, [appDir, proj, '--remote-debugging-port=0'], { env });
  const ws = await new Promise((resolve, reject) => {
    let err = '';
    app.stderr.on('data', (d) => {
      err += d;
      const m = /DevTools listening on (ws:\S+)/.exec(err);
      if (m) resolve(m[1]);
    });
    app.on('exit', (code) => reject(new Error('Electron exited ' + code + '\n' + err)));
  });
  browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });
  const target = await browser.waitForTarget((t) => t.type() === 'page');
  page = await target.page();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => window.imposters?.session.project.poster, { timeout: 10000 }).catch(async (e) => {
    const state = await page.evaluate(() => ({
      url: location.href, desktop: !!window.desktop, imposters: !!window.imposters, title: document.title,
    })).catch((x) => x.message);
    throw new Error(`${e.message}\n${JSON.stringify(state)}\n${errors.join('\n')}`);
  });
}

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'imposters-'));
  proj = path.join(dir, 'My project');
  await launch();
});

after(async () => {
  browser?.disconnect();
  if (app && app.exitCode === null) {
    const exited = new Promise((r) => app.once('exit', r));
    app.kill();
    await exited;
  }
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('a new folder becomes a project with one poster', async () => {
  const m = await readJson('project.json');
  assert.equal(m.name, 'My project');
  assert.equal(m.posters.length, 1);
  assert.equal(m.active, m.posters[0].id);
  const doc = await readJson(m.posters[0].file);
  assert.deepEqual(doc.tiles.map((t) => t.role), ['header', 'footer']);
});

test('changes are saved to the poster file', async () => {
  await page.click('[data-act=add-text]');
  await settle();
  const m = await readJson('project.json');
  assert.equal((await readJson(m.posters[0].file)).tiles.length, 3);
});

test('images are copied into the project and shown from there', async () => {
  const src = await session(async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const src = await window.imposters.session.importImage(new File([png], 'dot.png', { type: 'image/png' }));
    window.imposters.actions.addTile('image', { src });
    return src;
  });
  assert.match(src, /^assets\/images\/[0-9a-f]{16}\.png$/);
  assert.ok(existsSync(path.join(proj, src)));
  const shown = await page.waitForFunction(() => {
    const img = [...document.querySelectorAll('.tile img')].at(-1);
    return img?.complete && img.naturalWidth > 0 && img.src;
  });
  assert.match(await shown.jsonValue(), /^project:\/\/local\/assets\/images\//);
});

test('posters with inlined images are imported as a variant with image files', async () => {
  const json = await session(() => {
    const doc = JSON.parse(JSON.stringify(window.imposters.editor.doc));
    doc.tiles.at(-1).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    return JSON.stringify(doc);
  });
  await session((j) => window.imposters.session.importPoster(j, 'old.json'), json);
  await settle();
  const m = await readJson('project.json');
  assert.deepEqual(m.posters.map((p) => p.name), ['Poster', 'old']);
  assert.equal(m.active, m.posters[1].id);
  const doc = await readJson(m.posters[1].file);
  assert.match(doc.tiles.at(-1).src, /^assets\/images\/[0-9a-f]{16}\.png$/);
});

test('posters sidebar: variants form a tree; switch, rename, delete', async () => {
  let m = await readJson('project.json');
  const old = m.posters.find((p) => p.name === 'old');
  await page.$eval(`.node[data-id="${old.id}"] [data-a=variant]`, (b) => b.click());
  await page.waitForFunction(() => window.imposters.session.project.poster.name === 'old 2');
  m = await readJson('project.json');
  const child = m.posters.find((p) => p.name === 'old 2');
  assert.equal(child.parent, old.id);
  await page.waitForSelector(`.node[data-id="${child.id}"]`);
  assert.deepEqual(m.posters.map((p) => p.name), ['Poster', 'old', 'old 2']);
  assert.equal(await page.$eval(`.node[data-id="${child.id}"]`, (n) => n.style.getPropertyValue('--depth')), '1');
  assert.ok(await page.$(`.node.current[data-id="${child.id}"]`));

  await page.click(`.node[data-id="${m.posters[0].id}"] .name`);
  await page.waitForFunction((id) => window.imposters.session.project.poster.id === id, {}, m.posters[0].id);
  assert.equal(await session(() => window.imposters.editor.doc.tiles.length), 4);

  await session((id) => window.imposters.session.renamePoster(id, 'Wide'), child.id);
  await session((id) => window.imposters.session.deletePoster(id), old.id);
  m = await readJson('project.json');
  assert.deepEqual(m.posters.map((p) => [p.name, p.parent]), [['Poster', null], ['Wide', null]]);
  assert.ok(!existsSync(path.join(proj, 'posters/old.poster.json')));
  assert.equal(await page.title(), 'Poster — My project — Imposters');

  await session((ids) => window.imposters.session.movePoster(ids[1], ids[0]), [m.posters[0].id, m.posters[1].id]);
  assert.equal((await readJson('project.json')).posters[1].parent, m.posters[0].id);
});

test('images sidebar: the pool lists imported images and places them', async () => {
  await page.click('#activity [data-side=images]');
  await page.waitForSelector('.pool .card');
  const names = await page.$$eval('.pool .card .name', (n) => n.map((x) => x.textContent));
  assert.deepEqual(names, ['dot']); // the same image imported twice is listed once
  assert.equal((await readJson('project.json')).assets[0].src.startsWith('assets/images/'), true);

  const before = await session(() => window.imposters.editor.doc.tiles.length);
  await session(() => { window.imposters.editor.view.selected.clear(); });
  await page.click('.pool .card .thumb', { count: 2 });
  const after = await session(() => window.imposters.editor.doc.tiles);
  assert.equal(after.length, before + 1);
  assert.match(after.at(-1).src, /^assets\/images\//);
  await page.click('.seg-tabs [data-filter=drawing]');
  assert.match(await page.$eval('.side-empty', (p) => p.textContent), /drawing mode/);
});

test('data sidebar: files are listed like a workspace; new tables are saved as CSV', async () => {
  await writeFile(path.join(dir, 'Table 1.csv'), 'size,mae\n10,0.5\n20,0.25\n40,0.125\n');
  await writeFile(path.join(dir, 'settings.json'), '{"cutoff": 5, "model": "MACE"}');
  await page.click('#activity [data-side=data]');
  const input = await page.$('#fileData');
  await input.uploadFile(path.join(dir, 'Table 1.csv'), path.join(dir, 'settings.json'));
  await page.waitForFunction(() => document.querySelectorAll('.workspace tbody tr').length === 2);
  const rows = await page.$$eval('.workspace tbody tr', (rs) => rs.map((r) => [...r.cells].slice(0, 3).map((c) => c.textContent)));
  assert.deepEqual(rows, [['settings', '1×1', 'struct'], ['Table_1', '3×2', 'table']]);
  assert.ok(existsSync(path.join(proj, 'data/Table_1.csv')));

  await page.click('[data-a=new-table]');
  await page.waitForSelector('#askDialog[open]');
  await page.$eval('#askInput', (i) => { i.value = ''; });
  await page.type('#askInput', 'results');
  await page.click('#askDialog button[value=ok]');
  await page.waitForSelector('#dataEditor:not([hidden]) .dgrid');
  await page.click('#dataEditor [data-de=add-row]');
  const cells = await page.$$('#dataEditor td input');
  assert.equal(cells.length, 9); // 3 columns × (2 + 1) rows
  await cells[0].type('1.5');
  await page.keyboard.press('Enter'); // down to the next row
  await page.keyboard.type('two');
  await page.$eval('#dataEditor thead input.col', (i) => { i.value = 'x'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.keyboard.down('Control');
  await page.keyboard.press('s');
  await page.keyboard.up('Control');
  await page.waitForFunction(() => !document.querySelector('.de-dirty')?.textContent);
  assert.equal(await readFile(path.join(proj, 'data/results.csv'), 'utf8'), 'x,B,C\n1.5,,\ntwo,,\n,,\n');
  await page.click('#dataEditor [data-de=close]');
  assert.equal(await page.$eval('#dataEditor', (e) => e.hidden), true);
  assert.equal(await page.$$eval('.workspace tbody tr', (r) => r.length), 3);
});

test('plots: quick from the chart gallery, details in categories, saved as SVG with hover text, placed, and redrawn when the data changes', async () => {
  await writeFile(path.join(dir, 'forest.csv'), 'property,label,kind,value,err,note\n' +
    'density,PBE-D3,Periodic,1.23,0.02,committee SE\ndensity,PBE-D2,Periodic,1.34,0.02,committee SE\ndensity,Small,Cluster,1.37,0.055,22 models\n' +
    'diffusivity,PBE-D3,Periodic,8.5,,fit CI\ndiffusivity,PBE-D2,Periodic,6.5,,fit CI\ndiffusivity,Small,Cluster,4.2,1.8,3 seeds\n');
  await (await page.$('#fileData')).uploadFile(path.join(dir, 'forest.csv'));
  await page.waitForSelector('.workspace tr[data-file="forest.csv"]');
  await page.click('.workspace tr[data-file="forest.csv"] td.name');
  await page.click('[data-a=new-plot]');

  // quick: the gallery draws every chart type from the table; one click makes the plot
  await page.waitForFunction(() => document.querySelectorAll('.pe-gallery .pgal-pic svg').length === 9);
  await page.click('.pgal-card[data-v=dots]');
  await page.waitForFunction(() => [...document.querySelectorAll('.pe-canvas [aria-label]')].filter((m) => m.getAttribute('aria-label').includes('note:')).length === 6);
  // columns were chosen for it: value along, labels down, coloured by kind, ± err, a panel per property, notes on hover
  const basics = await page.$$eval('.pbasics select', (ss) => Object.fromEntries(ss.map((x) => [x.dataset.k, x.value])));
  assert.deepEqual(basics, { 'main.data': 'forest', 'main.x': 'value', 'main.y': 'label', 'main.color': 'kind', 'panels.0.split': 'property' });
  assert.equal(await page.$$eval('.pe-form select, .pe-form input', (x) => x.length), 5); // upfront: only the basics

  // details: one small category at a time
  await page.click('.pcat-head[data-v=titles]');
  await page.type('input[data-k="split-sub"][data-v="density"]', 'g cm⁻³');
  await page.click('.pcat-head[data-v=hover]');
  assert.equal(await page.$eval('[data-k="main.hover"][data-v="note"]', (c) => c.checked), true);
  assert.equal(await page.$$eval('.pcat-body', (b) => b.length), 1);
  await page.waitForFunction(() => document.querySelector('.pe-canvas')?.textContent.includes('g cm⁻³'));

  // clicking an axis opens the axis settings
  await page.click('.pe-canvas .role-axis-label text');
  await page.waitForSelector('.pcat.open[data-cat=axes]');

  // the preview shows hover text
  const point = await page.$('.pe-canvas [aria-label]');
  await hoverBox(await point.boundingBox());
  await page.waitForSelector('.plot-tip:not([hidden])');
  assert.match(await page.$eval('.plot-tip', (t) => t.textContent), /note committee SE/);

  // edit texts right on the plot: a new title, a panel title, an axis title
  await page.mouse.move(5, 5);
  await page.click('[data-pa=add-title]');
  const edit = await page.waitForSelector('.pe-canvas .pe-edit');
  await edit.type('Cluster vs periodic');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.pe-canvas text')].some((t) => t.textContent === 'Cluster vs periodic'));
  const textEl = (s) => page.evaluateHandle((s) => [...document.querySelectorAll('.pe-canvas text')].find((t) => t.textContent === s), s);
  await (await textEl('density')).click();
  const e2 = await page.waitForSelector('.pe-canvas .pe-edit');
  assert.equal(await e2.evaluate((i) => i.value), 'density');
  await e2.evaluate((i) => i.select());
  await page.keyboard.type('Density');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.pe-canvas text')].some((t) => t.textContent === 'Density'));
  await (await textEl('value')).click(); // the x axis title (the column name)
  const e3 = await page.waitForSelector('.pe-canvas .pe-edit');
  await e3.evaluate((i) => i.select());
  await page.keyboard.type('g cm⁻³');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.pe-canvas text')].filter((t) => t.textContent === 'g cm⁻³').length >= 2);

  // the toolbar formats the selected text
  await (await textEl('Cluster vs periodic')).click();
  await page.waitForSelector('.pe-canvas .pe-edit');
  await page.click('#fmtbar [data-f=align-center]');
  await page.click('#fmtbar [data-f=bold]');
  await page.$eval('#fSize', (i) => { i.value = '30'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.$eval('#fmtbar [data-f=align-center]', (b) => b.classList.contains('on')), true);
  assert.equal(await page.$eval('#fmtbar [data-f=ul]', (b) => b.disabled), true); // lists don't apply to a plot title
  await page.keyboard.press('Escape'); // leave the text box
  await page.keyboard.press('Escape'); // deselect
  assert.equal(await page.$('.pe-selbox'), null);
  assert.equal(await page.$('#plotEditor:not([hidden])') !== null, true); // still open

  await page.$eval('.pe-name', (i) => { i.value = 'Forest'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-pa=save]');
  await page.waitForFunction(() => !document.querySelector('.pe-dirty')?.textContent);
  const asset = (await readJson('project.json')).assets.find((a) => a.kind === 'plot');
  assert.equal(asset.name, 'Forest');
  const svg = await readFile(path.join(proj, asset.src), 'utf8');
  assert.match(svg, /aria-label="label: Small&#xA;value: 1.37&#xA;kind: Cluster&#xA;err: 0.055&#xA;note: 22 models"/);
  const plot = await readJson(asset.src.replace(/\.svg$/, '.plot.json'));
  assert.deepEqual([plot.chart, plot.panels.length, plot.panels[0].split], ['dots', 1, 'property']);
  assert.equal(plot.title, 'Cluster vs periodic');
  assert.deepEqual(plot.text.title, { align: 'center', bold: false, size: 30 });
  assert.equal(plot.panels[0].splitTitles.density.title, 'Density');
  assert.equal(plot.panels[0].x.title, 'g cm⁻³');
  await page.click('[data-pa=close]');

  // in the image pool under Plots; placed on the poster it is inline, and hovering works there too
  await page.click('#activity [data-side=images]');
  await page.click('.seg-tabs [data-filter=plot]');
  await page.click('.pool .card .thumb', { button: 'right' });
  await page.evaluate(() => [...document.querySelectorAll('.popmenu button')].find((b) => b.textContent === 'Place on poster').click());
  await page.waitForSelector('#tiles .plot-svg [aria-label]');
  const onPoster = await page.$('#tiles .plot-svg [aria-label]');
  await hoverBox(await onPoster.boundingBox());
  await page.waitForFunction(() => /label PBE-D3/.test(document.querySelector('.plot-tip:not([hidden])')?.textContent ?? ''));

  // edit the table: the plot is drawn again
  await page.click('#activity [data-side=data]');
  await page.click('.workspace tr[data-file="forest.csv"] td.name', { count: 2 });
  const cell = await page.waitForSelector('#dataEditor tbody tr:nth-child(3) td:nth-child(5) input');
  await cell.click({ count: 3 });
  await cell.type('1.11');
  await page.keyboard.down('Control');
  await page.keyboard.press('s');
  await page.keyboard.up('Control');
  await page.waitForFunction(() => !document.querySelector('.de-dirty')?.textContent);
  await page.$eval('#dataEditor [data-de=close]', (btn) => btn.click());
  for (let i = 0; i < 40 && !(await readFile(path.join(proj, asset.src), 'utf8')).includes('value: 1.11'); i++) await settle();
  assert.match(await readFile(path.join(proj, asset.src), 'utf8'), /label: Small&#xA;value: 1.11/);
  await page.waitForFunction(() => document.querySelector('#tiles .plot-svg')?.innerHTML.includes('value: 1.11'));
});

test('live view: the published page beside the editor follows changes, plots hover there; HTML export is one file', async () => {
  await page.click('#liveBtn');
  const frameEl = await page.waitForSelector('#liveFrame');
  const frame = await frameEl.contentFrame();
  // (queried with evaluate: puppeteer's selector waits don't reach into this about:srcdoc page)
  await frame.waitForFunction(() => document.querySelector('.paper .tile'));
  assert.equal(await frame.evaluate(() => !!document.querySelector('.handle, #scopeLayer, .tile.selected')), false); // no editing furniture
  // tiles without a fill: tinted in the editor so they can be seen, but not on the published page
  const tinted = (doc) => [...doc.querySelectorAll('.tile')].filter((t) => getComputedStyle(t).backgroundColor === 'rgba(110, 125, 145, 0.09)').length;
  assert.ok(await page.evaluate(`(${tinted})(document)`) > 0);
  assert.equal(await frame.evaluate(`(${tinted})(document)`), 0);

  // a change in the editor shows up in the live view
  await session(() => window.imposters.actions.addTile('text', { html: '<div>Hello, live view</div>' }));
  await frame.waitForFunction(() => document.body.textContent.includes('Hello, live view'));

  // plots on the poster are interactive in the live view (bring the plot tile to the front, large)
  await session(() => {
    const { editor, render } = window.imposters, tiles = editor.doc.tiles;
    const t = tiles.find((x) => x.src?.startsWith('assets/plots/'));
    tiles.splice(tiles.indexOf(t), 1);
    tiles.push(Object.assign(t, { x: 20, y: 130, w: 554, h: 400 }));
    render();
  });
  await frame.waitForFunction(() => document.querySelector('.plot-svg [aria-label]')?.getBoundingClientRect().width > 4);
  const inFrame = await frame.evaluate(() => {
    const m = document.querySelector('.plot-svg [aria-label]');
    m.scrollIntoView({ block: 'center' });
    const r = m.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, view: [innerWidth, innerHeight] };
  });
  const at = await frameEl.boundingBox();
  await hoverBox({ ...inFrame, x: at.x + inFrame.x, y: at.y + inFrame.y });
  await frame.waitForFunction(() => /label/.test(document.querySelector('.plot-tip:not([hidden])')?.textContent ?? ''));

  // export: one self-contained file
  await session(() => window.imposters.session.exportHtml());
  const html = await readFile(path.join(dir, 'pdf', 'poster.html'), 'utf8');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Hello, live view/);
  assert.match(html, /<img[^>]+src="data:image\/png;base64,/); // images inside the file
  assert.doesNotMatch(html, /project:\/\//);
  assert.doesNotMatch(html, /nofill/);
  assert.match(html, /aria-label="label: /); // plots keep their hover text
  assert.match(html, /@page \{ size: 594mm 841mm/);
  await page.click('#liveBtn');
  assert.equal(await page.$eval('#liveView', (v) => v.hidden), true);
});

test('headers: a tile header starts with a title and a subtitle in the tile header styles; the inside gutter below it', async () => {
  const r = await session(() => {
    const { editor, actions } = window.imposters;
    const t = actions.addTile('text', { x: 20, y: 600, w: 250, h: 180, html: '<div>Some text</div>' });
    editor.view.selected = new Set([t.id]);
    actions.setBand(t, 'header', true);
    const band = t.children.find((k) => k.role === 'header');
    const below = t.children.find((k) => !k.role);
    return { html: band.html, flush: Math.abs(below.y - (band.y + band.h) - editor.doc.design.localGutterY) < 0.01 };
  });
  assert.match(r.html, /data-ts="tileTitle">Title<\/div><div data-ts="tileSubtitle">Subtitle/);
  assert.equal(r.flush, true);
  // the header's text keeps its size when the header changes height
  const titleSize = () => page.evaluate(() => parseFloat(getComputedStyle([...document.querySelectorAll('#tiles [data-ts="tileTitle"]')].at(-1)).fontSize));
  const before = await titleSize();
  await session(() => {
    const { editor, render } = window.imposters;
    const t = editor.doc.tiles.at(-1), band = t.children.find((k) => k.role === 'header');
    band.h *= 2;
    render();
  });
  assert.ok(Math.abs(await titleSize() - before) < 0.5);
  // the two header kinds are styled apart, and the subtitle can sit beside the title
  await page.click('#designBtn');
  await page.click('[data-group=local]');
  await page.click('.delements [data-el=tileHeader]');
  assert.deepEqual(await page.$$eval('.dpanel .style-card', (c) => c.map((x) => x.dataset.style)), ['tileTitle', 'tileSubtitle']);
  await page.select('[data-k=tileSubtitle]', 'beside');
  const look = await page.evaluate(() => {
    const sub = document.querySelector('#tiles [data-ts="tileSubtitle"]'), title = document.querySelector('#tiles [data-ts="tileTitle"]');
    const cs = getComputedStyle(sub);
    return { display: cs.display, color: cs.color, weight: getComputedStyle(title).fontWeight };
  });
  assert.deepEqual(look, { display: 'inline', color: 'rgb(74, 88, 102)', weight: '700' });
  await page.click('[data-group=global]');
  await page.click('.delements [data-el=banner]');
  assert.deepEqual(await page.$$eval('.dpanel .style-card', (c) => c.map((x) => x.dataset.style)), ['title', 'subtitle']);
  await page.click('#masterClose');
  await page.click('#panelBtn');
});

test('tables in text: inserted from a Data table with aligned numbers, rows and columns added and deleted, saved with the text', async () => {
  const id = await session(() => {
    const { editor, actions } = window.imposters;
    editor.view.scope = null;
    return actions.addTile('text', { x: 300, y: 600, w: 250, h: 200, html: '<div>Data and committee</div>' }).id;
  });
  const box = await (await page.$(`#tiles [data-id="${id}"]`)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.imposters.editor.view.editing);
  await page.keyboard.press('End');
  await page.click('[data-f=table]');
  await page.waitForSelector('.tablemenu');
  await page.click('.tablemenu [data-data*="Table_1"]'); // size, mae
  const table = () => page.$eval(`#tiles [data-id="${id}"] table`, (t) => ({
    head: [...t.tHead.rows[0].cells].map((c) => c.textContent + (c.classList.contains('num') ? '#' : '')),
    rows: [...t.tBodies[0].rows].map((r) => [...r.cells].map((c) => c.textContent)),
    align: getComputedStyle(t.tBodies[0].rows[0].cells[1]).textAlign,
    rule: parseFloat(getComputedStyle(t.tHead.rows[0].cells[0]).borderBottomWidth),
  }));
  let t = await table();
  assert.deepEqual(t.head, ['size#', 'mae#']);
  assert.deepEqual(t.rows, [['10', '0.5'], ['20', '0.25'], ['40', '0.125']]);
  assert.equal(t.align, 'right');
  assert.ok(t.rule > 1); // a heavy rule under the header
  // the caret in the first body cell: add a row below, a column, align it left, delete a column
  const caretIn = (sel) => page.$eval(`#tiles [data-id="${id}"] ${sel}`, (c) => {
    const r = document.createRange(); r.selectNodeContents(c); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  const menu = async (what) => { await page.click('[data-f=table]'); await page.click(`.tablemenu [data-t=${what}]`); };
  await caretIn('tbody td');
  await menu('row-below');
  await caretIn('tbody td');
  await menu('col');
  t = await table();
  assert.equal(t.rows.length, 4);
  assert.deepEqual(t.head, ['size#', '', 'mae#']);
  await caretIn('tbody td:nth-child(3)');
  await menu('left');
  assert.deepEqual((await table()).head, ['size#', '', 'mae']);
  await caretIn('tbody td:nth-child(2)');
  await menu('del-col');
  assert.deepEqual((await table()).head, ['size#', 'mae']);
  await page.keyboard.press('Escape');
  await settle();
  const m = await readJson('project.json');
  const doc = await readJson(m.posters.find((x) => x.id === m.active).file);
  const saved = JSON.stringify(doc);
  assert.match(saved, /<th class=\\"num\\">size<\/th><th( class=\\"\\")?>mae<\/th>/);
});

test('text details from the example poster: letter spacing, superscripts, hyphenation, lists across, a tile background image', async () => {
  const r = await session(() => {
    const { editor, actions, render } = window.imposters;
    editor.doc.design.styles.find((s) => s.id === 'body').tracking = 0.05;
    const t = actions.addTile('text', { x: 20, y: 300, w: 250, h: 120, html: '<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul><div>Å<sup>2</sup></div>' });
    Object.assign(t, { cols: 2, flow: 'across', hyphens: true, bgImage: editor.doc.tiles.find((k) => k.src)?.src || 'images/x.png', bgImageOpacity: 0.5 });
    render();
    const el = document.querySelector(`#tiles [data-id="${t.id}"]`), c = el.querySelector('.content');
    const li = [...c.querySelectorAll('li')].map((x) => x.getBoundingClientRect());
    return {
      spacing: getComputedStyle(c.querySelector('div')).letterSpacing,
      hyph: getComputedStyle(c).hyphens,
      across: Math.abs(li[0].top - li[1].top) < 1 && li[1].left > li[0].left,
      sup: !!c.querySelector('sup'),
      bg: getComputedStyle(el.querySelector('.bgimg')).opacity,
    };
  });
  assert.notEqual(r.spacing, 'normal');
  assert.equal(r.hyph, 'auto');
  assert.equal(r.across, true);
  assert.equal(r.sup, true);
  assert.equal(r.bg, '0.5');
  await session(() => { window.imposters.editor.doc.design.styles.find((s) => s.id === 'body').tracking = undefined; window.imposters.render(); });
});

test('fonts: the included ones are part of the app and go into exported pages; the computer\'s own are offered', async () => {
  assert.equal(await page.evaluate(async () => { await document.fonts.load('24px "TeX Gyre Heros"'); return document.fonts.check('24px "TeX Gyre Heros"'); }), true);
  const groups = await page.$$eval('#fFont optgroup', (g) => g.map((x) => x.label));
  assert.equal(groups[0], 'Included: works everywhere');
  assert.ok(groups.includes('On this computer'));
  await session(() => window.imposters.session.exportHtml());
  const html = await readFile(path.join(dir, 'pdf', 'poster.html'), 'utf8');
  assert.match(html, /@font-face \{ font-family: "TeX Gyre Heros"; [^}]*src: url\("data:font\/woff2;base64,/);
  assert.doesNotMatch(html, /Latin Modern Math/); // fonts the poster doesn't use stay out
});

test('PDF export has the paper size', async () => {
  await session(() => window.imposters.session.exportPdf());
  const pdf = (await readFile(path.join(dir, 'pdf', 'poster.pdf'))).toString('latin1');
  const [, w, h] = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(pdf);
  assert.equal(Math.round(+w / 72 * 25.4), 594); // A1
  assert.equal(Math.round(+h / 72 * 25.4), 841);
});

let tilesAtClose;
test('closing the window finishes the pending save', async () => {
  await session(() => {
    const { editor, actions } = window.imposters;
    editor.view.selected = new Set([editor.doc.tiles.at(-1).id]);
    actions.deleteSelected();
  });
  tilesAtClose = await session(() => window.imposters.editor.doc.tiles.length);
  const exited = new Promise((r) => app.once('exit', r));
  await session(() => { setTimeout(() => window.close(), 0); }); // before the autosave delay ends
  await exited;
  const m = await readJson('project.json');
  const doc = await readJson(m.posters.find((p) => p.id === m.active).file);
  assert.equal(doc.tiles.length, tilesAtClose);
});

test('reopening opens the last project and poster, and finds images added by hand', async () => {
  await copyFile(path.join(proj, (await readJson('project.json')).assets[0].src), path.join(proj, 'assets/images/by hand.png'));
  await launch();
  const name = await session(() => window.imposters.session.project.poster.name);
  assert.equal(name, 'Poster');
  assert.equal(await session(() => window.imposters.editor.doc.tiles.length), tilesAtClose);
  assert.deepEqual((await readJson('project.json')).assets.map((a) => a.name), ['dot', 'Forest', 'by hand']);
});
