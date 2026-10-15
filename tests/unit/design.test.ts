import { describe, expect, it } from 'vitest';
import { masterKeyOfTile, specimenDoc } from '../../src/layout/specimen';
import { defaultDesign, fontCss, fontIdOfCss, normalizeDesign, swatchColors } from '../../src/model/design';
import { newDocument } from '../../src/model/document';
import { PALETTES, paletteById, paletteOfColors } from '../../src/model/palettes';
import { walk } from '../../src/model/tree';
import type { Tile } from '../../src/model/types';

describe('palettes', () => {
  it("are Paul Tol's schemes, Bright by default", () => {
    expect(defaultDesign().palette).toBe('bright');
    expect(paletteById('nope').id).toBe('bright');
    expect(PALETTES.filter((p) => p.kind === 'qualitative').map((p) => p.id))
      .toEqual(['bright', 'high-contrast', 'vibrant', 'muted', 'medium-contrast', 'light', 'pale', 'dark']);
    expect(paletteOfColors(paletteById('muted').colors)?.id).toBe('muted');
    expect(paletteOfColors(['#123456'])).toBeNull();
  });

  it("the poster's scheme is offered among its colours", () => {
    const d = defaultDesign();
    d.palette = 'vibrant';
    expect(swatchColors(d).slice(0, 2)).toEqual(['#ee7733', '#0077bb']);
  });
});

describe('fonts', () => {
  it('the included TeX Gyre Heros is the default; fonts of the computer are "local:" ids', () => {
    expect(new Set(defaultDesign().styles.map((s) => s.font))).toEqual(new Set(['heros']));
    expect(fontCss('heros')).toMatch(/^"TeX Gyre Heros"/);
    expect(fontCss('local:Segoe UI')).toBe('"Segoe UI", sans-serif');
    expect(fontIdOfCss('"TeX Gyre Heros", Helvetica')).toBe('heros');
    expect(fontIdOfCss('"Segoe UI", sans-serif', ['Segoe UI'])).toBe('local:Segoe UI');
  });
});

describe('the design of older posters', () => {
  it('gains a palette, no watermark or logos, and table rules', () => {
    const d = normalizeDesign({ v: 2 } as never);
    expect(d.palette).toBe('bright');
    expect(d.brand).toEqual({ watermark: null, logo: null, footerLogos: { srcs: [], h: 20, align: 'spread' } });
    expect(d.table).toEqual({ rule: 2.25, line: '#c3cad2' });
    const w = normalizeDesign({ v: 2, brand: { watermark: { src: 'a.png' }, logo: { src: '' } } } as never).brand;
    expect(w.watermark).toEqual({ src: 'a.png', opacity: 0.12, fit: 'cover' });
    expect(w.logo).toBeNull();
  });
});

describe('the master poster', () => {
  it("holds one of every element, and shares the poster's design", () => {
    const doc = newDocument(), m = specimenDoc(doc);
    expect(m.design).toBe(doc.design);
    const kinds = new Set<string>();
    walk(m.tiles, (t: Tile, parent: Tile | null) => kinds.add(masterKeyOfTile(t, parent)));
    expect([...kinds].sort()).toEqual(['banner', 'footer', 'local', 'tileFooter', 'tileHeader', 'tiles']);
    const html = JSON.stringify(m.tiles);
    for (const id of ['h1', 'h2', 'h3', 'h4', 'h5', 'caption', 'body']) expect(html).toContain(`data-ts=\\"${id}\\"`);
    expect(html).toContain('<table');
    // the same ids every time, so the drawing is reused
    expect(specimenDoc(doc).tiles.map((t) => t.id)).toEqual(m.tiles.map((t) => t.id));
  });
});
