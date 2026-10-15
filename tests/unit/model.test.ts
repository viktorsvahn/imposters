import { describe, expect, it } from 'vitest';
import { borderKindOf, borderOf, defaultDesign, normalizeDesign, offeredStyles, rememberColor, resolveBg, resolveText } from '../../src/model/design';
import { loadDocument, newDocument } from '../../src/model/document';
import { applyStyle, lookOf } from '../../src/model/style';
import { makeTile } from '../../src/model/tile';

describe('design', () => {
  it('resolves design colour roles', () => {
    const d = defaultDesign();
    expect(resolveBg(d, '@header')).toBe('#1f3a5f');
    expect(resolveText(d, '@header')).toBe('#ffffff');
    expect(resolveBg(d, '@tileHeader')).toBe(''); // none by default
    expect(resolveBg(d, '#123456')).toBe('#123456');
  });

  it('keeps a colour history, newest first, without duplicates', () => {
    const d = defaultDesign();
    rememberColor(d, '#AA0000');
    rememberColor(d, '#00aa00');
    rememberColor(d, '#aa0000');
    expect(d.recent).toEqual(['#aa0000', '#00aa00']);
    expect(rememberColor(d, 'not a colour')).toBe(false);
  });

  it('migrates an older design and keeps custom styles', () => {
    const old = normalizeDesign({ v: 1, styles: [{ id: 'h1', name: 'Old title' }] } as never);
    expect(old.styles.find((s) => s.id === 'h1')!.name).toBe('Heading 1'); // old style set replaced
    const current = defaultDesign();
    current.styles.push({ id: 'cX', name: 'Caption', font: 'sans', size: 14, weight: '400', italic: true, upper: false, color: '', enabled: true });
    expect(normalizeDesign(current).styles.map((s) => s.name)).toContain('Caption');
  });

  it('offers enabled styles (Body always)', () => {
    const d = defaultDesign();
    d.styles.forEach((s) => { s.enabled = false; });
    expect(offeredStyles(d).map((s) => s.id)).toEqual(['body']);
  });
});

describe('documents', () => {
  it('round-trips through JSON and fills in missing fields', () => {
    const doc = newDocument();
    const raw = JSON.parse(JSON.stringify(doc));
    delete raw.tiles[0].borderSides;
    const loaded = loadDocument(raw);
    expect(loaded.tiles[0].borderSides).toBe('trbl');
    expect(loaded.design.styles.length).toBeGreaterThan(0);
  });

  it('rejects files that are not documents', () => {
    expect(() => loadDocument({ hello: 1 })).toThrow();
  });
});

describe('styling divided tiles', () => {
  it('text settings cascade to the text inside; fill goes to the visible layer', () => {
    const doc = newDocument();
    const box = makeTile(doc.paper, 'text', { bg: '' });
    const a = makeTile(doc.paper, 'text', { bg: '#eeeeee' });
    const b = makeTile(doc.paper, 'text', { bg: '#eeeeee' });
    box.children = [a, b];
    applyStyle(doc, box, 'color', '#ff0000');
    applyStyle(doc, box, 'bg', '#00ff00');
    expect([a.color, b.color]).toEqual(['#ff0000', '#ff0000']);
    expect([a.bg, b.bg, box.bg]).toEqual(['#00ff00', '#00ff00', '']);
    expect(lookOf(box).fill).toBe(a);
  });

  it('a design fill brings its text colour along', () => {
    const doc = newDocument();
    const t = makeTile(doc.paper, 'text');
    applyStyle(doc, t, 'bg', '@header');
    expect(t.color).toBe('@header');
  });
});

describe('tile fill', () => {
  it('tiles have no fill by default; the old default grey is dropped, a chosen colour kept', () => {
    expect(defaultDesign().colors.tile.bg).toBe('');
    const old = defaultDesign();
    old.colors.tile = { bg: '#F1F3F5', text: '' };
    expect(normalizeDesign(old).colors.tile.bg).toBe('');
    old.colors.tile = { bg: '#eef6ff', text: '' };
    expect(normalizeDesign(old).colors.tile.bg).toBe('#eef6ff');
  });
});

describe('borders', () => {
  const paper = newDocument().paper;
  it('knows each tile\'s kind: on the poster, inside a tile, headers and footers, pieces of a header', () => {
    const top = makeTile(paper, 'text'), inner = makeTile(paper, 'text'), band = makeTile(paper, 'text', { role: 'header' });
    expect(borderKindOf(top, null)).toBe('global');
    expect(borderKindOf(inner, top)).toBe('local');
    expect(borderKindOf(band, null)).toBe('header');
    expect(borderKindOf(band, top)).toBe('tileHeader');
    expect(borderKindOf(inner, band)).toBeNull();
  });

  it('a tile has the design\'s border for its kind, unless it has its own', () => {
    const d = defaultDesign();
    d.borders.local = { w: 0.5, c: '#123456', sides: 'b', radius: 2 };
    const top = makeTile(paper, 'text'), inner = makeTile(paper, 'text');
    expect(borderOf(d, inner, top)).toEqual({ w: 0.5, c: '#123456', sides: 'b', radius: 2 });
    expect(borderOf(d, top, null).w).toBe(0);
    Object.assign(inner, { ownBorder: true, borderW: 2, borderC: '#ff0000', borderSides: 'trbl', radius: 0 });
    expect(borderOf(d, inner, top)).toEqual({ w: 2, c: '#ff0000', sides: 'trbl', radius: 0 });
  });

  it('designs get borders; documents keep the borders their tiles had', () => {
    expect(normalizeDesign({} as never).borders.tileHeader).toEqual({ w: 0, c: '#1a1a1a', sides: 'trbl', radius: 0 });
    const doc = newDocument();
    doc.tiles.push(makeTile(doc.paper, 'text', { borderW: 1 }), makeTile(doc.paper, 'text'));
    const back = loadDocument(JSON.parse(JSON.stringify(doc)));
    expect(back.tiles.slice(-2).map((t) => !!t.ownBorder)).toEqual([true, false]);
  });
});

describe('space around text', () => {
  it('older documents: the automatic padding follows the design, padding set by hand stays', () => {
    const doc = newDocument();
    const auto = { ...makeTile(doc.paper, 'text'), padding: 8 } as never, own = { ...makeTile(doc.paper, 'text'), padding: 3 } as never;
    const none = { ...makeTile(doc.paper, 'text'), padding: 0, role: 'header' } as never;
    for (const t of [auto, own, none] as Record<string, unknown>[]) { delete t.padX; delete t.padY; }
    doc.tiles = [none, auto, own];
    const back = loadDocument(JSON.parse(JSON.stringify(doc)));
    expect(back.tiles.map((t) => [t.padX, t.padY])).toEqual([[0, 0], [null, null], [3, 3]]);
  });
});
