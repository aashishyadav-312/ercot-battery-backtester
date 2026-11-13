// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AtlasView } from './Atlas';
import type { NodesFile, Selection, TexasGeo } from '../data/types';

vi.mock('../config/features', async (orig) => ({ ...(await orig<typeof import('../config/features')>()), V5: true }));
const csv = vi.hoisted(() => vi.fn());
vi.mock('../data/format', async (orig) => ({ ...(await orig<typeof import('../data/format')>()), downloadCsv: csv }));

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  Element.prototype.scrollIntoView ??= () => {};
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
beforeEach(() => { window.location.hash = '#/atlas'; csv.mockClear(); });

const NODES = JSON.parse(readFileSync(resolve(process.cwd(), '../results', 'nodes_2025_2h.json'), 'utf8')) as NodesFile;
const GEO: TexasGeo = {
  source: 'test',
  state: { type: 'Feature', properties: { name: 'Texas' }, geometry: { type: 'Polygon', coordinates: [[[-106, 36], [-94, 36], [-94, 26], [-106, 26], [-106, 36]]] } },
  counties: { type: 'FeatureCollection', features: [] },
};
const SEL: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };
const view = () => render(<MantineProvider><AtlasView nodes={NODES} geo={GEO} sel={SEL} /></MantineProvider>);
const headers = () => within(screen.getByTestId('node-table')).getAllByRole('columnheader').map((h) => h.textContent!.replace(/[ ↓↑]+$/, ''));
const pills = () => within(screen.getByRole('group', { name: 'Map metric' })).getAllByRole('button').map((b) => b.textContent);

describe('Atlas Advanced switch (V5)', () => {
  it('starts simple: Revenue only, and no Spread, Corr. hub or Cycles columns', () => {
    view();
    expect(pills()).toEqual(['Revenue']);
    const h = headers();
    expect(h).not.toContain('Spread');
    expect(h).not.toContain('Corr. hub');
    expect(h).not.toContain('Cycles');
    expect(h).toContain('Node');
    expect(screen.getByTestId('advanced-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  it('Advanced adds the other measures and the three columns, and writes adv=1 to the address', () => {
    view();
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    expect(pills()).toEqual(['Revenue', 'Capture rate', 'Top-10-day share']);
    expect(headers()).toEqual(expect.arrayContaining(['Spread', 'Corr. hub', 'Cycles']));
    expect(window.location.hash).toBe('#/atlas?adv=1');
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    expect(pills()).toEqual(['Revenue']);
    expect(window.location.hash).toBe('#/atlas');
  });

  it('opens in Advanced from a link with adv=1', () => {
    window.location.hash = '#/atlas?adv=1';
    view();
    expect(pills()).toHaveLength(3);
    expect(screen.getByTestId('advanced-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('turning Advanced off returns the map to Revenue', () => {
    view();
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    const group = () => within(screen.getByRole('group', { name: 'Map metric' }));
    fireEvent.click(group().getByRole('button', { name: 'Capture rate' }));
    expect(group().getByRole('button', { name: 'Capture rate' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    expect(group().getByRole('button', { name: 'Revenue' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('the CSV has every column whichever way the switch is set', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const simple = csv.mock.calls[0];
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const adv = csv.mock.calls[1];
    expect(simple[1]).toEqual(adv[1]);
    expect(simple[1]).toEqual(expect.arrayContaining(['cycles', 'spread_usd_mwh', 'corr_hub', 'capture_rate', 'top10_share']));
    expect(simple[2][0]).toHaveLength(simple[1].length);
  });
});
