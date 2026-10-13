import { describe, expect, it } from 'vitest';
import { AX } from '../../src/layout/axis';
import { bandOf, bandSnaps, toggleBand } from '../../src/layout/bands';
import { makeContainer, unwrapIfTrivial } from '../../src/layout/containers';
import { cutAny, cutPlan, equalCuts } from '../../src/layout/cuts';
import { fillAll, largestFree } from '../../src/layout/fill';
import { levelOf } from '../../src/layout/level';
import { normalizeLayout, reflowAxis } from '../../src/layout/reflow';
import { seamAt } from '../../src/layout/seams';
import { newDocument } from '../../src/model/document';
import { makeTile } from '../../src/model/tile';
import type { Doc, Tile } from '../../src/model/types';

const r1 = (v: number) => Math.round(v * 10) / 10;
const box = (t: Tile) => [t.x, t.y, t.w, t.h].map(r1);

/** A poster with header (0–120) and footer, plus one body tile filling the rest. */
function poster(): { doc: Doc; body: Tile } {
  const doc = newDocument();
  const L = levelOf(doc, null);
  const free = largestFree(L)!;
  const body = makeTile(doc.paper, 'text', { x: free.x, y: free.y, w: free.w, h: free.h });
  doc.tiles.push(body);
  return { doc, body };
}

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
    expect(header.children!.map((k) => [k.bg, r1(k.w)])).toEqual([['', 100], ['', 444]]);
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
  it('keeps gutters when a container is resized', () => {
    const { doc, body } = poster();
    makeContainer(doc, body);
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
    expect(kid.y).toBeCloseTo(band.h + 10);
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
