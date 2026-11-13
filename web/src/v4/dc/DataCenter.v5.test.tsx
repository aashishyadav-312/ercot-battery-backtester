// @vitest-environment jsdom
/// <reference types="node" />
// V5 Step 5: the transmission charge control, the comparison block, the link and the hand-off to Project economics. Real data and the
// real engine (the same setup as DataCenter.test.tsx), with the V5 flag mocked on.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import highsLoader, { type Highs } from 'highs';
import type { ChartTheme } from '../../components/Chart';
import { parsePriceFile, type PriceFile } from '../../custom/prices';
import { type FourCpYear } from '../../custom/datacenter';
import { runTwelveCpCase, TWELVECP_RULES, type TwelveCpComparison, type TwelveCpYear } from '../../custom/twelvecp';
import { runDataCenterCase } from '../../custom/datacenter';
import { downloadCsv, usd } from '../../data/format';
import { money } from '../../data/studio';
import { parseStackIndex } from '../site/stackIndex';
import { parseRevHash } from '../revenueSource';
import type { StackFile } from '../stack';
import type { DcCoverage } from './dcForm';
import { getDcCase } from './dcCase';

vi.mock('../../data/format', async (orig) => ({ ...(await orig<typeof import('../../data/format')>()), downloadCsv: vi.fn() }));
vi.mock('../../config/features', async (orig) => ({ ...(await orig<typeof import('../../config/features')>()), V5: true }));

const THEME = Object.fromEntries(['mode', 'surface', 'text', 'muted', 'grid', 'axis', 'tooltipBg', 'tooltipBorder', 'blue', 'green', 'cyan', 'violet', 'orange', 'rose', 'discharge', 'charge'].map((k) => [k, k])) as unknown as ChartTheme;
(THEME as unknown as { grey: string[] }).grey = ['grey0', 'grey1', 'grey2'];
vi.mock('../../components/Chart', () => ({
  Chart: ({ build, label }: { build: (t: ChartTheme) => unknown; label: string }) => <div role="img" aria-label={label} data-testid="chart" data-option={JSON.stringify(build(THEME))} />,
  axisBase: () => ({}), legendBase: () => ({}), tooltipBase: () => ({}),
}));

import DataCenterView, { type DcDeps } from './DataCenter';

const RESULTS = `${resolve(process.cwd(), '../results')}/`;
const json = (p: string) => JSON.parse(readFileSync(`${RESULTS}${p}`, 'utf8'));
const COVERAGE: DcCoverage[] = [{ location: 'HB_WEST', year: 2025, first: '2025-01-01', last: '2025-12-31' }];

let highs: Highs;
let price: PriceFile;
beforeAll(async () => {
  highs = await highsLoader();
  price = await parsePriceFile(new Uint8Array(gunzipSync(readFileSync(`${RESULTS}prices/HB_WEST_2025.ebp`))));
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
afterEach(() => { cleanup(); window.history.replaceState(null, '', '#/'); });

function deps() {
  const runs: { comparison?: TwelveCpComparison }[] = [];
  const d: DcDeps = {
    solve: async (inputs, twelveCp) => {
      const full = { ...inputs, highs, prices: price };
      if (!twelveCp) return { result: runDataCenterCase(full), ms: 1 };
      const comparison = runTwelveCpCase(full, TWELVECP_RULES, twelveCp);
      runs.push({ comparison });
      return { result: comparison.fourCp.result, ms: 1, comparison };
    },
    loadFourCp: async (y) => json(`v4/fourcp/${y}.json`) as FourCpYear,
    loadTwelveCp: async (y) => json(`v5/twelvecp/${y}.json`) as TwelveCpYear,
    loadStackKeys: async () => parseStackIndex(json('v4/stack/index.json')),
    loadStackRow: async (k, loc) => (json(`v4/stack/${k.year}_${k.durationH}h_${k.mode}.json`) as StackFile).nodes[loc] ?? null,
  };
  return { d, runs };
}
const open = (query: string, d: DcDeps) => {
  window.history.replaceState(null, '', `#/studio?${query}`);
  return render(<MantineProvider><DataCenterView coverage={COVERAGE} deps={d} /></MantineProvider>);
};

describe('Data Center mode with V5 on', () => {
  it('shows both rules at once, and the control picks which one drives the page and the link', async () => {
    const { d, runs } = deps();
    open('mode=dc&loc=HB_WEST&year=2025', d);
    await waitFor(() => expect(screen.getByTestId('dc-tcos')).toBeTruthy(), { timeout: 30000 });
    const cmp = runs[runs.length - 1].comparison!;

    // tcos missing: 4CP is selected and the main result is the 4CP run, the one the page has always shown.
    expect(window.location.hash).not.toContain('tcos');
    expect(screen.getByTestId('dc-tcos-4cp').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('dc-perkw').textContent).toBe(usd(cmp.fourCp.result.perKwYr, 1));
    expect(screen.getByTestId('dc-row-fourCp-perkw').textContent).toBe(usd(cmp.fourCp.result.breakdownPerKwYr.fourCp, 1));

    // Both rows are always visible, with the engine's numbers.
    for (const [t, o] of [['4cp', cmp.fourCp], ['12cp', cmp.twelveCp]] as const) {
      expect(screen.getByTestId(`dc-cmp-${t}-avoided`).textContent).toBe(usd(o.avoidedPerKwYr, 1));
      expect(screen.getByTestId(`dc-cmp-${t}-alert`).textContent).toBe(String(o.alertDays));
      expect(screen.getByTestId(`dc-cmp-${t}-given`).textContent).toBe(usd(o.energyGivenUpPerKwYr, 1));
      expect(screen.getByTestId(`dc-cmp-${t}-net`).textContent).toBe(usd(o.netPerKwYr, 1));
    }
    expect(cmp.twelveCp.avoidedPerKwYr).not.toBe(cmp.fourCp.avoidedPerKwYr);

    // Switching changes the result and the address, and does not solve again.
    const before = runs.length;
    fireEvent.click(screen.getByTestId('dc-tcos-12cp'));
    await waitFor(() => expect(screen.getByTestId('dc-perkw').textContent).toBe(usd(cmp.twelveCp.result.perKwYr, 1)));
    expect(window.location.hash).toContain('tcos=12cp');
    expect(screen.getByTestId('dc-row-fourCp-perkw').textContent).toBe(usd(cmp.twelveCp.result.breakdownPerKwYr.fourCp, 1));
    expect(screen.getByTestId('dc-row-fourCp').textContent).toContain('12CP avoided');
    expect(screen.getByTestId('dc-total').textContent).toBe(money(cmp.twelveCp.result.totalUsd));
    expect(within(screen.getByTestId('dc-4cp')).getAllByRole('row')).toHaveLength(1 + cmp.twelveCp.result.fourCpDetail.length);
    const wf = JSON.parse(screen.getAllByTestId('chart')[0].getAttribute('data-option')!);
    expect(wf.xAxis.data).toContain('12CP avoided');
    expect(screen.getByTestId('dc-cmp-4cp').textContent).toContain(usd(cmp.fourCp.avoidedPerKwYr, 1)); // still shown
    expect(runs.length).toBe(before);

    // The hand-off to Project economics carries the selected rule and its total.
    const href = screen.getByTestId('dc-to-economics').getAttribute('href')!;
    const p = parseRevHash(href);
    expect(p).toMatchObject({ rev: 'dc', tcos: '12cp' });
    expect(p.dc).toBe(Math.round(cmp.twelveCp.result.perKwYr * 100) / 100);
    expect(getDcCase()).toMatchObject({ tcos: '12cp' });

    // CSV and the print sheet carry both rows, whichever rule is selected.
    fireEvent.click(screen.getByTestId('dc-csv-out'));
    const [, , csvRows] = vi.mocked(downloadCsv).mock.calls[0] as unknown as [string, string[], (string | number | null)[][]];
    for (const [t, o] of [['4CP', cmp.fourCp], ['12CP', cmp.twelveCp]] as const) {
      const sec = csvRows.filter((r) => r[0] === `Transmission ${t}`);
      expect(sec.find((r) => r[1] === 'Avoided charge' && r[3] === '$/kW-yr')![2]).toBe(Math.round(o.avoidedPerKwYr * 100) / 100);
      expect(sec.find((r) => r[1] === 'Net value' && r[3] === '$/yr')![2]).toBe(Math.round(o.netUsd));
    }
    expect(csvRows.find((r) => r[0] === 'Input' && r[1] === 'Transmission charge rule')![2]).toBe('12CP (proposed)');
    expect(within(screen.getByTestId('dc-print-tcos')).getAllByRole('row')).toHaveLength(3);

    fireEvent.click(screen.getByTestId('dc-tcos-4cp'));
    await waitFor(() => expect(screen.getByTestId('dc-perkw').textContent).toBe(usd(cmp.fourCp.result.perKwYr, 1)));
    expect(window.location.hash).not.toContain('tcos');
    expect(parseRevHash(screen.getByTestId('dc-to-economics').getAttribute('href')!).tcos).toBeUndefined();
  }, 120000);

  it('opens on 12CP from the address, and the rule note comes from the rules config', async () => {
    const { d } = deps();
    open('mode=dc&loc=HB_WEST&year=2025&tcos=12cp', d);
    await waitFor(() => expect(screen.getByTestId('dc-tcos')).toBeTruthy(), { timeout: 30000 });
    expect(screen.getByTestId('dc-tcos-12cp').getAttribute('aria-pressed')).toBe('true');
    const note = screen.getByTestId('dc-tcos-rules');
    expect(note.textContent).toContain(TWELVECP_RULES.status.text);
    expect(note.textContent).toContain(TWELVECP_RULES.status.asOf);
    const links = within(note).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(TWELVECP_RULES.status.sources));
    expect(within(note).getByText('What the 12CP model ignores')).toBeTruthy();
  }, 60000);

  it('says so when the year has only some of the 12 monthly peaks', async () => {
    const { d } = deps();
    const cov: DcCoverage[] = [{ location: 'HB_WEST', year: 2025, first: '2025-01-01', last: '2025-12-31' }];
    const partial = (await d.loadTwelveCp!(2025));
    const short: TwelveCpYear = { ...partial, complete: false, intervals: partial.intervals.slice(0, 10), months_finished: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
    d.loadTwelveCp = async () => short;
    window.history.replaceState(null, '', '#/studio?mode=dc&loc=HB_WEST&year=2025');
    render(<MantineProvider><DataCenterView coverage={cov} deps={d} /></MantineProvider>);
    const msg = await screen.findByTestId('dc-cmp-12cp-partial', {}, { timeout: 60000 });
    expect(msg.textContent).toContain('10 of 12 peaks (Jan to Oct)');
    expect(screen.queryByTestId('dc-cmp-4cp-partial')).toBeNull();
  }, 90000);

  it('falls back to 4CP only, and says so, when the 12CP file does not load', async () => {
    const { d, runs } = deps();
    d.loadTwelveCp = async () => { throw new Error('HTTP 404'); };
    open('mode=dc&loc=HB_WEST&year=2025&tcos=12cp', d);
    await waitFor(() => expect(screen.getByTestId('dc-results')).toBeTruthy(), { timeout: 30000 });
    expect(runs).toHaveLength(0); // no comparison run
    expect(screen.queryByTestId('dc-tcos')).toBeNull();
    expect(screen.getByTestId('dc-tcos-control').textContent).toContain('did not load');
    expect(screen.getByTestId('dc-row-fourCp').textContent).toContain('4CP avoided');
  }, 60000);
});
