// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import highsLoader, { type Highs } from 'highs';
import { StudioView, type Solve } from './Studio';
import { money } from '../data/studio';
import { MONTHS, num, pct, usd } from '../data/format';
import { parsePriceFile } from '../custom/prices';
import { runCustom } from '../custom/runner';
import { toParams, type Coverage } from '../custom/params';
import type { IndexRun, NodeSelection, Run } from '../data/types';
import { retiredIn } from '../copy/retired';

// The chart cards (echarts) and the node-vs-hub card load their own files; they are the existing cards, unchanged.
vi.mock('../components/cards', () => ({
  CumulativeCard: () => <div data-testid="cumulative" />,
  HeatmapCard: () => <div data-testid="heatmap" />,
  TopDaysCard: () => <div data-testid="topdays" />,
  NodeHubCard: ({ sel }: { sel: { location: string } }) => <div data-testid="nodehub">{sel.location}</div>,
}));

afterEach(cleanup);
let highs: Highs;
beforeAll(async () => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
  highs = await highsLoader();
}, 60_000);
beforeEach(() => history.replaceState(null, '', '#/studio'));

// Real results files: every figure checked here is recomputed in the test from the data the page loads.
const RESULTS = resolve(process.cwd(), '../results');
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(RESULTS, f), 'utf8'));
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
const NODES = read<NodeSelection>('node_selection.json');
const COVERAGE: Coverage[] = read<{ files: { location: string; year: number; rt_first_day: string; rt_last_day: string }[] }>('prices/index.json')
  .files.map((f) => ({ location: f.location, year: f.year, first: f.rt_first_day, last: f.rt_last_day }));
const row = (loc: string, year: number, h: number, deg: number) =>
  INDEX.find((r) => r.location === loc && r.year === year && r.duration_h === h && r.deg_cost_per_mwh === deg)!;

/** The real solver, run in the test instead of a Web Worker, with the same progress messages. */
const realSolve: Solve = async (form, onProgress) => {
  const p = toParams(form);
  const raw = readFileSync(resolve(RESULTS, 'prices', `${p.location}_${p.startDate.slice(0, 4)}.ebp`));
  // jsdom's Blob has no stream(), which the browser's gunzip uses; unzip with Node instead.
  const file = await parsePriceFile(new Uint8Array(raw[0] === 0x1f ? gunzipSync(raw) : raw));
  const result = runCustom(highs, [file], p, (x) => onProgress({ id: 0, type: 'progress', stage: 'solving', ...x }));
  return { result, ms: 1234 };
};

function view(hash = '#/studio', solve: Solve = realSolve) {
  history.replaceState(null, '', hash);
  const loadRun = vi.fn(async (f: string) => read<Run>(f));
  const solveSpy = vi.fn(solve);
  render(<MantineProvider><StudioView index={INDEX} nodes={NODES} coverage={COVERAGE} loadRun={loadRun} solve={solveSpy} /></MantineProvider>);
  return { loadRun, solve: solveSpy };
}
const text = (id: string) => screen.getByTestId(id).textContent;
const input = (id: string) => screen.getByTestId(id) as HTMLInputElement;

describe('presets show at once', () => {
  it('opens the default battery from its precomputed file, with every figure from that file', async () => {
    const { solve } = view();
    const r = row('HB_HOUSTON', 2025, 2, 10);
    const run = read<Run>(r.file);
    await waitFor(() => expect(text('summary-source')).toBe(`Precomputed · ${num(run.meta.days_solved)} days · results/${r.file}`));
    expect(solve).not.toHaveBeenCalled();
    expect(text('summary-inputs')).toBe('100 MW / 200 MWh · Houston Hub (HB_HOUSTON) · Jan 1, 2025 to Dec 31, 2025 · 85% round trip · $10/MWh degradation · starts 0% charged');
    expect(text('total-pf')).toBe(money(run.metrics.revenue_per_kw_period * 100_000));
    expect(text('total-da')).toBe(money(run.metrics.da_rt_revenue_per_kw_period! * 100_000));
    expect(text('kept')).toBe(pct(run.metrics.capture_rate));
    expect(text('op-cycles')).toBe(num(run.metrics.cycles_per_year, 0));
    expect(text('op-spread')).toBe(usd(run.metrics.avg_spread_captured, 0));
    expect(text('op-top10')).toBe(pct(run.metrics.top10_day_share));
    const bars = within(screen.getByTestId('monthly')).getAllByRole('listitem').map((li) => li.textContent);
    expect(bars).toEqual(MONTHS.map((m, i) => {
      const v = run.metrics.monthly_revenue_per_kw[String(i + 1)];
      return `${num(v, 1)}${m.slice(0, 1)}${m}: ${usd(v, 1)} per kW`;
    }));
    expect(screen.getByTestId('preset-note').textContent).toContain('match a precomputed run');
  });

  it('power scales the dollar totals and leaves the per-kW figures alone, without a new run', async () => {
    const { solve, loadRun } = view();
    const run = read<Run>(row('HB_HOUSTON', 2025, 2, 10).file);
    await waitFor(() => screen.getByTestId('total-pf'));
    fireEvent.change(input('power'), { target: { value: '250' } });
    await waitFor(() => expect(text('total-pf')).toBe(money(run.metrics.revenue_per_kw_period * 250_000)));
    expect(text('total-da')).toBe(money(run.metrics.da_rt_revenue_per_kw_period! * 250_000));
    expect(text('summary-inputs')).toMatch(/^250 MW \/ 500 MWh/);
    expect(text('kept')).toBe(pct(run.metrics.capture_rate));
    expect(solve).not.toHaveBeenCalled();
    expect(loadRun).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toContain('mw=250');
  });

  it('a duration button loads that precomputed run', async () => {
    const { solve, loadRun } = view();
    await waitFor(() => screen.getByTestId('total-pf'));
    fireEvent.click(screen.getByTestId('dur-4'));
    const r = row('HB_HOUSTON', 2025, 4, 10);
    await waitFor(() => expect(text('summary-source')).toContain(r.file));
    expect(loadRun).toHaveBeenLastCalledWith(r.file);
    expect(solve).not.toHaveBeenCalled();
  });

  it('an old Compare link with only a year opens that preset', async () => {
    const { solve } = view('#/studio?loc=RUSSEKST_RN&dur=4&year=2024&deg=0');
    const r = row('RUSSEKST_RN', 2024, 4, 0);
    await waitFor(() => expect(text('summary-source')).toContain(r.file));
    expect(input('from').value).toBe(r.first_day);
    expect(solve).not.toHaveBeenCalled();
  });

  it('says when the price files run past the precomputed 2026 run', async () => {
    view('#/studio?loc=HB_HOUSTON&year=2026');
    const r = row('HB_HOUSTON', 2026, 2, 10);
    await waitFor(() => expect(text('summary-source')).toContain(r.file));
    expect(screen.getByText(/the precomputed run ends/).textContent).toContain('Oct 24, 2026');
  });
});

describe('other inputs are solved in the browser', () => {
  it('lists what is not precomputed, and solves on Run with progress by month', async () => {
    let finish!: () => void;
    const pending: Solve = (_f, onProgress) => {
      onProgress({ id: 0, type: 'progress', stage: 'solving', month: '2025-03', daysDone: 59, daysTotal: 365 });
      return new Promise((res) => { finish = () => res({ result: null as never, ms: 0 }); });
    };
    const { solve } = view('#/studio', pending);
    await waitFor(() => screen.getByTestId('total-pf'));
    fireEvent.change(input('rte'), { target: { value: '90' } });
    await waitFor(() => expect(screen.getByTestId('preset-note').textContent).toContain('Round trip 90% (precomputed: 85%)'));
    expect(screen.getByTestId('stale').textContent).toContain('Press Run');
    fireEvent.click(screen.getByTestId('run'));
    expect(solve).toHaveBeenCalledTimes(1);
    expect(solve.mock.calls[0][0]).toMatchObject({ rtePct: 90, location: 'HB_HOUSTON' });
    const progress = await screen.findByTestId('progress');
    expect(progress.textContent).toContain('Solving Mar 2025');
    expect(progress.textContent).toContain('59 of 365 days');
    expect(within(progress).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(String(Math.round((59 / 365) * 100)));
    void finish;
  });

  it('a shared link with off-preset inputs solves on arrival, across the DST day, and shows the exact inputs', async () => {
    const { solve } = view('#/studio?loc=HB_HOUSTON&mw=50&dur=1.5&rte=90&deg=5&soc=20&from=2025-03-08&to=2025-03-10&strat=pf');
    expect(solve).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(text('summary-source')).toBe('Solved in your browser · 3 days in 1.2 s'), { timeout: 20_000 });
    expect(text('summary-inputs')).toBe('50 MW / 75 MWh · Houston Hub (HB_HOUSTON) · Mar 8, 2025 to Mar 10, 2025 · 90% round trip · $5/MWh degradation · starts 20% charged');
    const r = await realSolve(solve.mock.calls[0][0], () => {});
    expect(text('total-pf')).toBe(money(r.result.run.metrics.revenue_per_kw_period * 50_000));
    expect(r.result.run.meta.soc_start_end_frac).toBe(0.2);
  }, 30_000);

  it('a preset can be checked in the browser, and says how close the browser came to Python', async () => {
    const r = row('HB_HOUSTON', 2025, 2, 10);
    const run = read<Run>(r.file);
    const echo: Solve = async () => ({ result: { params: null as never, days: [], skippedDays: [], daSkippedDays: [], run }, ms: 900 });
    view('#/studio', echo);
    await waitFor(() => screen.getByTestId('check'));
    await act(async () => { fireEvent.click(screen.getByTestId('check')); });
    await waitFor(() => expect(text('summary-source')).toContain('Solved in your browser'));
    expect(text('check-result')).toBe(
      `Precomputed in Python: ${usd(r.revenue_per_kw_year, 2)}/kW-yr perfect foresight and ${usd(r.da_rt_revenue_per_kw_year, 2)} day-ahead plan. `
      + `Your browser: ${usd(run.metrics.revenue_per_kw_year, 2)} and ${usd(run.metrics.da_rt_revenue_per_kw_year, 2)}.`,
    );
  });
});

describe('labelled controls', () => {
  it('every input has a visible label, including efficiency, dates and start charge', async () => {
    view();
    for (const name of ['Location', 'From', 'To', 'Power (MW)', 'Hours of storage', 'Cost per MWh discharged', 'Round-trip efficiency (%)', 'Start charge (% of energy)']) {
      expect(screen.getByLabelText(name), name).toBeTruthy();
    }
    expect(screen.getByRole('group', { name: 'Year' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Power (MW), slider' })).toBeTruthy();
  });
});

describe('compare presets', () => {
  it('ranks every location for the same battery and loads one on click', async () => {
    const { loadRun } = view();
    await waitFor(() => screen.getByTestId('total-pf'));
    const want = INDEX.filter((r) => r.year === 2025 && r.duration_h === 2 && r.deg_cost_per_mwh === 10).sort((a, b) => b.revenue_per_kw_year - a.revenue_per_kw_year);
    const rows = within(screen.getByTestId('compare-table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(want.length);
    rows.forEach((tr, i) => {
      expect(tr.getAttribute('data-testid')).toBe(`cmp-${want[i].location}`);
      expect(tr.textContent).toContain(usd(want[i].revenue_per_kw_year, 1));
    });
    fireEvent.click(within(screen.getByTestId('cmp-HB_WEST')).getByRole('button'));
    await waitFor(() => expect(loadRun).toHaveBeenLastCalledWith(row('HB_WEST', 2025, 2, 10).file));
    expect(screen.getByTestId('nodehub').textContent).toBe('HB_WEST');
  });
});

describe('Studio uses the shared vocabulary', () => {
  it('shows none of the retired labels', async () => {
    view();
    await new Promise((r) => setTimeout(r, 50));
    expect(retiredIn(document.body.textContent ?? '')).toEqual([]);
  });
});
