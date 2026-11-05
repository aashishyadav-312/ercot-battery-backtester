// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { fixtureFile } from './fixture';
import { PRODUCTS, PRODUCT_LABEL, type StackMode } from './stack';
import type { ChartTheme } from '../components/Chart';

let location = 'HB_HOUSTON';
let duration = 2;
vi.mock('./flag', () => ({ V4: true }));
vi.mock('../state', () => ({ useApp: () => ({ sel: { location, duration, year: 2025, deg: 10 } }) }));
// Years and modes without a fixture file reject, like a 404.
vi.mock('../data/loader', async () => {
  const { fixtureFile: read } = await import('./fixture');
  return { loadStack: (y: number, d: number, m: StackMode) => { try { return Promise.resolve(read(y, d, m)); } catch { return Promise.reject(new Error('404')); } } };
});
// echarts is not drawn in jsdom: the stub hands the option to the DOM so the test can read what would be plotted.
const THEME = Object.fromEntries(['mode', 'surface', 'text', 'muted', 'grid', 'axis', 'tooltipBg', 'tooltipBorder', 'blue', 'green', 'cyan', 'violet', 'orange', 'rose'].map((k) => [k, k])) as unknown as ChartTheme;
vi.mock('../components/Chart', () => ({
  Chart: ({ build, label }: { build: (t: ChartTheme) => unknown; label: string }) => <div role="img" aria-label={label} data-testid="chart" data-option={JSON.stringify(build(THEME))} />,
  axisBase: () => ({}), legendBase: () => ({}), tooltipBase: () => ({}),
}));
vi.mock('../components/Info', () => ({ Info: () => null }));

import { StackByYear } from './StackByYear';
import { StackNote } from './StackNote';
import type { CustomForm } from '../custom/params';

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
afterEach(cleanup);
const wrap = (ui: React.ReactElement) => render(<MantineProvider>{ui}</MantineProvider>);

describe('Revenue stack by year', () => {
  it('plots the realistic rows as stacked bars and the foresight totals as the upper bound', async () => {
    location = 'HB_HOUSTON'; duration = 2;
    wrap(<StackByYear />);
    const chart = await screen.findByTestId('chart');
    const opt = JSON.parse(chart.dataset.option!);
    const bars = opt.series.filter((s: { type: string }) => s.type === 'bar');
    const years = [2025, 2026] as const;
    expect(bars.map((s: { name: string }) => s.name)).toEqual(PRODUCTS.map((p) => PRODUCT_LABEL[p]));
    PRODUCTS.forEach((p, i) => expect(bars[i].data).toEqual(years.map((y) => fixtureFile(y, 2, 'realistic').nodes.HB_HOUSTON[p])));
    const upper = opt.series.find((s: { type: string }) => s.type === 'scatter');
    expect(upper.data).toEqual(years.map((y) => fixtureFile(y, 2, 'foresight').nodes.HB_HOUSTON.total));
    // the stacked bars add up to the realistic total of each year
    years.forEach((y, j) => expect(bars.reduce((s: number, b: { data: number[] }) => s + b.data[j], 0)).toBeCloseTo(fixtureFile(y, 2, 'realistic').nodes.HB_HOUSTON.total, 1));
  });

  it('marks pre/post RTC+B in the axis labels and tints the post year', async () => {
    location = 'HB_WEST'; duration = 2;
    wrap(<StackByYear />);
    const opt = JSON.parse((await screen.findByTestId('chart')).dataset.option!);
    expect(opt.xAxis.data).toEqual(['2025\nSpans RTC+B go-live', '2026 YTD\nAfter RTC+B']);
    expect(opt.series[0].markArea.data).toEqual([[{ xAxis: '2026 YTD\nAfter RTC+B' }, { xAxis: '2026 YTD\nAfter RTC+B' }]]);
  });

  it('shows the range as one line, realistic to upper bound, and the fixture banner', async () => {
    location = 'HB_NORTH'; duration = 4;
    wrap(<StackByYear />);
    const range = await screen.findByTestId('stack-range');
    const lo = fixtureFile(2026, 4, 'realistic').nodes.HB_NORTH.total.toFixed(1);
    expect(range.textContent).toContain(`$${lo}`);
    expect(range.textContent).toContain('2026 YTD (10 months)');
    expect(screen.getByTestId('stack-fixture').textContent).toMatch(/FIXTURE/);
  });

  it('says so when a location has no stack, never zero', async () => {
    location = 'SOME_OTHER_RN'; duration = 2;
    wrap(<StackByYear />);
    expect((await screen.findByTestId('stack-empty')).textContent).toMatch(/Missing results are never shown as zero/);
    expect(screen.queryByTestId('chart')).toBeNull();
  });
});

describe('Studio note', () => {
  const form = (patch: Partial<CustomForm>): CustomForm => ({
    location: 'HB_HOUSTON', powerMw: 100, durationH: 2, rtePct: 85, degCost: 10, socPct: 0, startDate: '2025-01-01', endDate: '2025-12-31', strategy: 'da', ...patch,
  });
  it('shows the precomputed stack of the matching settings and says it is precomputed', async () => {
    wrap(<StackNote form={form({})} />);
    const f = fixtureFile(2025, 2, 'realistic').nodes.HB_HOUSTON;
    await waitFor(() => expect(screen.getByTestId('stack-note-total').textContent).toBe(`$${f.total.toFixed(1)}`));
    for (const p of PRODUCTS) expect(screen.getByTestId(`stack-note-${p}`).textContent).toBe(`$${f[p].toFixed(1)}`);
    expect(within(screen.getByTestId('stack-note')).getByText(/precomputed/i)).toBeTruthy();
  });
  it('perfect foresight uses the foresight file', async () => {
    wrap(<StackNote form={form({ strategy: 'pf' })} />);
    const f = fixtureFile(2025, 2, 'foresight').nodes.HB_HOUSTON;
    await waitFor(() => expect(screen.getByTestId('stack-note-total').textContent).toBe(`$${f.total.toFixed(1)}`));
  });
  it('a battery size with no file says so', async () => {
    wrap(<StackNote form={form({ durationH: 3 })} />);
    expect((await screen.findByTestId('stack-note-empty')).textContent).toMatch(/No precomputed full stack/);
  });
  it('dates over two years give no stack', async () => {
    wrap(<StackNote form={form({ startDate: '2025-06-01', endDate: '2026-05-31' })} />);
    expect(await screen.findByText(/one year at a time/)).toBeTruthy();
  });
});
