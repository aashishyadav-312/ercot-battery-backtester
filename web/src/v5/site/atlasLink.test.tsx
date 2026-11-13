// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Topology } from 'topojson-specification';
import { mapDots, outlinePath } from '../../data/atlas';
import type { IndexRun, NodesFile } from '../../data/types';
import AtlasSite, { type GeoSource } from '../../v4/map/AtlasSite';
import type { CountyInput } from '../../v4/geo/search';
import type { NodeIndex, Place } from '../../v4/geo/types';
import type { SiteSource } from '../../v4/site/useSiteData';

// The Atlas card gets an "Open site report" link only with V5 on. The flag is a constant, so each case sets it before the module loads.
const flag = vi.hoisted(() => ({ v5: true }));
vi.mock('../../config/features', async (orig) => ({ ...(await orig<typeof import('../../config/features')>()), get V5() { return flag.v5; } }));

afterEach(() => { cleanup(); window.history.replaceState(null, '', '#/atlas'); });
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
});

const rd = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), f), 'utf8'));
const geo = (f: string) => rd(`../results/v4/geo/${f}`);
const NODES: NodesFile = rd('../results/nodes_2025_2h.json');
const RUNS: IndexRun[] = rd('../results/index.json').runs;
const geoSource: GeoSource = {
  places: async () => geo('places.json') as Place[],
  counties: async () => geo('county_index.json') as (CountyInput & { fips: string })[],
  topo: async () => geo('tx_counties.topo.json') as Topology,
  nodeIndex: async () => geo('node_index.json') as NodeIndex,
};
const siteSource: SiteSource = {
  nodesManifest: async () => ({ files: [{ year: 2025, durationH: 2, file: 'nodes_2025_2h.json' }] }),
  nodesFile: async (f) => rd(`../results/${f}`) as NodesFile,
  runs: async () => RUNS,
  stackIndex: async () => ({ files: [] }),
  stackFile: async () => { throw new Error('none'); },
  priceLocations: async () => ['HB_NORTH'],
};
const OUTLINE = outlinePath({
  source: 'test',
  state: { type: 'Feature', properties: { name: 'Texas' }, geometry: { type: 'Polygon', coordinates: [[[-106, 36], [-94, 36], [-94, 26], [-106, 26], [-106, 36]]] } },
  counties: { type: 'FeatureCollection', features: [] },
});

async function pinJack() {
  render(
    <MantineProvider>
      <AtlasSite
        source={geoSource} siteSource={siteSource} outline={OUTLINE} dots={mapDots(NODES.nodes, 'rev')} metric="rev"
        zoneOf={new Map(NODES.nodes.map((n) => [n.code, n.lz]))} zone={null} selected={null} onSelect={() => {}} label="Map of Texas"
      />
    </MantineProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Loading places')).toBeNull());
  const box = screen.getByRole('combobox');
  fireEvent.change(box, { target: { value: 'Jack County' } });
  await screen.findAllByRole('option');
  fireEvent.keyDown(box, { key: 'Enter' });
  await screen.findByTestId('site-panel');
  await screen.findByTestId('site-range');
}

describe('Atlas card, Open site report', () => {
  it('V5 on: a link to #/site with the pin and the card settings, and the card keeps working', async () => {
    flag.v5 = true;
    await pinJack();
    const href = screen.getByTestId('site-report-link').getAttribute('href')!;
    expect(href).toMatch(/^#\/site\?/);
    const q = new URLSearchParams(href.split('?')[1]);
    // The card writes the pin into the address once its settings are known; the link must name the same place.
    await waitFor(() => expect(new URLSearchParams(window.location.hash.split('?')[1]).get('lat')).not.toBeNull());
    const here = new URLSearchParams(window.location.hash.split('?')[1]);
    expect(q.get('lat')).toBe(here.get('lat'));
    expect(q.get('lon')).toBe(here.get('lon'));
    expect(q.get('dur')).toBe('2');
    expect(q.get('year')).toBe('2025');
    expect(screen.getByTestId('site-dc')).toBeTruthy(); // the existing actions are still there
  });

  it('V5 off: no link, the card is as it was', async () => {
    flag.v5 = false;
    await pinJack();
    expect(screen.queryByTestId('site-report-link')).toBeNull();
  });
});
