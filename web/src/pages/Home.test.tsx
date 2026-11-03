// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HomeView } from './Home';
import { num, pct, usd } from '../data/format';
import type { IndexRun, LocationsFile, NodesFile, TexasGeo } from '../data/types';
import type { LiveLoad, LiveState } from '../live/live';
import { retiredIn } from '../copy/retired';
import { locName } from '../data/site';

afterEach(cleanup);

// Real results files: every figure checked here is recomputed in the test from the same data the page loads.
// Tests run from web/, so results/ is one level up (a template URL here would be rewritten into an asset import by Vite).
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
const NODES = read<NodesFile>('nodes_2025_2h.json');
const LOCS = read<LocationsFile>('locations.json');
// The outline is not under test; a small square keeps the test independent of the generated texas.json.
const GEO: TexasGeo = {
  source: 'test',
  state: { type: 'Feature', properties: { name: 'Texas' }, geometry: { type: 'Polygon', coordinates: [[[-106, 36], [-94, 36], [-94, 26], [-106, 26], [-106, 36]]] } },
  counties: { type: 'FeatureCollection', features: [] },
};
const { year, duration_h: dur, deg_cost_per_mwh: deg } = NODES.meta;
const run = (loc: string, h = dur) => INDEX.find((r) => r.location === loc && r.year === year && r.duration_h === h && r.deg_cost_per_mwh === deg)!;
const NONE: LiveLoad = { source: 'none', reason: 'HTTP 502: upstream ERCOT API returned <html>Bad gateway</html>' };

const view = (live: LiveLoad | null = NONE, index = INDEX) =>
  render(<HomeView index={index} nodes={NODES} locs={LOCS} geo={GEO} live={{ load: live, now: Date.now() }} />);

describe('Home shows the loaded numbers', () => {
  it('hero subhead compares West with Houston and the best node with its hub, from the data', () => {
    view();
    const p = Math.round((run('HB_WEST').revenue_per_kw_year / run('HB_HOUSTON').revenue_per_kw_year - 1) * 100);
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    const ratio = (top.rev / NODES.hubs.find((h) => h.code === top.hub)!.rev).toFixed(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Where in Texas does a battery earn the most?');
    expect(screen.getByTestId('hero-sub').textContent).toBe(
      `Chargeline replays real ERCOT prices through a grid battery at every trading hub and ${NODES.nodes.length} nodes. `
      + `In ${year}, a battery at the ${locName('HB_WEST')} out-earned the ${locName('HB_HOUSTON')} by ${p}%, and the best node earned ${ratio}× its hub.`,
    );
  });

  it('eyebrow counts locations and spans the years in the results', () => {
    view();
    const ys = INDEX.map((r) => r.year);
    const hubs = new Set(INDEX.filter((r) => r.location.startsWith('HB_')).map((r) => r.location)).size;
    expect(screen.getByTestId('hero-eyebrow').textContent).toBe(`Live ERCOT prices · ${NODES.nodes.length + hubs} locations · ${Math.min(...ys)}–${Math.max(...ys)}`);
  });

  it('compares the top and bottom hubs when West no longer beats Houston', () => {
    const swapped = INDEX.map((r) => (r.location === 'HB_WEST' && r.year === year ? { ...r, revenue_per_kw_year: 1 } : r));
    view(NONE, swapped);
    const pf = (c: string) => swapped.find((r) => r.location === c && r.year === year && r.duration_h === dur && r.deg_cost_per_mwh === deg)!.revenue_per_kw_year;
    const ranked = ['HB_HOUSTON', 'HB_NORTH', 'HB_SOUTH', 'HB_WEST', 'HB_PAN'].sort((a, b) => pf(b) - pf(a));
    const [hi, lo] = [ranked[0], ranked.at(-1)!];
    expect(screen.getByTestId('hero-sub').textContent).toContain(
      `a battery at the ${locName(hi)} out-earned the ${locName(lo)} by ${Math.round((pf(hi) / pf(lo) - 1) * 100)}%`,
    );
  });

  it('three key numbers equal the data', () => {
    view();
    expect(screen.getByTestId('key-west').textContent).toBe(usd(run('HB_WEST').revenue_per_kw_year, 1));
    expect(screen.getByTestId('key-kept').textContent).toBe(pct(run('HB_HOUSTON').capture_rate));
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    const hub = NODES.hubs.find((h) => h.code === top.hub)!;
    expect(screen.getByTestId('key-ratio').textContent).toBe(`${(top.rev / hub.rev).toFixed(1)}x`);
  });

  it('the kept range and the gap equal the data', () => {
    view();
    const kept = ['HB_HOUSTON', 'HB_NORTH', 'HB_SOUTH', 'HB_WEST', 'HB_PAN'].map((h) => run(h).capture_rate!);
    expect(screen.getByTestId('keeps-title').textContent).toBe(`A real schedule keeps ${pct(Math.min(...kept))} to ${pct(Math.max(...kept))} of perfect foresight.`);
    const h = run('HB_HOUSTON');
    expect(screen.getByTestId('gap').textContent).toContain(num(h.value_of_perfect_foresight_per_kw_year, 1));
  });

  it('hub table rows equal the hub runs, ranked', () => {
    view();
    const rows = screen.getAllByTestId(/^hub-/);
    const order = rows.map((r) => r.getAttribute('data-testid')!.slice(4));
    const pfs = order.map((c) => run(c).revenue_per_kw_year);
    expect([...pfs].sort((a, b) => b - a)).toEqual(pfs);
    for (const r of rows) {
      const x = run(r.getAttribute('data-testid')!.slice(4));
      const cells = within(r).getAllByRole('cell').map((c) => c.textContent);
      expect(cells).toEqual([num(x.revenue_per_kw_year, 1), num(x.da_rt_revenue_per_kw_year, 1), pct(x.capture_rate)]);
    }
  });

  it('duration bars and story equal the Houston runs', () => {
    view();
    const story = screen.getByTestId('duration-story').textContent!;
    for (const h of [1, 2, 4]) expect(story).toContain(usd(run('HB_HOUSTON', h).revenue_per_kw_year / h, 1));
    expect(story).toContain(pct(run('HB_HOUSTON', 4).revenue_per_kw_year / run('HB_HOUSTON', 2).revenue_per_kw_year - 1));
  });

  it('metric tabs switch the chip values to the matching field', () => {
    view();
    const chip1 = screen.getByTestId('chip-1');
    expect(chip1.textContent).toContain(usd(run('HB_WEST').revenue_per_kw_year, 1));
    fireEvent.click(screen.getByRole('button', { name: 'Capture rate' }));
    expect(screen.getByRole('button', { name: 'Capture rate' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('chip-1').textContent).toContain(pct(run('HB_WEST').capture_rate));
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    expect(screen.getByTestId('chip-3').textContent).toContain(pct(top.capture));
    fireEvent.click(screen.getByRole('button', { name: 'Top-10-day share' }));
    expect(screen.getByTestId('chip-2').textContent).toContain(pct(run('HB_HOUSTON').top10_day_share));
  });

  it('labels the rank-1 node "location under review" when its geocode is manual_review', () => {
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    fireEvent.click(view().getByRole('button', { name: 'Capture rate' }));
    if (top.geo === 'manual_review') expect(screen.getByTestId('chip-3').textContent).toContain('location under review');
  });

  it('says how many nodes are not on the map', () => {
    view();
    const placed = NODES.nodes.filter((n) => n.lat != null).length;
    expect(document.body.textContent).toContain(`${placed} of ${NODES.nodes.length} nodes have coordinates`);
    expect(document.body.textContent).toContain(`the other ${NODES.nodes.length - placed} are counted`);
  });
});

const STATE: LiveState = {
  version: 1, checkedAt: '2026-11-03T18:05:00.000Z',
  errors: ['NP6-905-CD: HTTP 429 Too Many Requests {"statusCode":429,"message":"Rate limit is exceeded. Try again in 12 seconds."}'],
  hubs: ['HB_HOUSTON', 'HB_WEST'], nodes: [],
  today: { date: '2026-11-03', startUtc: '2026-11-03T06:00:00.000Z', hours: 24, rt: { HB_HOUSTON: [30.9, 31.4], HB_WEST: [25.1, 24.7] }, da: null },
  tomorrow: { date: '2026-11-04', startUtc: '2026-11-04T06:00:00.000Z', hours: 24, da: null, daFirstSeenAt: null },
};

describe('Home live section', () => {
  it('with no feed says "Live prices unavailable" and folds the raw reason under Details', () => {
    view(NONE);
    expect(document.body.textContent).toContain('Live prices unavailable');
    const details = screen.getByText('Details').closest('details')!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain(NONE.source === 'none' ? NONE.reason : '');
    // the raw text appears nowhere outside the closed Details
    const outside = document.body.textContent!.replace(details.textContent!, '');
    expect(outside).not.toContain('Bad gateway');
  });

  it('with partial ERCOT errors shows tiles, a plain sentence, and the raw errors only under Details', () => {
    view({ source: 'worker', state: STATE });
    expect(document.body.textContent).toContain('Some prices could not be updated. Showing the last good values from');
    const details = screen.getByText('Details').closest('details')!;
    expect(details.textContent).toContain('Rate limit is exceeded');
    expect(document.body.textContent!.replace(details.textContent!, '')).not.toContain('Rate limit');
  });

  it('live chip shows the latest Houston price and links to the hub prices', () => {
    const now = Date.parse('2026-11-03T06:35:00.000Z'); // 5 min after the second interval ends
    render(<HomeView index={INDEX} nodes={NODES} locs={LOCS} geo={GEO} live={{ load: { source: 'worker', state: STATE }, now }} />);
    const chip = screen.getByTestId('live-chip');
    expect(chip.getAttribute('data-state')).toBe('live');
    expect(chip.textContent).toMatch(/^Live · Houston \$31\.40\/MWh · 12:30 AM CT$/);
  });

  it('live chip says delayed with the age, and unavailable with no feed', () => {
    const now = Date.parse('2026-11-03T09:30:00.000Z');
    render(<HomeView index={INDEX} nodes={NODES} locs={LOCS} geo={GEO} live={{ load: { source: 'worker', state: STATE }, now }} />);
    expect(screen.getByTestId('live-chip').getAttribute('data-state')).toBe('delayed');
    expect(screen.getByTestId('live-chip').textContent).toBe('Delayed · 3 h old · Houston $31.40/MWh');
    cleanup();
    view(NONE);
    expect(screen.getByTestId('live-chip').textContent).toBe('Live prices unavailable');
    expect(screen.getByTestId('live-chip').getAttribute('data-state')).toBe('unavailable');
  });

  it('hub tiles colour moves by the same rule as the ticker: up for a rise, down for a fall', () => {
    view({ source: 'worker', state: STATE });
    const tiles = screen.getByRole('list', { name: 'Latest real-time price at each hub' });
    const dirs = [...tiles.querySelectorAll('[data-dir]')].map((e) => e.getAttribute('data-dir'));
    expect(dirs).toEqual(['up', 'down']); // Houston 30.90 -> 31.40, West 25.10 -> 24.70
  });
});

describe('Home uses the shared vocabulary', () => {
  it('shows none of the retired labels', async () => {
    view();
    await new Promise((r) => setTimeout(r, 50));
    expect(retiredIn(document.body.textContent ?? '')).toEqual([]);
  });
});
