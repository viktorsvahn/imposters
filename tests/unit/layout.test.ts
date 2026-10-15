import { describe, expect, it } from 'vitest';
import { AX } from '../../src/layout/axis';
import { bandOf, bandSnaps, toggleBand } from '../../src/layout/bands';
import { makeContainer, unwrapIfTrivial } from '../../src/layout/containers';
import { cutAny, cutPlan, equalCuts } from '../../src/layout/cuts';
import { fillAll, largestFree } from '../../src/layout/fill';
import { levelOf } from '../../src/layout/level';
import { minimumOf, normalizeLayout, reflowAxis, setContentMeasure } from '../../src/layout/reflow';
import { seamAt, spaceOut } from '../../src/layout/seams';
import { neighbourLines } from '../../src/layout/snap';
import { loadDocument, newDocument } from '../../src/model/document';
import { makeTile } from '../../src/model/tile';
import type { Doc, Tile } from '../../src/model/types';

const r1 = (v: number) => Math.round(v * 10) / 10;
const box = (t: Tile) => [t.x, t.y, t.w, t.h].map(r1);

/** A new poster with the geometry these tests were written for: 20 mm margins, 10 mm gaps, 4 mm inside tiles. */
function classicDocument(): Doc {
  const doc = newDocument();
  Object.assign(doc.paper, { margin: 20, gutter: 10, gutterY: 10 });
  Object.assign(doc.design, { localGutter: 4, localGutterY: 4 });
  for (const t of doc.tiles) Object.assign(t, { x: 20, w: doc.paper.w - 40 });
  return doc;
}

/** A poster with header (0–120) and footer, plus one body tile filling the rest. */
function poster(): { doc: Doc; body: Tile } {
  const doc = classicDocument();
  const L = levelOf(doc, null);
  const free = largestFree(L)!;
  const body = makeTile(doc.paper, 'text', { x: free.x, y: free.y, w: free.w, h: free.h });
  doc.tiles.push(body);
  return { doc, body };
}

describe('new posters', () => {
  it('start with the margins and gaps of a typical poster', () => {
    const doc = newDocument();
    expect([doc.paper.margin, doc.paper.gutter, doc.paper.gutterY, doc.design.localGutter, doc.design.localGutterY]).toEqual([37, 24, 10, 10.5, 6.5]);
    expect(doc.tiles.map((t) => [t.x, t.w])).toEqual([[37, 520], [37, 520]]);
  });
});

describe('free space', () => {
  it('fills the space between header and footer, inside the margins', () => {
    const { body } = poster();
    expect(box(body)).toEqual([20, 130, 554, 661]); // header 0–120 + gutter, footer at 801 − gutter
  });

  it('closes gaps with fill-all', () => {
    const { doc, body } = poster();
    body.w = 200;
    fillAll(levelOf(doc, null));
    expect(body.w).toBeCloseTo(554);
  });
});

describe('cuts', () => {
  it('splits into equal parts with gutters between', () => {
    const { doc, body } = poster();
    const cs = equalCuts(body, 'x', 3, doc.paper.gutter)!;
    cutAny(doc, body, 'x', cs);
    const row = doc.tiles.filter((t) => !t.role).map(box);
    expect(row).toEqual([[20, 130, 178, 661], [208, 130, 178, 661], [396, 130, 178, 661]]);
  });

  it('snaps a free cut to ½ near the middle', () => {
    const { doc, body } = poster();
    const L = levelOf(doc, null);
    const plan = cutPlan(doc, L, { id: body.id, side: 'bottom', dist: 0, q: 300 }, { snap: true, equal: false, parts: 2, thr: 10 })!;
    expect(plan.label).toBe('½');
    expect(plan.cs[0]).toBeCloseTo(20 + (554 - 10) / 2 + 5);
  });

  it('cutting a header divides its contents and keeps one coloured zone', () => {
    const { doc } = poster();
    const header = bandOf(doc, null, 'header')!;
    const before = doc.tiles.length;
    cutAny(doc, header, 'x', [125]);
    expect(doc.tiles.length).toBe(before); // no new top-level pieces
    expect(header.bg).toBe('@header');
    expect(header.children!.map((k) => [k.bg, r1(k.w)])).toEqual([['', 103], ['', 447]]); // pieces 4 mm apart (inside-tile gutter)
  });

  it('header squares are measured on the visible area (bleed included)', () => {
    const { doc } = poster();
    const header = bandOf(doc, null, 'header')!;
    const snaps = bandSnaps(doc, doc.paper, header, header, 'x', doc.paper.gutter);
    // 120 mm tall header, bleeding from the paper edge: square ends at 120, + half gutter
    expect(snaps[0]).toMatchObject({ label: '■ square', c: 125 });
    expect(snaps[1].c).toBeCloseTo(594 - 120 - 5);
  });
});

describe('seams', () => {
  it('finds the gutter between two columns', () => {
    const { doc, body } = poster();
    cutAny(doc, body, 'x', equalCuts(body, 'x', 2, 10)!);
    const seam = seamAt(levelOf(doc, null), { x: 297, y: 400 }, 2)!;
    expect(seam.axis).toBe('x');
    expect(seam.L).toHaveLength(1);
    expect(seam.R).toHaveLength(1);
  });
});

describe('reflow', () => {
  it('tiles inside a tile are spaced by the design\'s smaller gutter (0: they touch)', () => {
    const { doc, body } = poster();
    expect(doc.design.localGutter).toBeLessThan(doc.paper.gutter);
    makeContainer(doc, body);
    const kid = makeTile(doc.paper, 'text', { x: 0, y: 0, w: body.w, h: body.h });
    body.children = [kid];
    cutAny(doc, kid, 'y', equalCuts(kid, 'y', 2, doc.design.localGutterY)!);
    const [a, b] = body.children!;
    expect(b.y - (a.y + a.h)).toBeCloseTo(doc.design.localGutterY); // rows: the gap down
    normalizeLayout(doc); // the tile remembers the gutter it was laid out with
    doc.design.localGutterY = 0;
    normalizeLayout(doc);
    expect(b.y).toBeCloseTo(a.y + a.h);
  });

  it('an inner gutter set later opens gaps between touching tiles, and closes them again', () => {
    const { doc, body } = poster();
    doc.design.localGutter = 0; // touching to start with
    makeContainer(doc, body);
    const kid = makeTile(doc.paper, 'text', { x: 0, y: 0, w: body.w, h: body.h });
    body.children = [kid];
    cutAny(doc, kid, 'x', equalCuts(kid, 'x', 3, 0)!);
    normalizeLayout(doc);
    body.gutter = 10;
    normalizeLayout(doc);
    const k = body.children!;
    expect(k[1].x - (k[0].x + k[0].w)).toBeCloseTo(10);
    expect(k[2].x - (k[1].x + k[1].w)).toBeCloseTo(10);
    expect(k[0].w).toBeCloseTo(k[2].w);
    expect(k[2].x + k[2].w).toBeCloseTo(body.w);
    body.gutter = 0;
    normalizeLayout(doc);
    expect(k[1].x).toBeCloseTo(k[0].x + k[0].w);
    expect(k[0].w).toBeCloseTo(body.w / 3);
  });

  it('keeps gutters when a container is resized', () => {
    const { doc, body } = poster();
    makeContainer(doc, body);
    body.gutterY = 10; // rows: the gap down
    const kid = makeTile(doc.paper, 'text', { x: 0, y: 0, w: body.w, h: body.h });
    body.children = [kid];
    cutAny(doc, kid, 'y', equalCuts(kid, 'y', 2, 10)!);
    normalizeLayout(doc);
    body.h -= 100;
    normalizeLayout(doc);
    const [a, b] = body.children!;
    expect(b.y - (a.y + a.h)).toBeCloseTo(10); // gutter unchanged
    expect(a.h).toBeCloseTo(b.h);
    expect(b.y + b.h).toBeCloseTo(body.h);
  });

  it('keeps header heights fixed', () => {
    const kids = [
      { x: 0, y: 0, w: 100, h: 50, role: 'header' },
      { x: 0, y: 60, w: 100, h: 140 },
    ] as Tile[];
    reflowAxis(kids, AX.y, { size: 200, m: 0, g: 10 }, { size: 300, m: 0, g: 10 });
    expect(kids[0].h).toBe(50);
    expect(kids[1].h).toBeCloseTo(240);
  });
});

describe('headers and footers', () => {
  it('adding a header to a tile makes room, removing gives it back', () => {
    const { doc, body } = poster();
    makeContainer(doc, body, true);
    const kid = makeTile(doc.paper, 'text', { x: 0, y: 0, w: body.w, h: body.h });
    body.children!.push(kid);
    const band = toggleBand(doc, body, 'header', true)!;
    expect(band.y).toBe(0);
    expect(band.bg).toBe('@tileHeader'); // no colour unless the design gives one
    expect(kid.y).toBeCloseTo(band.h + doc.design.localGutter); // the inside-tile gutter below the header
    expect(band.html).toContain('data-ts="tileTitle"');
    expect(band.html).toContain('data-ts="tileSubtitle"');
    toggleBand(doc, body, 'header', false);
    expect(kid.y).toBeCloseTo(0);
    expect(kid.h).toBeCloseTo(body.h);
  });

  it('an entered but undivided tile folds back to a plain tile', () => {
    const { doc, body } = poster();
    body.html = 'Hello';
    makeContainer(doc, body);
    expect(body.children).toHaveLength(1);
    unwrapIfTrivial(body);
    expect(body.children).toBeUndefined();
    expect(body.html).toBe('Hello');
  });
});

describe('headers and snapping across tiles', () => {
  it('a new tile header is tall enough for its title and subtitle and the design\'s header space', () => {
    const { doc, body } = poster();
    makeContainer(doc, body, true);
    const band = toggleBand(doc, body, 'header', true)!;
    // tile title 37.5 pt + subtitle 20.25 pt (1.3 line height) + 2 × 4 mm above and below
    expect(band.h).toBeCloseTo(Math.round(((37.5 + 20.25) * 25.4 / 72 * 1.3 + 8) * 10) / 10, 1);
  });

  it('inside a tile, the header of the tile next door is a snap line', () => {
    const { doc } = poster();
    const a = makeTile(doc.paper, 'text', { x: 20, y: 130, w: 272, h: 300 });
    const b = makeTile(doc.paper, 'text', { x: 302, y: 130, w: 272, h: 300 });
    doc.tiles.push(a, b);
    for (const t of [a, b]) { makeContainer(doc, t, true); toggleBand(doc, t, 'header', true); }
    const bh = b.children!.find((k) => k.role === 'header')!;
    bh.h = 37; // the neighbour's header is 37 mm tall
    const lines = neighbourLines(doc, a, new Set());
    expect(lines.Y).toContainEqual({ v: 37, k: 'e' }); // its bottom, in a's coordinates
    expect(lines.X).toContainEqual({ v: 302 - 20, k: 's' }); // b's left edge
    expect(neighbourLines(doc, a, new Set([b.id])).Y).not.toContainEqual({ v: 37, k: 'e' }); // b moves along
  });
});

describe('shrinking takes unused room first', () => {
  const rows = () => [{ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 100, w: 100, h: 100 }] as Tile[];
  // the top tile's content needs 40 mm, the bottom one's all of its 100 mm
  const minOf = (kids: Tile[]) => (t: Tile) => (t === kids[0] ? 40 : 100);

  it('the tile with room to spare gives it up; the full one keeps its size', () => {
    const kids = rows();
    reflowAxis(kids, AX.y, { size: 200, m: 0, g: 0 }, { size: 150, m: 0, g: 0 }, minOf(kids));
    expect(kids.map((k) => [r1(k.y), r1(k.h)])).toEqual([[0, 50], [50, 100]]);
  });

  it('when the room is used up, everything shrinks in proportion', () => {
    const kids = rows();
    reflowAxis(kids, AX.y, { size: 200, m: 0, g: 0 }, { size: 120, m: 0, g: 0 }, minOf(kids));
    expect(r1(kids[0].h)).toBeCloseTo(34.3, 1); // 40 × 120/140
    expect(r1(kids[1].h)).toBeCloseTo(85.7, 1);
  });

  it('empty space between tiles goes first too; growing stays proportional', () => {
    const kids = [{ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 100, w: 100, h: 100 }] as Tile[];
    reflowAxis(kids, AX.y, { size: 200, m: 0, g: 0 }, { size: 170, m: 0, g: 0 }, () => null);
    expect(kids.map((k) => [r1(k.y), r1(k.h)])).toEqual([[0, 50], [70, 100]]);
    const grow = rows();
    reflowAxis(grow, AX.y, { size: 200, m: 0, g: 0 }, { size: 300, m: 0, g: 0 }, minOf(grow));
    expect(grow.map((k) => r1(k.h))).toEqual([150, 150]);
  });
});

describe('opening space between tiles (Ctrl+Alt drag on the line between them)', () => {
  const frame = { w: 300, h: 100, margin: 0, gutter: 0, gutterY: 0, columns: 0 };
  const cols = () => [0, 100, 200].map((x, i) => ({ id: 'c' + i, x, y: 0, w: 100, h: 100 })) as Tile[];
  const xs = (ts: Tile[]) => ts.map((t) => [r1(t.x), r1(t.w)]);

  it('opens space symmetrically at one gap', () => {
    const ts = cols();
    expect(spaceOut(ts, 'x', frame, 5, { L: ['c0'], R: ['c1'] })).toBe(5);
    expect(xs(ts)).toEqual([[0, 95], [105, 95], [200, 100]]);
  });

  it('opens the same space at every gap; edges against the frame stay', () => {
    const ts = cols();
    spaceOut(ts, 'x', frame, 5);
    expect(xs(ts)).toEqual([[0, 95], [105, 90], [205, 95]]);
  });

  it('closes space, but not past touching', () => {
    const ts = cols();
    spaceOut(ts, 'x', frame, 5);
    expect(spaceOut(ts, 'x', frame, -20)).toBe(-5);
    expect(xs(ts)).toEqual([[0, 100], [100, 100], [200, 100]]);
  });

  it('a gap of any width is a line to drag', () => {
    const ts = cols();
    spaceOut(ts, 'x', frame, 7, { L: ['c0'], R: ['c1'] });
    const s = seamAt({ tiles: ts, frame } as never, { x: 100, y: 50 }, 1)!;
    expect([r1(s.lo), r1(s.hi), s.L, s.R]).toEqual([93, 107, ['c0'], ['c1']]);
  });
});

describe('shrinking: negative space first, then unused room, also inside divided tiles', () => {
  it('space between tiles goes before the room inside them', () => {
    // two tiles of 80 with 40 of space between; each tile needs only 30
    const kids = [{ x: 0, y: 0, w: 100, h: 80 }, { x: 0, y: 120, w: 100, h: 80 }] as Tile[];
    reflowAxis(kids, AX.y, { size: 200, m: 0, g: 0 }, { size: 170, m: 0, g: 0 }, () => 30);
    expect(kids.map((k) => [r1(k.y), r1(k.h)])).toEqual([[0, 80], [90, 80]]); // the gap gave 30
  });

  it('a divided tile\'s minimum comes from what is inside it', () => {
    const { doc } = poster();
    doc.design.localGutter = 0;
    const leafMin = (t: Tile) => (t.html === 'short' ? 20 : null);
    const inner = makeTile(doc.paper, 'text', { x: 0, y: 0, w: 100, h: 200, children: [
      makeTile(doc.paper, 'text', { x: 0, y: 0, w: 100, h: 100, html: 'short' }),
      makeTile(doc.paper, 'text', { x: 0, y: 100, w: 100, h: 100, html: 'full' }),
    ] });
    expect(minimumOf(doc, inner, 'y', (t) => leafMin(t))).toBe(120); // 80 of room in the short one
    // shrinking the tile around it takes that room, not the full tile's
    const outer = makeTile(doc.paper, 'text', { x: 20, y: 130, w: 100, h: 200, children: [inner] });
    doc.tiles.push(outer);
    normalizeLayout(doc);
    setContentMeasure((t) => leafMin(t));
    outer.h = 150;
    normalizeLayout(doc);
    expect(inner.children!.map((k) => r1(k.h))).toEqual([50, 100]);
    setContentMeasure(() => null);
  });
});

describe('gaps across and down', () => {
  it('columns get the gap across, rows the gap down', () => {
    const { doc, body } = poster();
    doc.design.localGutter = 6;
    doc.design.localGutterY = 2;
    makeContainer(doc, body);
    const kid = makeTile(doc.paper, 'text', { x: 0, y: 0, w: body.w, h: body.h });
    body.children = [kid];
    cutAny(doc, kid, 'x', equalCuts(kid, 'x', 2, 6)!); // two columns
    const [l] = body.children!;
    cutAny(doc, l, 'y', equalCuts(l, 'y', 2, 2)!); // the left one into two rows
    const k = body.children!;
    const right = k.find((t) => t.x > 10)!, [top, bottom] = k.filter((t) => t.x < 10).sort((a, b) => a.y - b.y);
    expect(right.x - (top.x + top.w)).toBeCloseTo(6);
    expect(bottom.y - (top.y + top.h)).toBeCloseTo(2);
  });

  it('older documents: one gutter becomes the same across and down', () => {
    const raw = JSON.parse(JSON.stringify(newDocument()));
    delete raw.paper.gutterY;
    raw.tiles.push({ ...makeTile(raw.paper, 'text'), gutter: 7, gutterY: undefined });
    delete raw.tiles.at(-1).gutterY;
    const back = loadDocument(raw);
    expect(back.paper.gutterY).toBe(back.paper.gutter);
    expect(back.tiles.at(-1)!.gutterY).toBe(7);
  });
});
