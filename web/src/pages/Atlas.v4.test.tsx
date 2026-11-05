// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AtlasView } from './Atlas';
import { usd } from '../data/format';
import { fixtureFile } from '../v4/fixture';
import { mapDots } from '../data/atlas';
import type { NodesFile, Selection, TexasGeo } from '../data/types';

vi.mock('../config/features', () => ({ V4: true }));

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  Element.prototype.scrollIntoView ??= () => {};
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const NODES: NodesFile = JSON.parse(readFileSync(resolve(process.cwd(), '../results', 'nodes_2025_2h.json'), 'utf8'));
const GEO: TexasGeo = {
  source: 'test',
  state: { type: 'Feature', properties: { name: 'Texas' }, geometry: { type: 'Polygon', coordinates: [[[-106, 36], [-94, 36], [-94, 26], [-106, 26], [-106, 36]]] } },
  counties: { type: 'FeatureCollection', features: [] },
};
const SEL: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };
const real = fixtureFile(2025, 2, 'realistic');
const fore = fixtureFile(2025, 2, 'foresight');
const STACK = { realistic: new Map([[2025, real]]), foresight: new Map([[2025, fore]]) };
// RUSSEKST_RN has a row in both fixtures and is a placed node.
const CODE = 'RUSSEKST_RN';
const view = (stack: typeof STACK | null = STACK, sel = { ...SEL, location: CODE }) =>
  render(<MantineProvider><AtlasView nodes={NODES} geo={GEO} sel={sel} stack={stack} /></MantineProvider>);
const dotCount = (c: HTMLElement) => c.querySelectorAll('svg[role="img"] circle').length;

describe('Atlas: Energy | Full stack (flag on)', () => {
  it('starts on Energy and the existing figures are unchanged', () => {
    view();
    const rec = NODES.nodes.find((n) => n.code === CODE)!;
    expect(screen.getByTestId('basis-energy').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('node-value').textContent).toBe(usd(rec.rev, 1));
    expect(screen.queryByTestId('node-stack')).toBeNull();
  });

  it('Full stack shows the stack total, the range and the products of the selected node', () => {
    view();
    fireEvent.click(screen.getByTestId('basis-stack'));
    expect(screen.getByTestId('node-value').textContent).toBe(usd(real.nodes[CODE].total, 1));
    const t = screen.getByTestId('node-stack').textContent!;
    expect(t).toContain(`Energy ${usd(real.nodes[CODE].energy, 1)} + ancillary ${usd(real.nodes[CODE].total - real.nodes[CODE].energy, 1)}`);
    expect(t).toContain(`${usd(real.nodes[CODE].total, 1)} realistic to ${usd(fore.nodes[CODE].total, 1)} perfect-foresight upper bound`);
    expect(screen.getByTestId('atlas-metric-long').textContent).toMatch(/Full stack revenue, realistic/);
    expect(screen.getByTestId('stack-fixture')).toBeTruthy();
  });

  it('the map is rebuilt from the stack: only nodes with a stack row are drawn, and the scale comes from those values', () => {
    const { container } = view();
    const before = dotCount(container);
    fireEvent.click(screen.getByTestId('basis-stack'));
    const has = NODES.nodes.filter((n) => n.lat != null && real.nodes[n.code]);
    expect(has.length).toBeGreaterThan(0);
    const missing = NODES.nodes.length - NODES.nodes.filter((n) => real.nodes[n.code]).length;
    expect(screen.getByTestId('atlas-stack-note').textContent).toContain(`${missing.toLocaleString('en-US')} nodes have no stack result yet`);
    expect(dotCount(container)).toBeLessThan(before);
    // The colour and size scale is the existing one, fed the stack totals: the largest value has norm 1.
    const dots = mapDots(NODES.nodes.map((n) => ({ ...n, rev: real.nodes[n.code]?.total ?? (null as unknown as number) })), 'rev');
    expect(dots).toHaveLength(has.length);
    expect(Math.max(...dots.map((d) => d.norm))).toBe(1);
  });

  it('the ranked list uses stack values', () => {
    view();
    fireEvent.click(screen.getByTestId('basis-stack'));
    const list = screen.getByTestId('top-list');
    const best = Object.entries(real.nodes).filter(([c]) => NODES.nodes.some((n) => n.code === c)).sort((a, b) => b[1].total - a[1].total)[0];
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain(usd(best[1].total, 1));
  });

  it('Full stack moves the card to a node that has a stack result when the selected one has none', () => {
    view(STACK, { ...SEL, location: 'RHESS2_ESS1' });
    expect(screen.getByRole('heading', { level: 2, name: 'RHESS2_ESS1' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('basis-stack'));
    const code = within(screen.getByTestId('node-card')).getByRole('heading', { level: 2 }).textContent!;
    expect(real.nodes[code]).toBeDefined();
    expect(screen.getByTestId('node-value').textContent).toBe(usd(real.nodes[code].total, 1));
  });

  it('another metric returns to Energy and hides the switch', () => {
    view();
    fireEvent.click(screen.getByTestId('basis-stack'));
    const metrics = within(screen.getByRole('group', { name: 'Map metric' }));
    fireEvent.click(metrics.getByRole('button', { name: /capture rate/i }));
    expect(screen.queryByTestId('basis-stack')).toBeNull();
    fireEvent.click(metrics.getByRole('button', { name: 'Revenue' }));
    expect(screen.getByTestId('basis-energy').getAttribute('aria-pressed')).toBe('true');
  });

  it('with no stack files there is no switch', () => {
    view(null);
    expect(screen.queryByTestId('basis-stack')).toBeNull();
  });

  it('a node with no upper bound says so', () => {
    const noUpper = { realistic: STACK.realistic, foresight: new Map([[2025, { ...fore, nodes: {} }]]) };
    view(noUpper as never);
    fireEvent.click(screen.getByTestId('basis-stack'));
    expect(screen.getByTestId('node-stack').textContent).toContain('No upper bound computed for this node yet.');
  });
});
