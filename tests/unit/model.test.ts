import { describe, expect, it } from 'vitest';
import { defaultDesign, normalizeDesign, offeredStyles, rememberColor, resolveBg, resolveText } from '../../src/model/design';
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
