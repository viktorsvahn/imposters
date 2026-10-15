import { describe, expect, it } from 'vitest';
import {
  addAsset, addPosterEntry, decodeDataUrl, imageExt, isExternalSrc, loadManifest, nameFromFile, newManifest, posterTree,
  removePosterEntry, renamePosterEntry, setPosterParent, slugify, uniqueName,
} from '../../src/model/project';

describe('project manifest', () => {
  it('gives each poster a unique name and file', () => {
    const m = newManifest('Talk');
    const a = addPosterEntry(m, 'Poster');
    const b = addPosterEntry(m, 'Poster');
    expect([a.name, b.name]).toEqual(['Poster', 'Poster 2']);
    expect([a.file, b.file]).toEqual(['posters/poster.poster.json', 'posters/poster-2.poster.json']);
    expect(a.id).not.toBe(b.id);
  });

  it('keeps file names distinct even when names slug the same', () => {
    const m = newManifest('x');
    const a = addPosterEntry(m, 'Wide!');
    const b = addPosterEntry(m, 'wide?');
    expect(a.file).not.toBe(b.file);
  });

  it('renames without clashing and keeps the file', () => {
    const m = newManifest('x');
    const a = addPosterEntry(m, 'A'), b = addPosterEntry(m, 'B');
    renamePosterEntry(m, b.id, 'a');
    expect(b.name).toBe('a 2');
    expect(b.file).toBe('posters/b.poster.json');
    renamePosterEntry(m, a.id, '   ');
    expect(a.name).toBe('A');
  });

  it('moves the active poster on when the active one is removed', () => {
    const m = newManifest('x');
    const a = addPosterEntry(m, 'A'), b = addPosterEntry(m, 'B'), c = addPosterEntry(m, 'C');
    m.active = c.id;
    expect(removePosterEntry(m, c.id)?.id).toBe(c.id);
    expect(m.active).toBe(b.id);
    m.active = a.id;
    removePosterEntry(m, b.id);
    expect(m.active).toBe(a.id);
    expect(removePosterEntry(m, 'nope')).toBeNull();
  });

  it('loads saved manifests and fills in missing fields', () => {
    const m = loadManifest({ posters: [{ file: 'posters/a.poster.json' }, { name: 'bad' }], active: 'gone' });
    expect(m.posters).toHaveLength(1);
    expect(m.posters[0].name).toBe('Poster');
    expect(m.active).toBe(m.posters[0].id);
    expect(m.name).toBe('Project');
    expect(() => loadManifest({ paper: {} })).toThrow();
  });
});

describe('poster tree', () => {
  const names = (m: ReturnType<typeof newManifest>) => {
    const walk = (ns: ReturnType<typeof posterTree>): unknown[] =>
      ns.map((n) => (n.children.length ? [n.poster.name, walk(n.children)] : n.poster.name));
    return walk(posterTree(m));
  };

  it('places variants below their base, in the list and the tree', () => {
    const m = newManifest('x');
    const a = addPosterEntry(m, 'A'), b = addPosterEntry(m, 'B');
    const a1 = addPosterEntry(m, 'A wide', a.id);
    addPosterEntry(m, 'A wide dark', a1.id);
    addPosterEntry(m, 'A tall', a.id);
    expect(m.posters.map((p) => p.name)).toEqual(['A', 'A wide', 'A wide dark', 'A tall', 'B']);
    expect(names(m)).toEqual([['A', [['A wide', ['A wide dark']], 'A tall']], 'B']);
    expect(b.parent).toBeNull();
  });

  it('moves posters, refusing loops', () => {
    const m = newManifest('x');
    const a = addPosterEntry(m, 'A'), b = addPosterEntry(m, 'B', a.id), c = addPosterEntry(m, 'C', b.id);
    expect(setPosterParent(m, a.id, c.id)).toBe(false);
    expect(setPosterParent(m, a.id, a.id)).toBe(false);
    expect(setPosterParent(m, c.id, null)).toBe(true);
    expect(names(m)).toEqual([['A', ['B']], 'C']);
  });

  it('gives the variants of a removed poster to its parent', () => {
    const m = newManifest('x');
    const a = addPosterEntry(m, 'A'), b = addPosterEntry(m, 'B', a.id);
    addPosterEntry(m, 'C', b.id);
    removePosterEntry(m, b.id);
    expect(names(m)).toEqual([['A', ['C']]]);
  });

  it('repairs missing or looping parents when loading', () => {
    const m = loadManifest({
      posters: [
        { id: 'a', file: 'a', parent: 'b' }, { id: 'b', file: 'b', parent: 'a' }, { id: 'c', file: 'c', parent: 'gone' },
      ],
    });
    expect(m.posters.filter((p) => p.parent === null).map((p) => p.id)).toEqual(expect.arrayContaining(['c']));
    expect(posterTree(m).length).toBeGreaterThanOrEqual(2); // nothing is lost in a loop
    const all: string[] = [];
    const walk = (ns: ReturnType<typeof posterTree>) => ns.forEach((n) => { all.push(n.poster.id); walk(n.children); });
    walk(posterTree(m));
    expect(all.sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('image library', () => {
  it('adds each source once, with unique names', () => {
    const m = newManifest('x');
    const a = addAsset(m, 'image', 'fig', 'assets/images/1.png');
    expect(addAsset(m, 'image', 'other', 'assets/images/1.png')).toBe(a);
    expect(addAsset(m, 'plot', 'fig', 'assets/plots/2.svg').name).toBe('fig 2');
    expect(m.assets).toHaveLength(2);
  });

  it('loads older manifests without a library', () => {
    expect(loadManifest({ posters: [] }).assets).toEqual([]);
    expect(nameFromFile('C:\\figs\\fig_3.final.png')).toBe('fig_3.final');
  });
});

describe('names and files', () => {
  it('slugifies names for file names', () => {
    expect(slugify('Variant B (wide)')).toBe('variant-b-wide');
    expect(slugify('Ångström café')).toBe('angstrom-cafe');
    expect(slugify('!!!')).toBe('poster');
  });

  it('numbers names that are taken, ignoring case', () => {
    expect(uniqueName('Poster', [])).toBe('Poster');
    expect(uniqueName('Poster', ['poster', 'Poster 2'])).toBe('Poster 3');
  });

  it('tells project files from inline or web images', () => {
    expect(isExternalSrc('assets/images/ab.png')).toBe(false);
    expect(isExternalSrc('data:image/png;base64,AAAA')).toBe(true);
    expect(isExternalSrc('https://example.org/a.png')).toBe(true);
  });

  it('picks image extensions from the type, else the file name', () => {
    expect(imageExt('image/jpeg')).toBe('jpg');
    expect(imageExt('', 'figure.SVG')).toBe('svg');
    expect(imageExt('', 'photo.jpeg')).toBe('jpg');
    expect(imageExt('', 'noext')).toBe('png');
  });

  it('decodes data URLs', () => {
    const png = decodeDataUrl('data:image/png;base64,iVBORw==');
    expect(png?.mime).toBe('image/png');
    expect([...png!.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const svg = decodeDataUrl('data:image/svg+xml,%3Csvg%3E%C3%A5%3C%2Fsvg%3E');
    expect(new TextDecoder().decode(svg!.bytes)).toBe('<svg>å</svg>');
    expect(decodeDataUrl('assets/images/a.png')).toBeNull();
  });
});
