/* Plots in the project. Each is two files in assets/plots/: <id>.plot.json
   (the plot: panels, layers, axes …) and <id>.svg (its picture — vector, with
   hover text on every data mark — shown on posters and in the image pool).
   When a table changes, the plots drawn from it are drawn again. */

import * as vega from 'vega';
import { compile, type TopLevelSpec } from 'vega-lite';
import type { Table } from '../model/data';
import { compilePlot, finishSvg, loadPlot, type PlotSpec } from '../model/plot';
import { type AssetEntry } from '../model/project';
import { uid } from '../util';
import { setPlotSvg } from '../view/plot-svg';
import { files } from './backend';
import { workspace } from './data';
import { addPlotAsset, project } from './session';

export const PLOT_DIR = 'assets/plots';

/** The plot file that belongs to a plot's picture (assets/plots/x.svg → x.plot.json). */
export const plotFileOf = (svgSrc: string): string => svgSrc.replace(/\.svg$/, '.plot.json');

/** The workspace tables, by name. */
export function workspaceTables(): Record<string, Table> {
  const out: Record<string, Table> = {};
  for (const d of workspace.items) if (d.value?.kind === 'table') out[d.name] = d.value.table;
  return out;
}

/** Draw a plot: its SVG, and what is wrong with it (missing data, bad spec …). */
export async function renderPlot(spec: PlotSpec): Promise<{ svg: string; errors: string[] }> {
  const { vl, errors } = compilePlot(spec, workspaceTables());
  try {
    const view = new vega.View(vega.parse(compile(vl as unknown as TopLevelSpec).spec), { renderer: 'none' });
    const svg = finishSvg(await view.toSVG());
    view.finalize();
    return { svg, errors };
  } catch (err) {
    return { svg: '', errors: [...errors, (err as Error).message] };
  }
}

export async function readPlot(a: AssetEntry): Promise<PlotSpec> {
  return loadPlot(JSON.parse((await files.read(plotFileOf(a.src))) || 'null'));
}

/** Save a plot (new, or over `asset`) and its picture; it joins the image library. */
export async function savePlot(spec: PlotSpec, name: string, asset: AssetEntry | null): Promise<AssetEntry | null> {
  const src = asset?.src ?? `${PLOT_DIR}/${uid()}.svg`;
  const { svg } = await renderPlot(spec);
  await files.write(plotFileOf(src), JSON.stringify(spec, null, 1));
  await files.write(src, svg);
  setPlotSvg(src, svg);
  return addPlotAsset(name, src, asset?.id ?? null);
}

/** Tables a plot draws from (a hand-written spec may use any of them). */
function usesData(spec: PlotSpec, names: string[]): boolean {
  if (spec.raw) return true;
  return spec.panels.some((p) => p.layers.some((l) => names.includes(l.data)));
}

/** Draw the plots that use any of these tables again. */
export async function refreshPlots(names: string[]): Promise<void> {
  for (const a of project.manifest?.assets.filter((x) => x.kind === 'plot') ?? []) {
    try {
      const spec = await readPlot(a);
      if (!usesData(spec, names)) continue;
      const { svg } = await renderPlot(spec);
      if (!svg) continue;
      await files.write(a.src, svg);
      setPlotSvg(a.src, svg);
    } catch {
      /* an unreadable plot file stays as it is */
    }
  }
}
