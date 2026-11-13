// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Topology } from 'topojson-specification';
import type { IndexRun, NodesFile } from '../../data/types';
import type { StackFile } from '../../v4/stack';
import type { CountyInput } from '../../v4/geo/search';
import { nearestNodes } from '../../v4/geo/nearest';
import type { NodeIndex, Place } from '../../v4/geo/types';
import type { GeoSource } from '../../v4/map/AtlasSite';
import type { SiteSource } from '../../v4/site/useSiteData';
import { nearbyBatteries, type BatteriesFile } from '../nearby';
import SiteReport, { type ReportSources } from './SiteReport';

afterEach(() => { cleanup(); window.history.replaceState(null, '', '#/'); vi.restoreAllMocks(); });
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
});

const rd = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), f), 'utf8'));
const geo = (f: string) => rd(`../results/v4/geo/${f}`);
const NODES: NodesFile = rd('../results/nodes_2025_2h.json');
const RUNS: IndexRun[] = rd('../results/index.json').runs;
const NODE_INDEX = geo('node_index.json') as NodeIndex;
const BATTERIES: BatteriesFile = rd('../results/v5/batteries/tx_batteries.json');
const geoSource: GeoSource = {
  places: async () => geo('places.json') as Place[],
  counties: async () => geo('county_index.json') as (CountyInput & { fips: string })[],
  topo: async () => geo('tx_counties.topo.json') as Topology,
  nodeIndex: async () => NODE_INDEX,
};
const nodeFiles = [{ year: 2024, durationH: 2, file: 'nodes_2024_2h.json' }, { year: 2025, durationH: 2, file: 'nodes_2025_2h.json' }];
function siteSource(stack: string[] = []): SiteSource {
  return {
    nodesManifest: async () => ({ files: nodeFiles }),
    nodesFile: async (f) => rd(`../results/${f}`) as NodesFile,
    runs: async () => RUNS,
    stackIndex: async () => ({ files: stack.map((f) => `${f}.json`) }),
    stackFile: async (y, d, m) => rd(`fixtures/v4/stack/${y}_${d}h_${m}.json`) as StackFile,
    priceLocations: async () => ['HB_NORTH', 'HB_HOUSTON', 'ANSON1_ALL'],
  };
}
const sources = (over: Partial<ReportSources> = {}): ReportSources => ({ geo: geoSource, site: siteSource(), nodes: async () => NODES, batteries: async () => BATTERIES, ...over });

function open(hash: string, src: ReportSources = sources()) {
  window.history.replaceState(null, '', hash);
  return render(<MantineProvider><SiteReport sources={src} /></MantineProvider>);
}

// Jack County: the same place the Atlas card tests use.
const JACK = '#/site?lat=33.2&lon=-98.2';
const usd1 = (x: number) => `$${x.toFixed(1)}`;

describe('site report', () => {
  it('shows the place, the $/kW-yr range over the 5 nearest priced nodes, and the nodes behind it', async () => {
    open(JACK);
    const range = await screen.findByTestId('site-range');
    const priced = Object.fromEntries(Object.entries(NODE_INDEX).filter(([c, n]) => n.kind === 'hub' || NODES.nodes.some((x) => x.code === c)));
    const near = nearestNodes(priced, 33.2, -98.2, 5);
    const v = near.nodes.map((n) => NODES.nodes.find((x) => x.code === n.code)!.da_rev);
    expect(range.textContent).toBe(`${usd1(Math.min(...v))} to ${usd1(Math.max(...v))}`);
    expect(screen.getByTestId('site-range-note').textContent).toContain('5 of 5 nearest nodes');
    expect(within(screen.getByTestId('site-nodes')).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByTestId('site-title').textContent).toMatch(/ County$/);
    expect(screen.getByTestId('site-where').textContent).toContain(near.nearestHub!.code);
    expect(screen.getByTestId('site-title').tagName).toBe('H1');
  });

  it('Storage nearby states the totals and the nearest units from the EIA file, with the release and a source link', async () => {
    open(JACK);
    await screen.findByTestId('site-storage');
    const n = nearbyBatteries(BATTERIES.units, 33.2, -98.2);
    const mw = (x: number) => `${Math.round(x).toLocaleString('en-US')} MW`;
    expect(screen.getByTestId('storage-operating').textContent).toBe(mw(n.operatingMw));
    expect(screen.getByTestId('storage-planned').textContent).toBe(mw(n.plannedMw));
    const section = screen.getByTestId('site-storage');
    if (n.nearest.length) {
      const rows = within(screen.getByTestId('storage-nearest')).getAllByRole('listitem');
      expect(rows).toHaveLength(n.nearest.length);
      expect(rows[0].textContent).toContain(n.nearest[0].name);
    }
    expect(section.textContent).toContain('September 2026 release');
    expect(within(section).getByRole('link', { name: /EIA-860M/ }).getAttribute('href')).toBe(BATTERIES.sourceUrl);
    expect(section.textContent).toContain('lower the price spreads');
  });

  it('hides Storage nearby when the batteries file is missing, and the rest of the report still works', async () => {
    open(JACK, sources({ batteries: async () => null }));
    await screen.findByTestId('site-range');
    expect(screen.queryByTestId('site-storage')).toBeNull();
    expect(screen.getByTestId('site-limits')).toBeTruthy();
  });

  it('writes the settings into the address, keeps other parameters, and a copied link opens the same view', async () => {
    open(`${JACK}&v5=1`);
    await screen.findByTestId('site-range');
    await waitFor(() => expect(window.location.hash).toBe('#/site?lat=33.2000&lon=-98.2000&dur=2&year=2025&v5=1'));
    fireEvent.click(screen.getByTestId('site-year-2024'));
    await waitFor(() => expect(window.location.hash).toContain('year=2024'));
    expect(screen.getByTestId('site-range-note').textContent).toContain('2024');
    const link = window.location.hash;
    cleanup();
    open(link);
    await screen.findByTestId('site-range');
    expect(screen.getByTestId('site-range-note').textContent).toContain('2024');
  });

  it('reads basis=stack from the address and switches back to Energy', async () => {
    open(`${JACK}&basis=stack`, sources({ site: siteSource(['2025_2h_realistic', '2025_2h_foresight']) }));
    await screen.findByTestId('site-range');
    expect(screen.getByTestId('site-basis-stack').getAttribute('aria-pressed')).toBe('true');
    expect(window.location.hash).toContain('basis=stack');
    fireEvent.click(screen.getByTestId('site-basis-energy'));
    await waitFor(() => expect(window.location.hash).not.toContain('basis=stack'));
  });

  it('For a data center has no numbers and one link that opens Data Center mode at this place', async () => {
    open(JACK);
    const link = await screen.findByTestId('site-dc');
    const section = screen.getByTestId('site-dc-section');
    expect(section.textContent).not.toMatch(/\d/);
    const q = new URLSearchParams(link.getAttribute('href')!.split('?')[1]);
    expect(link.getAttribute('href')).toMatch(/^#\/studio\?/);
    expect(q.get('mode')).toBe('dc');
    expect(q.get('lat')).toBe('33.2000');
    expect(q.get('lon')).toBe('-98.2000');
  });

  it('Limits lists the Site Value caveats, and Copy link and Print work', async () => {
    open(JACK);
    await screen.findByTestId('site-range');
    const limits = screen.getByTestId('site-limits');
    expect(limits.textContent).toContain('A backtest of past prices, not a forecast.');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(screen.getByTestId('site-copy'));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    const print = vi.fn();
    window.print = print;
    fireEvent.click(screen.getByTestId('site-print-btn'));
    expect(print).toHaveBeenCalled();
  });

  it('the print sheet carries the Storage nearby block', async () => {
    open(JACK);
    await screen.findByTestId('site-range');
    const sheet = screen.getByTestId('site-print');
    expect(sheet.textContent).toContain('Storage nearby');
    expect(sheet.textContent).toContain('release September 2026');
    expect(sheet.textContent).toContain(BATTERIES.sourceUrl);
  });

  it('a point outside Texas, and an address with no point, show a plain message with a way out', async () => {
    open('#/site?lat=40.7&lon=-74');
    expect((await screen.findByTestId('site-state')).textContent).toContain('outside Texas');
    cleanup();
    open('#/site');
    expect((await screen.findByTestId('site-state')).textContent).toContain('Pick a place first');
    expect(screen.getByRole('link', { name: 'Search on Home' }).getAttribute('href')).toBe('#/home');
  });

  it('says so when no priced node is placed near the point, and still shows Storage nearby', async () => {
    open(JACK, sources({ nodes: async () => ({ ...NODES, nodes: [] }) }));
    expect((await screen.findByTestId('site-no-node')).textContent).toContain('No node with prices');
    expect(screen.queryByTestId('site-range')).toBeNull();
    expect(screen.getByTestId('site-storage')).toBeTruthy();
  });

  it('shows a loading state, then an error state when the node index fails', async () => {
    open(JACK, sources({ geo: { ...geoSource, nodeIndex: async () => { throw new Error('boom'); } } }));
    expect(screen.getByTestId('site-loading')).toBeTruthy();
    expect((await screen.findByTestId('site-state')).textContent).toContain('Could not load the results');
  });
});
