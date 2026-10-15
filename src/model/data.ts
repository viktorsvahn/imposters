/* Data objects: the files in a project's data/ folder, read into values the
   way a MATLAB workspace shows them — a name, a size and a class. CSV / TSV
   files become tables; JSON becomes a table (a list of records), a numeric
   array, a struct, text …  Tables are written back as CSV. */

export type Cell = string | number | null;

export interface Table {
  columns: string[];
  rows: Cell[][];
}

export type DataValue =
  | { kind: 'table'; table: Table }
  | { kind: 'json'; value: unknown };

/** MATLAB-style class names. */
export type DataClass = 'table' | 'double' | 'logical' | 'char' | 'struct' | 'cell';

export const DATA_EXTENSIONS = ['csv', 'tsv', 'json'];

export const isDataFile = (name: string): boolean =>
  DATA_EXTENSIONS.includes(name.split('.').pop()!.toLowerCase());

/** The workspace name of a data file: a valid identifier ("2024 results.csv" → "x2024_results"). */
export function dataName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const id = base.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return !id ? 'data' : /^[A-Za-z]/.test(id) ? id : 'x' + id;
}

/* ---- CSV ---- */

/** Split delimited text into rows of fields (RFC 4180: quotes, "" escapes, newlines in quotes). */
export function parseCsv(text: string, delim = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const quote = (s: string, delim: string): string =>
  /["\r\n]/.test(s) || s.includes(delim) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;

/** Write a table as CSV (header row first). */
export function tableToCsv(t: Table, delim = ','): string {
  const line = (cells: Cell[]) => cells.map((c) => quote(c === null ? '' : String(c), delim)).join(delim);
  return [line(t.columns), ...t.rows.map(line)].join('\n') + '\n';
}

/** A cell's value: a number when it reads as one, null when empty, else the text. */
export function parseCell(s: string): Cell {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? n : s;
}

/** A table from delimited text whose first row holds the column names. */
export function tableFromCsv(text: string, delim = ','): Table {
  const [head = [], ...body] = parseCsv(text, delim);
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => head[i]?.trim() || `Var${i + 1}`);
  const rows = body.map((r) => columns.map((_, i) => parseCell(r[i] ?? '')));
  return { columns, rows };
}

/* ---- reading files ---- */

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v: unknown): v is Cell => v === null || typeof v === 'string' || typeof v === 'number';

/** A list of flat records ([{x: 1, y: 2}, …]) as a table; null if it isn't one. */
function recordsToTable(v: unknown[]): Table | null {
  if (!v.length || !v.every((r) => isRecord(r) && Object.values(r).every(isScalar))) return null;
  const columns = [...new Set(v.flatMap((r) => Object.keys(r as object)))];
  return { columns, rows: v.map((r) => columns.map((c) => ((r as Record<string, Cell>)[c] ?? null))) };
}

/** Read a data file's text into a value (throws on unreadable content). */
export function parseDataFile(fileName: string, text: string): DataValue {
  const ext = fileName.split('.').pop()!.toLowerCase();
  if (ext === 'csv' || ext === 'tsv') return { kind: 'table', table: tableFromCsv(text, ext === 'tsv' ? '\t' : ',') };
  const value = JSON.parse(text);
  const table = Array.isArray(value) ? recordsToTable(value) : null;
  return table ? { kind: 'table', table } : { kind: 'json', value };
}

/* ---- size and class ---- */

const isNumArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number');

/** Size and class, as a MATLAB workspace shows them ("12×3", "table"). */
export function describe(d: DataValue): { size: string; cls: DataClass } {
  if (d.kind === 'table') return { size: `${d.table.rows.length}×${d.table.columns.length}`, cls: 'table' };
  const v = d.value;
  if (typeof v === 'number') return { size: '1×1', cls: 'double' };
  if (typeof v === 'boolean') return { size: '1×1', cls: 'logical' };
  if (typeof v === 'string') return { size: `1×${v.length}`, cls: 'char' };
  if (isNumArray(v)) return { size: `1×${v.length}`, cls: 'double' };
  if (Array.isArray(v) && v.length && v.every(isNumArray) && v.every((r) => r.length === (v[0] as number[]).length)) {
    return { size: `${v.length}×${(v[0] as number[]).length}`, cls: 'double' };
  }
  if (Array.isArray(v) && v.every((x) => typeof x === 'boolean')) return { size: `1×${v.length}`, cls: 'logical' };
  if (isRecord(v)) return { size: '1×1', cls: 'struct' };
  return { size: `1×${Array.isArray(v) ? v.length : 1}`, cls: 'cell' };
}

/** A small new table to start from. */
export const blankTable = (): Table => ({ columns: ['A', 'B', 'C'], rows: [[null, null, null], [null, null, null]] });
