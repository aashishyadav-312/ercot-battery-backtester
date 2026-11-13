// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeView } from './Home';
import { HomeSearch } from './HomeV5';
import { buildSearchIndex } from '../v4/geo/search';
import { siteHash } from '../v5/siteTarget';
import type { IndexRun, LocationsFile, NodesFile, TexasGeo } from '../data/types';
import type { LiveLoad } from '../live/live';

vi.mock('../config/features', async (orig) => ({ ...(await orig<typeof import('../config/features')>()), V5: true }));

afterEach(cleanup);
beforeEach(() => { window.scrollTo = (() => {}) as never; window.location.hash = '#/home'; });

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
const NONE: LiveLoad = { source: 'none', reason: 'offline' };
const PLACES = buildSearchIndex(
  [{ name: 'McLennan', lat: 31.55, lon: -97.2 }],
  [{ name: 'Waco', kind: 'city', county: 'McLennan', pop: 140000, lat: 31.5493, lon: -97.1467 }],
);

const view = () => render(
  <HomeView index={INDEX} nodes={NODES} locs={LOCS} geo={GEO} live={{ load: NONE, now: Date.now() }} search={<HomeSearch places={PLACES} />} />,
);

describe('Home with V5 on', () => {
  it('keeps the original Home: the node map, the schedule and duration charts, and four ways in with Research', () => {
    view();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Where in Texas does a battery earn the most?');
    expect(screen.getByTestId('keeps-title')).toBeTruthy();
    expect(screen.getByTestId('chip-3')).toBeTruthy();
    const ways = screen.getByRole('heading', { name: 'Four ways in' }).closest('section')!;
    expect(ways.textContent).toContain('Research');
  });

  it('adds one search box labelled Screen a site to the hero', () => {
    view();
    const hero = screen.getByTestId('hero-search');
    expect(hero.closest('[data-tour="hero"]')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Screen a site' })).toBeTruthy();
  });

  it('sends the visitor to the site report when a place is chosen', () => {
    view();
    const box = screen.getByRole('combobox', { name: 'Screen a site' });
    fireEvent.change(box, { target: { value: 'Waco' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(window.location.hash).toBe(siteHash(31.5493, -97.1467));
  });

  it('takes a lat, lon point too', () => {
    view();
    const box = screen.getByRole('combobox', { name: 'Screen a site' });
    fireEvent.change(box, { target: { value: '33.2, -98.2' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(window.location.hash).toBe(siteHash(33.2, -98.2));
  });
});

describe('Home with V5 off', () => {
  it('has no search box', () => {
    render(<HomeView index={INDEX} nodes={NODES} locs={LOCS} geo={GEO} live={{ load: NONE, now: Date.now() }} />);
    expect(screen.queryByTestId('hero-search')).toBeNull();
  });
});
