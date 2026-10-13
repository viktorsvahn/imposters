export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Round to 0.1 (mm / pt values shown to people). */
export const round = (v: number): number => Math.round(v * 10) / 10;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function rgbToHex(c: string | null | undefined): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  return m ? '#' + m.slice(1, 4).map((n) => (+n).toString(16).padStart(2, '0')).join('') : '';
}

export const escapeHtml = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
