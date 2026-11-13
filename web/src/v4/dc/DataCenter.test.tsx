// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import highsLoader, { type Highs } from 'highs';
import type { ChartTheme } from '../../components/Chart';
import rules from '../../custom/config/datacenter_rules.json';
import { parsePriceFile, type PriceFile } from '../../custom/prices';
import { runDataCenterCase, type DataCenterResult, type FourCpYear } from '../../custom/datacenter';
import { usd } from '../../data/format';
import { money } from '../../data/studio';
import { parseStackIndex } from '../site/stackIndex';
import type { StackFile } from '../stack';
import type { DcEngineInputs, DcCoverage } from './dcForm';

// echarts is not drawn in jsdom: the stub hands the option to the DOM so the test can read what would be plotted.
const THEME = Object.fromEntries(['mode', 'surface', 'text', 'muted', 'grid', 'axis', 'tooltipBg', 'tooltipBorder', 'blue', 'green', 'cyan', 'violet', 'orange', 'rose', 'discharge', 'charge'].map((k) => [k, k])) as unknown as ChartTheme;
(THEME as unknown as { grey: string[] }).grey = ['grey0', 'grey1', 'grey2'];
vi.mock('../../components/Chart', () => ({
  Chart: ({ build, label }: { build: (t: ChartTheme) => unknown; label: string }) => <div role="img" aria-label={label} data-testid="chart" data-option={JSON.stringify(build(THEME))} />,
  axisBase: () => ({}), legendBase: () => ({}), tooltipBase: () => ({}),
}));

// This file tests today's behaviour, so V5 is forced off even in the CI job that builds with it on (DataCenter.v5.test.tsx covers V5 on).
vi.mock('../../config/features', async (orig) => ({ ...(await orig<typeof import('../../config/features')>()), V5: false }));

import DataCenterView, { type DcDeps } from './DataCenter';
import { ModeSwitch } from './ModeSwitch';

const RESULTS = `${resolve(process.cwd(), '../results')}/`; // jsdom: import.meta.url is not a file URL
const json = (p: string) => JSON.parse(readFileSync(`${RESULTS}${p}`, 'utf8'));
const COVERAGE: DcCoverage[] = [
  { location: 'HB_HOUSTON', year: 2025, first: '2025-01-01', last: '2025-12-31' },
  { location: 'HB_WEST', year: 2025, first: '2025-01-01', last: '2025-12-31' },
];

let highs: Highs;
const prices = new Map<string, PriceFile>();
beforeAll(async () => {
  highs = await highsLoader();
  for (const loc of ['HB_HOUSTON', 'HB_WEST']) prices.set(loc, await parsePriceFile(new Uint8Array(gunzipSync(readFileSync(`${RESULTS}prices/${loc}_2025.ebp`))))); // jsdom's Blob has no stream()
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
afterEach(() => { cleanup(); window.history.replaceState(null, '', '#/'); });

/** Real data and the real engine, solved on the main thread instead of the worker. */
function deps() {
  const runs: { inputs: DcEngineInputs; result: DataCenterResult }[] = [];
  const d: DcDeps = {
    solve: async (inputs) => {
      const result = runDataCenterCase({ ...inputs, highs, prices: prices.get(inputs.node)! });
      runs.push({ inputs, result });
      return { result, ms: 1 };
    },
    loadFourCp: async (y) => json(`v4/fourcp/${y}.json`) as FourCpYear,
    loadStackKeys: async () => parseStackIndex(json('v4/stack/index.json')),
    loadStackRow: async (k, loc) => (json(`v4/stack/${k.year}_${k.durationH}h_${k.mode}.json`) as StackFile).nodes[loc] ?? null,
  };
  return { d, runs };
}

const open = (query: string, d: DcDeps) => {
  window.history.replaceState(null, '', `#/studio?${query}`);
  return render(<MantineProvider><DataCenterView coverage={COVERAGE} deps={d} /></MantineProvider>);
};
const last = <T,>(xs: T[]) => xs[xs.length - 1];

describe('Data Center mode', () => {
  it('opens from a site link, runs the engine with the stack and shows its breakdown exactly', async () => {
    const { d, runs } = deps();
    open('mode=dc&loc=HB_WEST&year=2025&mwh=100&site=Jack+County&lat=33.2&lon=-98.2&node=JACK_X&km=12.3', d);
    expect(screen.getByTestId('dc-site').textContent).toMatch(/Jack County.*Nearest node JACK_X, 12\.3 km.*Prices from HB_WEST: JACK_X has no price file/);

    await waitFor(() => expect(screen.getByTestId('dc-results')).toBeTruthy(), { timeout: 15000 });
    const { inputs, result } = last(runs);
    // The engine wiring: the form's values, the 4CP year and the stack row for 2025, 2 h, realistic at HB_WEST.
    const row = (json('v4/stack/2025_2h_realistic.json') as StackFile).nodes.HB_WEST;
    expect(inputs).toMatchObject({ node: 'HB_WEST', year: 2025, batteryMw: 50, batteryMwh: 100, exportAllowed: false, fourCpStrategy: 'realistic', asEnabled: true });
    expect(inputs.asStack).toMatchObject({ energy: row.energy, regup: row.regup, nsrs: row.nsrs });
    expect(inputs.fourCp.year).toBe(2025);
    expect(result.breakdown.as).toBeGreaterThan(0);

    // What is displayed is the engine output.
    expect(screen.getByTestId('dc-perkw').textContent).toBe(usd(result.perKwYr, 1));
    expect(screen.getByTestId('dc-total').textContent).toBe(money(result.totalUsd));
    for (const k of ['energy', 'as', 'fourCp', 'reliability'] as const) {
      expect(screen.getByTestId(`dc-row-${k}-perkw`).textContent).toBe(usd(result.breakdownPerKwYr[k], 1));
      expect(screen.getByTestId(`dc-row-${k}-usd`).textContent).toBe(`${money(result.breakdown[k])}/yr`);
    }
    expect(screen.getByTestId('dc-standalone').textContent).toBe(usd(result.standalone.perKwYr, 1));
    const wf = JSON.parse(screen.getAllByTestId('chart')[0].getAttribute('data-option')!);
    expect(wf.series[1].data.map((x: { value: number }) => x.value)).toEqual(
      [...(['energy', 'as', 'fourCp', 'reliability'] as const).map((k) => Math.abs(result.breakdownPerKwYr[k])), Math.abs(result.perKwYr)],
    );
    // The one-day chart is the engine's dispatch sample.
    const day = JSON.parse(screen.getAllByTestId('chart')[1].getAttribute('data-option')!);
    expect(day.series.find((s: { name: string }) => s.name === 'Site load').data).toEqual(result.dispatchSample!.loadMw);
    expect(within(screen.getByTestId('dc-4cp')).getAllByRole('row')).toHaveLength(1 + result.fourCpDetail.length);
    // The link keeps the site.
    expect(window.location.hash).toContain('site=Jack+County');
  }, 30000);

  it('says why it is energy only, and turns ancillary services off', async () => {
    const { d, runs } = deps();
    open('mode=dc&loc=HB_HOUSTON&year=2025&mwh=150', d);
    await waitFor(() => expect(screen.getByTestId('dc-results')).toBeTruthy(), { timeout: 15000 });
    expect(screen.getByTestId('dc-as-note').textContent).toMatch(/^Energy only\. No precomputed stack for a 3-hour battery/);
    expect(last(runs).inputs.asEnabled).toBe(false);
    expect(last(runs).result.breakdown.as).toBe(0);
    expect(screen.getByTestId('dc-notes').textContent).toContain('No precomputed stack');

    fireEvent.click(screen.getByTestId('dc-as-false'));
    await waitFor(() => expect(screen.getByTestId('dc-as-note').textContent).toBe('Energy only.'));
    expect(window.location.hash).toContain('as=0');
  }, 30000);

  it('with V5 off has no transmission charge control and ignores tcos in the address', async () => {
    const { d, runs } = deps();
    open('mode=dc&loc=HB_WEST&year=2025&tcos=12cp', d);
    await waitFor(() => expect(screen.getByTestId('dc-results')).toBeTruthy(), { timeout: 15000 });
    expect(screen.queryByTestId('dc-tcos-control')).toBeNull();
    expect(screen.queryByTestId('dc-tcos')).toBeNull();
    expect(window.location.hash).not.toContain('tcos');
    expect(screen.getByTestId('dc-row-fourCp').textContent).toContain('4CP avoided');
    expect(screen.getByTestId('dc-perkw').textContent).toBe(usd(last(runs).result.perKwYr, 1));
  }, 30000);

  it('validates inputs before solving', async () => {
    const { d, runs } = deps();
    open('mode=dc&loc=HB_HOUSTON&year=2025&load=0&ws=18&we=15', d);
    const errs = await screen.findByTestId('dc-errors');
    expect(errs.textContent).toMatch(/Site load \(MW\) must be between/);
    expect(errs.textContent).toContain('The 4CP window must be whole hours with start before end.');
    await new Promise((r) => setTimeout(r, 500));
    expect(runs).toHaveLength(0);
  });

  it('labels assumption defaults with their sources and links the rule reviews', async () => {
    const { d } = deps();
    open('mode=dc&loc=HB_HOUSTON&year=2025', d);
    const adv = screen.getByTestId('dc-advanced');
    expect(adv.textContent).toContain(`${rules.defaults.valueOfLostLoad.label}.`);
    expect(within(adv).getAllByText('assumption')).toHaveLength(4);
    const links = within(adv).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining([rules.defaults.valueOfLostLoad.source, rules.fourCp.defaultRatePerKwPer4cp.source]));
    await waitFor(() => expect(screen.getByTestId('dc-rules')).toBeTruthy(), { timeout: 15000 });
    const ruleLinks = within(screen.getByTestId('dc-rules')).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(ruleLinks).toEqual(expect.arrayContaining([...rules.fourCp.review.sources, rules.sb6.statute.billText]));
  }, 30000);

  it('warns when the window misses a 4CP interval and widens it', async () => {
    const { d } = deps();
    open('mode=dc&loc=HB_HOUSTON&year=2025&ws=16&we=17', d);
    const miss = await screen.findByTestId('dc-window-miss', {}, { timeout: 5000 });
    fireEvent.click(within(miss).getByRole('button'));
    await waitFor(() => expect(screen.queryByTestId('dc-window-miss')).toBeNull());
    // 2025's intervals end 17:00 to 17:30 (counted 16:45 to 17:45): the smallest whole-hour fit keeps 16:00 and moves the end to 18:00.
    expect(window.location.hash).toContain('ws=16');
    expect(window.location.hash).not.toContain('we=');
  }, 30000);
});

describe('Studio mode switch', () => {
  it('moves between the battery form and Data Center mode, keeping the location', () => {
    window.history.replaceState(null, '', '#/studio?loc=HB_WEST&dur=2');
    render(<MantineProvider><ModeSwitch mode="battery" /></MantineProvider>);
    expect(screen.getByTestId('mode-battery').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('mode-dc'));
    expect(window.location.hash).toBe('#/studio?mode=dc&loc=HB_WEST');
  });
});
