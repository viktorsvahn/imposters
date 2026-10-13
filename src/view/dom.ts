/* Lookups for the fixed elements of index.html. */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T =>
  root.querySelector(sel) as T;

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  [...root.querySelectorAll(sel)] as T[];

export interface Dom {
  stage: HTMLElement;
  sizer: HTMLElement;
  paper: HTMLElement;
  tiles: HTMLElement;
  scopeLayer: HTMLElement;
  grid: HTMLElement;
  guides: HTMLElement;
  hover: HTMLElement;
  hint: HTMLElement;
  toast: HTMLElement;
  fmtbar: HTMLElement;
}

export let dom: Dom;

export function bindDom(): void {
  dom = {
    stage: $('#stage'),
    sizer: $('#sizer'),
    paper: $('#paper'),
    tiles: $('#tiles'),
    scopeLayer: $('#scopeLayer'),
    grid: $('#grid'),
    guides: $('#guides'),
    hover: $('#hover'),
    hint: $('#hint'),
    toast: $('#toast'),
    fmtbar: $('#fmtbar'),
  };
}

/** Set a form control's value unless the user is typing in it. */
export function setVal(sel: string, v: string | number | boolean): void {
  const el = $<HTMLInputElement>(sel);
  if (!el || document.activeElement === el) return;
  if (el.type === 'checkbox') el.checked = !!v;
  else el.value = String(v);
}
