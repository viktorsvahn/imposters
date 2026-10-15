import { describe, expect, it } from 'vitest';
import * as vega from 'vega';
import { compile } from 'vega-lite';
import { tableFromCsv } from '../../src/model/data';
import {
  applyChartType, CHART_TYPES, compilePlot, defaultPlot, finishSvg, guessChartType, LAYER_KINDS, loadPlot, mainLayer, newLayer,
  newPanel, newPlot, splitPanel, type PlotSpec,
} from '../../src/model/plot';

const results = tableFromCsv(`property,label,kind,value,err,note
density,PBE-D3,Periodic,1.23,0.02,committee SE
density,Small,Cluster,1.37,0.055,22 models
diffusivity,PBE-D3,Periodic,8.5,,fit CI
diffusivity,Small,Cluster,4.2,1.8,3 seeds
`);
const forestTable = tableFromCsv(`property,label,kind,value,err,note
density,PBE-D3,Periodic,1.23,0.02,committee SE
density,PBE-D2,Periodic,1.34,0.02,committee SE
density,Small,Cluster,1.37,0.055,22 models
density,Large,Cluster,1.33,0.055,3 seeds
diffusivity,PBE-D3,Periodic,8.5,,fit CI
diffusivity,PBE-D2,Periodic,6.5,,fit CI
diffusivity,Small,Cluster,4.2,1.8,3 seeds
diffusivity,Large,Cluster,5.3,1.6,3 seeds
`);
const expt = tableFromCsv('property,value\ndensity,1.312\ndiffusivity,8.0\n');
const tables = { results, expt };

/** The forest plot of the example poster: band, reference line, points with error bars, one panel per property. */
function forest(): PlotSpec {
  const band = newLayer('vspan', 'results');
  band.valueField = 'value';
  band.filter = { field: 'kind', value: 'Periodic' };
  const ref = newLayer('vline', 'expt');
  ref.valueField = 'value';
  const pts = newLayer('scatter', 'results', 'value', 'label');
  Object.assign(pts, { color: 'kind', xerr: 'err', hover: ['note'] });
  const panel = newPanel([band, ref, pts]);
  panel.y.colorLabels = true;
  const spec = newPlot([panel]);
  splitPanel(spec, panel.id, 'property', tables);
  return spec;
}

async function svgOf(spec: PlotSpec): Promise<string> {
  const { vl, errors } = compilePlot(spec, tables);
  expect(errors).toEqual([]);
  const view = new vega.View(vega.parse(compile(vl as never).spec), { renderer: 'none' });
  return finishSvg(await view.toSVG());
}

describe('plots', () => {
  it('guesses a chart and its columns from the table', () => {
    // values with an error column and categories: dots ± error, labels down the side, split by property, notes on hover
    const spec = defaultPlot('forest', forestTable);
    const l = mainLayer(spec)!;
    expect(spec.chart).toBe('dots');
    expect([l.kind, l.x, l.y, l.color, l.xerr]).toEqual(['scatter', 'value', 'label', 'kind', 'err']);
    expect(l.hover).toEqual(['note']);
    expect(spec.panels[0].split).toBe('property');
    expect(guessChartType(tableFromCsv('t,a,b\n1,2,3\n'))).toBe('scatter');
    expect(guessChartType(tableFromCsv('name,v\nx,2\n'))).toBe('bar');
  });

  it('changes chart type keeping the columns that fit', () => {
    const spec = defaultPlot('forest', forestTable);
    applyChartType(spec, 'grouped', 'forest', forestTable);
    let l = mainLayer(spec)!;
    expect([l.kind, l.y, l.color]).toEqual(['bar', 'value', 'kind']);
    expect(spec.panels[0].split).toBe('property'); // kept
    applyChartType(spec, 'band', 'forest', forestTable);
    expect(spec.panels[0].layers.map((x) => x.kind)).toEqual(['area', 'line']);
    l = mainLayer(spec)!;
    expect(l.kind).toBe('line');
  });

  it('draws every chart type', async () => {
    for (const { id } of CHART_TYPES) {
      const spec = defaultPlot('forest', forestTable, id);
      const { vl, errors } = compilePlot(spec, { forest: forestTable });
      expect(errors, id).toEqual([]);
      const view = new vega.View(vega.parse(compile(vl as never).spec), { renderer: 'none' });
      await expect(view.toSVG(), id).resolves.toContain('<svg');
    }
  });

  it('splits into one panel per value without copying the panel', () => {
    const spec = defaultPlot('forest', forestTable);
    spec.panels[0].splitTitles = { density: { title: 'Density', subtitle: 'g cm⁻³' } };
    const { vl } = compilePlot(spec, { forest: forestTable });
    const titles = (vl.concat as { title: { text: string; subtitle?: string } }[]).map((p) => [p.title.text, p.title.subtitle]);
    expect(titles).toEqual([['Density', 'g cm⁻³'], ['diffusivity', undefined]]);
    expect(spec.panels).toHaveLength(1);
  });

  it('splits a panel into one panel per value, each filtered', () => {
    const spec = forest();
    expect(spec.panels.map((p) => [p.title, p.filter])).toEqual([
      ['density', { field: 'property', value: 'density' }], ['diffusivity', { field: 'property', value: 'diffusivity' }],
    ]);
    expect(new Set(spec.panels.flatMap((p) => p.layers.map((l) => l.id))).size).toBe(6); // copies get their own layers
  });

  it('compiles panels side by side with one shared colour scale and coloured category labels', () => {
    const { vl } = compilePlot(forest(), tables);
    const concat = vl.concat as { layer: { encoding?: Record<string, { scale?: { domain?: string[] }; axis?: { labelColor?: unknown } }> }[] }[];
    expect(concat).toHaveLength(2);
    const pts = concat[0].layer.at(-1)!.encoding!;
    expect(pts.color.scale!.domain).toEqual(['Periodic', 'Cluster']);
    expect(JSON.stringify(pts.y.axis!.labelColor)).toContain('PBE-D3');
  });

  it('works out reference lines and bands from the rows of each panel', () => {
    const { vl } = compilePlot(forest(), tables);
    const layers = (vl.concat as { layer: { mark: { type: string }; encoding: Record<string, { datum?: number }> }[] }[])[1].layer;
    expect(layers[0].encoding.x.datum).toBe(8.5); // band: min–max of the periodic values (one row here)
    expect(layers[1].encoding.x.datum).toBe(8.0); // line: the experiment for this panel
  });

  it('puts hover text on data marks only', async () => {
    const svg = await svgOf(forest());
    const labels = [...svg.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(4); // one per point; no axes, bands, lines or error bars
    expect(labels[0]).toBe('label: PBE-D3&#xA;value: 1.23&#xA;kind: Periodic&#xA;err: 0.02&#xA;note: committee SE');
    expect(labels[2]).not.toContain('err'); // empty values are left out
  });

  it('renders every kind of layer', async () => {
    for (const { kind } of LAYER_KINDS) {
      const l = newLayer(kind, 'results', kind === 'hist' ? 'value' : 'label', 'value');
      Object.assign(l, { value: 1, from: 1, to: 2, yerr: 'err', text: 'note', color: kind === 'bar' ? 'kind' : '' });
      if (kind === 'line' || kind === 'scatter' || kind === 'area') l.x = 'err';
      await expect(svgOf(newPlot([newPanel([l])])), kind).resolves.toContain('<svg');
    }
  });

  it('puts grouped bars side by side, also on a numeric x', () => {
    const sizes = tableFromCsv('n,set,count\n1,A,10\n1,B,20\n2,A,30\n');
    const l = newLayer('bar', 'sizes', 'n', 'count');
    l.color = 'set';
    const { vl } = compilePlot(newPlot([newPanel([l])]), { sizes });
    const enc = (vl.layer as { encoding: Record<string, { type?: string; field?: string; stack?: null }> }[])[0].encoding;
    expect(enc.x.type).toBe('ordinal');
    expect(enc.xOffset.field).toBe('set');
    expect(enc.y.stack).toBeNull();
  });

  it('reports missing data and columns instead of failing', () => {
    const spec = newPlot([newPanel([newLayer('scatter', 'nope', 'a', 'b'), newLayer('line', 'results', 'value', 'missing')])]);
    expect(compilePlot(spec, tables).errors).toEqual(['No data called “nope”', '“results” has no column “missing”']);
  });

  it('loads older or partial plot files', () => {
    const p = loadPlot({ title: 'T', panels: [{ layers: [{ kind: 'line', data: 'results' }] }] });
    expect(p.title).toBe('T');
    expect(p.panels[0].x.scale).toBe('linear');
    expect(p.panels[0].layers[0].size).toBe(2);
    expect(loadPlot(null).panels).toHaveLength(1);
  });

  it('dots by group leave a gap on the axis between the groups', () => {
    const spec = defaultPlot('forest', forestTable);
    expect(spec.panels[0].y.groupGap).toBe(true);
    const json = JSON.stringify(compilePlot(spec, { forest: forestTable }).vl);
    expect(json).toContain('"domain":["PBE-D3","PBE-D2","\u2063","Small","Large"]');
    spec.panels[0].y.groupGap = false;
    expect(JSON.stringify(compilePlot(spec, { forest: forestTable }).vl)).not.toContain('\u2063');
  });
});
