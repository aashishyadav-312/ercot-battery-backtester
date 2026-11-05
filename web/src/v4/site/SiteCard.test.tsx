// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Topology } from 'topojson-specification';
import { mapDots, outlinePath } from '../../data/atlas';
import type { IndexRun, NodesFile } from '../../data/types';
import AtlasSite, { type GeoSource } from '../map/AtlasSite';
import type { CountyInput } from '../geo/search';
import type { NodeIndex, Place } from '../geo/types';
import type { StackFile } from '../stack';
import { medianOf } from './siteValue';
import type { SiteSource } from './useSiteData';

afterEach(() => { cleanup(); window.history.replaceState(null, '', '#/atlas'); vi.restoreAllMocks(); });
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
});

const rd = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), f), 'utf8'));
const geo = (f: string) => rd(`../results/v4/geo/${f}`);
const NODES: NodesFile = rd('../results/nodes_2025_2h.json');
const RUNS: IndexRun[] = rd('../results/index.json').runs;
const NODE_INDEX = geo('node_index.json') as NodeIndex;
const geoSource: GeoSource = {
  places: async () => geo('places.json') as Place[],
  counties: async () => geo('county_index.json') as (CountyInput & { fips: string })[],
  topo: async () => geo('tx_counties.topo.json') as Topology,
  nodeIndex: async () => NODE_INDEX,
};
const OUTLINE = outlinePath({
  source: 'test',
  state: { type: 'Feature', properties: { name: 'Texas' }, geometry: { type: 'Polygon', coordinates: [[[-106, 36], [-94, 36], [-94, 26], [-106, 26], [-106, 36]]] } },
  counties: { type: 'FeatureCollection', features: [] },
});
const FIXTURES = ['2025_2h_foresight', '2025_2h_realistic', '2026_2h_realistic'];
const nodeFiles = [{ year: 2024, durationH: 2, file: 'nodes_2024_2h.json' }, { year: 2025, durationH: 2, file: 'nodes_2025_2h.json' }];

function siteSource(stackFiles: string[] = []): SiteSource {
  return {
    nodesManifest: async () => ({ files: nodeFiles }),
    nodesFile: async (f) => rd(`../results/${f}`) as NodesFile,
    runs: async () => RUNS,
    stackIndex: async () => ({ files: stackFiles.map((f) => `${f}.json`) }),
    stackFile: async (y, d, m) => rd(`fixtures/v4/stack/${y}_${d}h_${m}.json`) as StackFile,
    priceLocations: async () => ['HB_NORTH', 'HB_HOUSTON', 'ANSON1_ALL'],
  };
}

function setup(src: SiteSource = siteSource()) {
  const zoneOf = new Map(NODES.nodes.map((n) => [n.code, n.lz]));
  render(
    <MantineProvider>
      <AtlasSite source={geoSource} siteSource={src} outline={OUTLINE} dots={mapDots(NODES.nodes, 'rev')} metric="rev" zoneOf={zoneOf} zone={null} selected={null} onSelect={() => {}} label="Map of Texas" />
    </MantineProvider>,
  );
  return { zoneOf, box: () => screen.getByRole('combobox') as HTMLInputElement };
}
async function pin(box: () => HTMLInputElement, q: string) {
  await waitFor(() => expect(screen.queryByText('Loading places')).toBeNull());
  fireEvent.change(box(), { target: { value: q } });
  await screen.findAllByRole('option');
  fireEvent.keyDown(box(), { key: 'Enter' });
  await screen.findByTestId('site-panel');
}

describe('Site Value card', () => {
  it('shows the $/kW-yr range, median and node count from the result files', async () => {
    const { box } = setup();
    await pin(box, 'Jack County');
    const range = await screen.findByTestId('site-range');
    const list = within(screen.getByTestId('near-list'));
    const codes = list.getAllByRole('button').map((b) => b.querySelector('span:nth-child(2) > span')!.textContent!);
    const rev = (c: string) => NODES.nodes.find((n) => n.code === c)!.da_rev; // default mode: the day-ahead plan
    const v = codes.map(rev);
    const usd1 = (x: number) => `$${x.toFixed(1)}`;
    expect(range.textContent).toBe(`${usd1(Math.min(...v))} to ${usd1(Math.max(...v))}`);
    expect(screen.getByTestId('site-range-note').textContent).toContain(`median ${usd1(medianOf(v))}, 5 of 5 nearest nodes`);
  });

  it('names the county and the nearest city, and shows the node-count note', async () => {
    const { box } = setup();
    await pin(box, '33.2, -98.2');
    await waitFor(() => expect(screen.getByTestId('site-where').textContent).toContain('Jack County'));
    expect(screen.getByTestId('site-where').textContent).toMatch(/km from /);
    const note = screen.getByTestId('near-priced').textContent!;
    expect(note).toMatch(/Only nodes with price data are listed: \d+ of \d+ placed nodes/);
    const [priced, indexed] = [...note.matchAll(/(\d+) of (\d+) placed/g)][0].slice(1).map(Number);
    expect(priced).toBeLessThanOrEqual(indexed);
    expect(priced).toBe(NODES.nodes.filter((n) => NODE_INDEX[n.code]?.kind === 'node').length);
  });

  it('mode and year change the figure; the year strip lists each year with a result, hub-only years included', async () => {
    const { box } = setup();
    await pin(box, 'Jack County');
    await screen.findByTestId('site-range');
    const strip = within(screen.getByTestId('site-strip'));
    expect(strip.getAllByRole('button').map((b) => b.textContent!.slice(0, 4))).toEqual(['2024', '2025', '2026']);
    expect(screen.getByTestId('site-year-2026').textContent).toContain('hub');
    const before = screen.getByTestId('site-range').textContent;
    fireEvent.click(screen.getByTestId('site-mode-foresight'));
    await waitFor(() => expect(screen.getByTestId('site-range').textContent).not.toBe(before));
    fireEvent.click(screen.getByTestId('site-year-2024'));
    await waitFor(() => expect(screen.getByTestId('site-range-note').textContent).toContain('2024'));
    fireEvent.click(screen.getByTestId('site-year-2026'));
    await waitFor(() => expect(screen.getByTestId('site-range-note').textContent).toMatch(/No all-node result/));
  });

  it('has no Full stack switch while the stack index lists nothing', async () => {
    const { box } = setup(siteSource([]));
    await pin(box, 'Jack County');
    await screen.findByTestId('site-range');
    expect(screen.queryByTestId('site-basis-stack')).toBeNull();
  });

  it('shows Full stack when the index lists a file, and uses only listed files', async () => {
    const src = siteSource(FIXTURES);
    const stackFile = vi.spyOn(src, 'stackFile');
    const { box } = setup(src);
    await pin(box, 'Jack County');
    await screen.findByTestId('site-basis-stack');
    fireEvent.click(screen.getByTestId('site-basis-stack'));
    await waitFor(() => expect(screen.getByTestId('stack-fixture')).toBeTruthy());
    // Default mode is realistic: only the realistic files in the index are asked for.
    await waitFor(() => expect(stackFile).toHaveBeenCalled());
    expect(stackFile.mock.calls.every(([, d, m]) => d === 2 && m === 'realistic')).toBe(true);
    expect(stackFile.mock.calls.map(([y]) => y).sort()).toEqual([2025, 2026]);
    // The perfect-foresight switch exists because 2025_2h_foresight is listed.
    expect(screen.getByTestId('site-mode-foresight')).toBeTruthy();
  });

  it('writes the site and settings into the address, and a link with them opens on that site', async () => {
    const { box } = setup();
    await pin(box, '33.2, -98.2');
    await screen.findByTestId('site-range');
    await waitFor(() => expect(window.location.hash).toContain('lat=33.2000'));
    expect(window.location.hash).toMatch(/lon=-98\.2000&dur=2&year=2025&mode=realistic/);
    fireEvent.click(screen.getByTestId('site-year-2024'));
    await waitFor(() => expect(window.location.hash).toContain('year=2024'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear site' }));
    await waitFor(() => expect(window.location.hash).not.toContain('lat='));

    cleanup();
    window.history.replaceState(null, '', '#/atlas?lat=33.2&lon=-98.2&dur=2&year=2024&mode=foresight');
    setup();
    await screen.findByTestId('site-panel');
    await waitFor(() => expect(screen.getByTestId('site-range-note').textContent).toContain('perfect foresight'));
    expect(screen.getByTestId('site-range-note').textContent).toContain('2024');
  });

  it('a link outside Texas, or with only one coordinate, opens no site', async () => {
    window.history.replaceState(null, '', '#/atlas?lat=45&lon=-98');
    setup();
    await screen.findByRole('combobox');
    expect(screen.queryByTestId('site-panel')).toBeNull();
  });

  it('Copy link, Download CSV, Print and Open in Studio', async () => {
    const { box } = setup();
    await pin(box, 'Jack County');
    await screen.findByTestId('site-range');
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(screen.getByTestId('site-status').textContent).toBe('Link copied.'));
    expect(write.mock.calls[0][0]).toContain('lat=');

    let csv = '';
    URL.createObjectURL = vi.fn((b: Blob) => { b.text().then((t) => { csv = t; }); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(csv).toContain('Site,Latitude,Longitude,Year'));
    expect(csv).toContain('Jack County');
    expect(csv).toContain('Median');

    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
    const sheet = screen.getByTestId('site-print');
    expect(sheet.textContent).toContain('Jack County');
    expect(sheet.textContent).toContain('not a forecast');

    const studio = screen.getByTestId('site-studio') as HTMLAnchorElement;
    expect(studio.getAttribute('href')).toMatch(/^#\/studio\?loc=(HB_NORTH|HB_HOUSTON|ANSON1_ALL)&dur=2&year=2025&strat=da$/);
  });

  it('keeps working when the result files do not load', async () => {
    const dead: SiteSource = { ...siteSource(), nodesManifest: async () => { throw new Error('x'); }, runs: async () => { throw new Error('x'); }, stackIndex: async () => { throw new Error('x'); }, priceLocations: async () => { throw new Error('x'); } };
    const { box } = setup(dead);
    await pin(box, 'Jack County');
    await waitFor(() => expect(screen.getByTestId('site-range-note').textContent).toMatch(/No result/));
    expect(within(screen.getByTestId('near-list')).getAllByRole('button')).toHaveLength(5);
  });
});
