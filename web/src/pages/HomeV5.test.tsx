// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HomeV5View } from './HomeV5';
import { buildSearchIndex } from '../v4/geo/search';
import { siteHash } from '../v5/siteTarget';
import { pct, usd } from '../data/format';
import type { IndexRun, NodesFile, Selection } from '../data/types';
import type { LiveLoad } from '../live/live';

vi.mock('../config/features', async (orig) => ({ ...(await orig<typeof import('../config/features')>()), V5: true }));

afterEach(cleanup);
beforeEach(() => { window.scrollTo = (() => {}) as never; window.location.hash = '#/home'; });

const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
const NODES = read<NodesFile>('nodes_2025_2h.json');
const SEL: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };
const NONE: LiveLoad = { source: 'none', reason: 'offline' };
const PLACES = buildSearchIndex(
  [{ name: 'McLennan', lat: 31.55, lon: -97.2 }],
  [{ name: 'Waco', kind: 'city', county: 'McLennan', pop: 140000, lat: 31.5493, lon: -97.1467 }],
);
const { year, duration_h: dur, deg_cost_per_mwh: deg } = NODES.meta;
const run = (loc: string) => INDEX.find((r) => r.location === loc && r.year === year && r.duration_h === dur && r.deg_cost_per_mwh === deg)!;

const view = (places = PLACES) => render(<HomeV5View index={INDEX} nodes={NODES} places={places} live={{ load: NONE, now: Date.now() }} sel={SEL} />);

describe('Home with V5 on', () => {
  it('opens with one search box labelled Screen a site, and the backtest caveat beside it', () => {
    view();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Where should a battery go in Texas?');
    expect(screen.getByRole('combobox', { name: 'Screen a site' })).toBeTruthy();
    expect(screen.getByTestId('hero-sub').textContent).toContain('backtest of past prices, not a forecast');
  });

  it('sends the visitor to the site address when a place is chosen', () => {
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

  it('shows the three headline figures, equal to the data', () => {
    view();
    expect(screen.getByTestId('key-west').textContent).toBe(usd(run('HB_WEST').revenue_per_kw_year, 1));
    expect(screen.getByTestId('key-kept').textContent).toBe(pct(run('HB_HOUSTON').capture_rate));
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    const hub = NODES.hubs.find((h) => h.code === top.hub)!;
    expect(screen.getByTestId('key-ratio').textContent).toBe(`${(top.rev / hub.rev).toFixed(1)}x`);
  });

  it('keeps the hub table and live prices, and drops the schedule and duration sections', () => {
    view();
    expect(screen.getAllByTestId(/^hub-/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Hub prices right now' })).toBeTruthy();
    expect(screen.queryByTestId('keeps-title')).toBeNull();
    expect(screen.queryByTestId('duration-story')).toBeNull();
    expect(screen.queryByText('The gap that matters')).toBeNull();
    const links = within(screen.getByTestId('hub-links')).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual([expect.stringMatching(/^#\/learn\/reality\?/), '#/learn/research?f=3']);
  });

  it('ends with three entry cards: Atlas, Studio, Learn', () => {
    view();
    const ways = within(screen.getByRole('heading', { name: 'Three ways in' }).closest('section')!);
    expect(ways.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Atlas', 'Studio', 'Learn']);
    expect(ways.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#/atlas', '#/studio', '#/learn']);
  });

  it('keeps the tour anchor on the hero', () => {
    const { container } = view();
    expect(container.querySelector('[data-tour="hero"]')).toBeTruthy();
  });
});
