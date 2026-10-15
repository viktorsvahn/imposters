/* Plot pictures shown inline (not as <img>), so hovering over their marks can
   show the data behind them. Pictures are read from the project once and kept
   here; saving or redrawing a plot replaces its entry. */

import { hooks } from '../editor/hooks';
import { files } from '../project/backend';

const cache = new Map<string, string>();
const loading = new Set<string>();
let revision = 0;

export const isPlotSrc = (src: string): boolean => /^assets\/plots\/[^/]+\.svg$/.test(src);

/** The picture of a plot, or undefined while it is being read (the page redraws when it is there). */
export function plotSvg(src: string): string | undefined {
  const svg = cache.get(src);
  if (svg !== undefined || loading.has(src)) return svg;
  loading.add(src);
  void files.read(src).then((text) => {
    loading.delete(src);
    cache.set(src, text ?? '');
    revision++;
    hooks.render();
  });
  return undefined;
}

export function setPlotSvg(src: string, svg: string): void {
  cache.set(src, svg);
  revision++;
  hooks.render();
}

/** Changes whenever a picture changes (part of the tile's content key). */
export const plotRevision = (): number => revision;

/** Forget all pictures (another project was opened). */
export function forgetPlots(): void {
  cache.clear();
  revision++;
}
