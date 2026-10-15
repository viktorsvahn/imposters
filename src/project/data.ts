/* The data workspace: every data file in the project's data/ folder, read and
   described (name, size, class) like variables in a MATLAB workspace. Tables
   made or edited here are saved back to their CSV files. */

import { render } from '../editor/hooks';
import {
  blankTable, dataName, describe, isDataFile, parseDataFile, tableToCsv, type DataClass, type DataValue, type Table,
} from '../model/data';
import { DATA_DIR } from '../model/project';
import { files } from './backend';

export interface DataItem {
  /** workspace name (from the file name) */
  name: string;
  /** file name inside data/ */
  file: string;
  value: DataValue | null;
  /** why the file could not be read */
  error: string;
  size: string;
  cls: DataClass | '';
}

/** `version` goes up whenever the items are read again. */
export const workspace = { items: [] as DataItem[], version: 0 };

/** Told which tables changed (saved, renamed, deleted), so plots drawn from them can follow. */
export const dataEvents = { changed: (_names: string[]): void => {} };

const pathOf = (file: string): string => `${DATA_DIR}/${file}`;

async function readItem(file: string): Promise<DataItem> {
  const item: DataItem = { name: dataName(file), file, value: null, error: '', size: '', cls: '' };
  try {
    item.value = parseDataFile(file, (await files.read(pathOf(file))) ?? '');
    Object.assign(item, describe(item.value));
  } catch (err) {
    item.error = (err as Error).message;
  }
  return item;
}

/** Read the data folder (again). */
export async function loadWorkspace(): Promise<void> {
  const names = (await files.list(DATA_DIR)).filter(isDataFile).sort((a, b) => a.localeCompare(b));
  workspace.items = await Promise.all(names.map(readItem));
  workspace.version++;
  render();
}

export const dataItem = (name: string): DataItem | undefined => workspace.items.find((d) => d.name === name);

/** A file name in data/ whose workspace name is free ("results" → "results_2.csv" if taken). */
function freeFile(base: string, ext: string, except?: DataItem): string {
  const taken = new Set(workspace.items.filter((d) => d !== except).map((d) => d.name.toLowerCase()));
  const stem = dataName(base + '.' + ext);
  let name = stem;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${stem}_${i}`;
  return `${name}.${ext}`;
}

/** Copy data files (CSV, TSV, JSON) into the project. Returns the new items. */
export async function importDataFiles(list: File[]): Promise<DataItem[]> {
  const added: string[] = [];
  for (const f of list.filter((x) => isDataFile(x.name))) {
    const ext = f.name.split('.').pop()!.toLowerCase();
    const file = freeFile(f.name.replace(/\.[^.]+$/, ''), ext);
    await files.write(pathOf(file), await f.text());
    added.push(file);
    workspace.items.push({ name: dataName(file), file, value: null, error: '', size: '', cls: '' }); // reserve the name
  }
  await loadWorkspace();
  const items = workspace.items.filter((d) => added.includes(d.file));
  dataEvents.changed(items.map((d) => d.name)); // a plot may have been waiting for a table of this name
  return items;
}

/** A new table, saved as data/<name>.csv. */
export async function newTable(name: string, table: Table = blankTable()): Promise<DataItem | undefined> {
  const file = freeFile(name, 'csv');
  await files.write(pathOf(file), tableToCsv(table));
  await loadWorkspace();
  return workspace.items.find((d) => d.file === file);
}

/** Save an edited table to its file. A table read from JSON is saved as a new .csv beside it. */
export async function saveTable(item: DataItem, table: Table): Promise<DataItem | undefined> {
  const tsv = /\.tsv$/i.test(item.file);
  const file = tsv || /\.csv$/i.test(item.file) ? item.file : freeFile(item.name, 'csv');
  await files.write(pathOf(file), tableToCsv(table, tsv ? '\t' : ','));
  await loadWorkspace();
  dataEvents.changed([item.name]);
  return workspace.items.find((d) => d.file === file);
}

export async function renameData(item: DataItem, name: string): Promise<void> {
  const file = freeFile(name, item.file.split('.').pop()!, item);
  if (file === item.file) return;
  const text = await files.read(pathOf(item.file));
  if (text === null) return;
  await files.write(pathOf(file), text);
  await files.remove(pathOf(item.file));
  await loadWorkspace();
  dataEvents.changed([item.name, dataName(file)]);
}

export async function deleteData(item: DataItem): Promise<void> {
  await files.remove(pathOf(item.file));
  await loadWorkspace();
  dataEvents.changed([item.name]);
}
