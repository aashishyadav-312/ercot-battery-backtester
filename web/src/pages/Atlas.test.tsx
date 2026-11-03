// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AtlasView } from './Atlas';
import { num, pct, usd } from '../data/format';
import type { NodeRec, NodesFile, Selection, TexasGeo } from '../data/types';
import { retiredIn } from '../copy/retired';

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no matchMedia; Mantine and the scroll-into-view call ask for it.
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  Element.prototype.scrollIntoView ??= () => {};
  // nor ResizeObserver, which Mantine's Select uses.
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

// Real results file: every figure checked here is recomputed in the test from the data the page loads.
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const NODES = read<NodesFile>('nodes_2025_2h.json');
const GEO: TexasGeo = {
  source: 'test',
  state: { type: 'Feature', properties: { name: 'Texas' }, geometry: { type: 'Polygon', coordinates: [[[-106, 36], [-94, 36], [-94, 26], [-106, 26], [-106, 36]]] } },
  counties: { type: 'FeatureCollection', features: [] },
};
const SEL: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };
const hubRev = (n: NodeRec) => NODES.hubs.find((h) => h.code === n.hub)!.rev;
const ratio = (n: NodeRec) => n.rev / hubRev(n);
const rank1 = NODES.nodes.find((n) => n.rank === 1)!;
const isPlaced = (n: NodeRec) => n.lat != null && n.lon != null;

const view = (sel = SEL) => render(<MantineProvider><AtlasView nodes={NODES} geo={GEO} sel={sel} /></MantineProvider>);

describe('Atlas shows the loaded numbers', () => {
  it('lede counts every node, the placed ones and the rest', () => {
    view();
    const placed = NODES.nodes.filter(isPlaced).length;
    const t = screen.getByTestId('atlas-lede').textContent!;
    expect(t).toContain(`${num(NODES.nodes.length)} ERCOT resource nodes have complete ${NODES.meta.year} prices`);
    expect(t).toContain(`${num(placed)} of them are placed`);
    expect(t).toContain(`The other ${num(NODES.nodes.length - placed)} are listed`);
  });

  it('opens on the rank-1 node, with its figures and a bulk-hub ratio', () => {
    view();
    const card = screen.getByTestId('node-card');
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe(rank1.code);
    expect(screen.getByTestId('node-value').textContent).toBe(usd(rank1.rev, 1));
    expect(screen.getByTestId('stat-ratio').textContent).toBe(`${ratio(rank1).toFixed(2)}x`);
    expect(screen.getByTestId('stat-da').textContent).toBe(usd(rank1.da_rev, 1));
    expect(screen.getByTestId('stat-capture').textContent).toBe(pct(rank1.capture));
    expect(screen.getByTestId('stat-top10').textContent).toBe(pct(rank1.top10));
    expect(screen.getByTestId('stat-cycles').textContent).toBe(num(rank1.cycles));
    expect(screen.getByTestId('geo-note').textContent).toMatch(/under review/);
    // twelve monthly bars, each with its value as text
    const months = within(card).getByRole('list', { name: /by month/ });
    expect(within(months).getAllByRole('listitem')).toHaveLength(12);
    expect(months.textContent).toContain(usd(rank1.monthly[1], 2));
  });

  it('opens on the node an old #/map?loc= link named', () => {
    const n = NODES.nodes.find((x) => x.code === 'RUSSEKST_RN')!;
    view({ ...SEL, location: n.code });
    expect(within(screen.getByTestId('node-card')).getByRole('heading', { level: 2 }).textContent).toBe(n.code);
  });

  it('the top-12 list is the keyboard path: it follows the metric and zone, and selects a node', () => {
    view();
    const list = () => within(screen.getByTestId('top-list')).getAllByRole('button');
    const byRev = [...NODES.nodes].sort((a, b) => b.rev - a.rev).slice(0, 12);
    expect(list().map((b) => b.textContent)).toEqual(byRev.map((n, i) => expect.stringContaining(`${i + 1}${n.code}`)));
    expect(list()[0].textContent).toContain(usd(byRev[0].rev, 1));

    fireEvent.click(within(screen.getByRole('group', { name: 'Map metric' })).getByRole('button', { name: 'Capture rate' }));
    const byCap = [...NODES.nodes].sort((a, b) => b.capture! - a.capture! || a.rank - b.rank).slice(0, 12);
    expect(list()[0].textContent).toContain(byCap[0].code);
    expect(list()[0].textContent).toContain(pct(byCap[0].capture));
    expect(screen.getByTestId('node-value').textContent).toBe(pct(rank1.capture));

    fireEvent.click(within(screen.getByRole('group', { name: 'Load zone' })).getByRole('button', { name: 'West' }));
    const west = NODES.nodes.filter((n) => n.lz === 'LZ_WEST').sort((a, b) => b.capture! - a.capture! || a.rank - b.rank)[0];
    expect(list()[0].textContent).toContain(west.code);

    fireEvent.click(list()[0]);
    expect(within(screen.getByTestId('node-card')).getByRole('heading', { level: 2 }).textContent).toBe(west.code);
    expect(list()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('distribution headline, classes and percentiles equal the data', () => {
    view();
    const r = NODES.nodes.filter((n) => n.hub).map(ratio);
    const within10 = r.filter((x) => x >= 0.9 && x < 1.1).length / r.length;
    const tail = r.filter((x) => x >= 2).length;
    expect(screen.getByTestId('stray-title').textContent).toBe(
      `${pct(within10)} of nodes earn within 10% of their hub. ${tail} earn 2 to ${Math.max(...r).toFixed(1)} times as much.`,
    );
    const items = within(screen.getByTestId('buckets')).getAllByRole('listitem');
    const edges = [[0, 0.9], [0.9, 1.1], [1.1, 1.5], [1.5, 2], [2, 3], [3, Infinity]];
    edges.forEach(([lo, hi], i) => {
      const n = r.filter((x) => x >= lo && x < hi).length;
      expect(items[i].textContent).toContain(`${n} · ${pct(n / r.length)}`);
    });
    const rows = within(screen.getByTestId('percentiles')).getAllByRole('row').slice(1);
    const sorted = NODES.nodes.map((n) => n.rev).sort((a, b) => a - b);
    expect(rows.at(-1)!.textContent).toBe(`Max${usd(sorted.at(-1), 1)}${Math.max(...r).toFixed(2)}x`);
    expect(rows[0].textContent).toContain(usd(NODES.meta.quantiles_rev.p10, 1));
    expect(rows[2].textContent).toContain(usd(NODES.meta.quantiles_rev.p50, 1));
  });

  it('counts the nodes waiting for a location, and lists them in the table', () => {
    view();
    const unplaced = NODES.nodes.filter((n) => !isPlaced(n));
    expect(screen.getByTestId('unplaced-title').textContent).toBe(`${num(unplaced.length)} nodes are waiting for a location`);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only nodes not on the map' }));
    const body = within(screen.getByTestId('node-table')).getAllByRole('rowgroup')[1];
    const rows = within(body).getAllByRole('row');
    expect(rows.length).toBe(Math.min(25, unplaced.length));
    for (const row of rows) expect(row.textContent).toContain('not on map');
    expect(screen.getByText(new RegExp(`Showing ${Math.min(25, unplaced.length)} of ${unplaced.length}\\.`))).toBeTruthy();
  });

  it('sorts the table by a column', () => {
    view();
    fireEvent.click(within(screen.getByTestId('node-table')).getByRole('button', { name: /^Capture/ }));
    const body = within(screen.getByTestId('node-table')).getAllByRole('rowgroup')[1];
    const first = within(body).getAllByRole('row')[0];
    const best = [...NODES.nodes].sort((a, b) => b.capture! - a.capture!)[0];
    expect(first.textContent).toContain(pct(best.capture));
  });

  it('labels the map with the placed and total counts', () => {
    view();
    const placed = NODES.nodes.filter(isPlaced).length;
    expect(screen.getByRole('img', { name: new RegExp(`${placed} of ${NODES.nodes.length} resource nodes placed`) })).toBeTruthy();
  });
});

describe('Atlas uses the shared vocabulary', () => {
  it('shows none of the retired labels', async () => {
    view();
    await new Promise((r) => setTimeout(r, 50));
    expect(retiredIn(document.body.textContent ?? '')).toEqual([]);
  });
});
