import { describe, expect, it } from 'vitest';
import { dataName, describe as describeValue, parseCell, parseCsv, parseDataFile, tableFromCsv, tableToCsv } from '../../src/model/data';

describe('CSV', () => {
  it('reads quotes, escaped quotes, newlines in quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"two\nlines",3\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', '3']]);
  });

  it('makes a table with numbers, empty cells and named columns', () => {
    const t = tableFromCsv('\uFEFFsize,energy,\n10,-1.5e2,x\n20,,\n');
    expect(t.columns).toEqual(['size', 'energy', 'Var3']);
    expect(t.rows).toEqual([[10, -150, 'x'], [20, null, null]]);
  });

  it('round-trips through CSV', () => {
    const t = { columns: ['name', 'note'], rows: [['a, b', 'say "x"'], [1.5, null]] };
    expect(tableFromCsv(tableToCsv(t))).toEqual(t);
  });

  it('keeps things that only look like numbers as text', () => {
    expect(parseCell('0x10')).toBe('0x10');
    expect(parseCell(' 42 ')).toBe(42);
    expect(parseCell('1,5')).toBe('1,5');
  });
});

describe('data files', () => {
  it('reads TSV and record lists as tables', () => {
    expect(parseDataFile('a.tsv', 'x\ty\n1\t2\n')).toEqual({ kind: 'table', table: { columns: ['x', 'y'], rows: [[1, 2]] } });
    const d = parseDataFile('r.json', '[{"n": 1, "e": 2}, {"n": 2, "f": "x"}]');
    expect(d).toEqual({ kind: 'table', table: { columns: ['n', 'e', 'f'], rows: [[1, 2, null], [2, null, 'x']] } });
  });

  it('describes values like a MATLAB workspace', () => {
    const json = (v: unknown) => describeValue({ kind: 'json', value: v });
    expect(describeValue(parseDataFile('t.csv', 'a,b\n1,2\n3,4\n5,6\n'))).toEqual({ size: '3×2', cls: 'table' });
    expect(json(3)).toEqual({ size: '1×1', cls: 'double' });
    expect(json([1, 2, 3])).toEqual({ size: '1×3', cls: 'double' });
    expect(json([[1, 2], [3, 4], [5, 6]])).toEqual({ size: '3×2', cls: 'double' });
    expect(json({ a: 1 })).toEqual({ size: '1×1', cls: 'struct' });
    expect(json('hello')).toEqual({ size: '1×5', cls: 'char' });
    expect(json([true, false])).toEqual({ size: '1×2', cls: 'logical' });
    expect(json([1, 'a'])).toEqual({ size: '1×2', cls: 'cell' });
  });

  it('names data like variables', () => {
    expect(dataName('Table 1 (MAE).csv')).toBe('Table_1_MAE');
    expect(dataName('2024 results.json')).toBe('x2024_results');
    expect(dataName('Ångström.csv')).toBe('Angstrom');
  });
});
