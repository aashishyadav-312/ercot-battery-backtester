/// <reference types="node" />
// Studio shows a precomputed 100 MW run at any power by scaling its dollar figures (data/studio.ts scaleRun), and offers a
// start-charge input the precomputed runs do not have. Both rest on the solver, so check them on the solver itself, over
// three HB_PAN days that include the MILP-fallback day from the parity test (2024-05-08).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import highsLoader, { type Highs } from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { optimizeDay } from './dispatch';
import { filledDay, parsePriceFile, splitDays, type PriceFile } from './prices';
import { runCustom, type CustomParams } from './runner';
import { scaleRun } from '../data/studio';

const RESULTS = fileURLToPath(new URL('../../../results/', import.meta.url));
let highs: Highs;
let pan: PriceFile;
const P: CustomParams = { location: 'HB_PAN', startDate: '2024-05-07', endDate: '2024-05-09', powerMw: 100, durationH: 1, rte: 0.85, degCost: 0 };
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);

beforeAll(async () => {
  highs = await highsLoader();
  pan = await parsePriceFile(readFileSync(join(RESULTS, 'prices', 'HB_PAN_2024.ebp')));
}, 60_000);

describe('power only scales dollars', () => {
  it('a 37 MW run earns the same per kW as a 100 MW run, MILP day included', () => {
    const a = runCustom(highs, [pan], P);
    const b = runCustom(highs, [pan], { ...P, powerMw: 37 });
    expect(a.days.some((d) => d.usedMilp), 'the range includes a MILP-fallback day').toBe(true);
    // The MILP stops at a 0.01% gap, so allow that much.
    expect(rel(b.run.metrics.revenue_per_kw_period, a.run.metrics.revenue_per_kw_period)).toBeLessThan(1e-4);
    expect(rel(b.run.metrics.da_rt_revenue_per_kw_period!, a.run.metrics.da_rt_revenue_per_kw_period!)).toBeLessThan(1e-4);
    expect(rel(b.run.metrics.cycles_per_year, a.run.metrics.cycles_per_year)).toBeLessThan(1e-3);
    // Scaling the 100 MW result gives the 37 MW one.
    const s = scaleRun(a.run, 37);
    expect(rel(s.metrics.total_revenue, b.run.metrics.total_revenue)).toBeLessThan(1e-4);
    s.daily.revenue.forEach((v, i) => expect(Math.abs(v - b.run.daily.revenue[i])).toBeLessThan(Math.max(1, 1e-4 * Math.abs(v))));
  }, 120_000);
});

describe('start charge', () => {
  it('each day starts and ends at the chosen share of energy', () => {
    const day = splitDays(pan.rt).find((d) => d.date === '2024-05-09')!;
    const prices = filledDay(pan.rt, day)!;
    const r = optimizeDay(highs, prices, 0.25, 100, 100, 0.85, 0, 0.4);
    expect(r.soc[r.soc.length - 1]).toBeCloseTo(40, 6);
  });

  it('defaults to an empty battery, as the precomputed runs, and records the value it used', () => {
    const a = runCustom(highs, [pan], { ...P, startDate: '2024-05-09' });
    const b = runCustom(highs, [pan], { ...P, startDate: '2024-05-09', soc0Frac: 0 });
    const c = runCustom(highs, [pan], { ...P, startDate: '2024-05-09', soc0Frac: 0.5 });
    expect(a.run.metrics).toEqual(b.run.metrics);
    expect([a.run.meta.soc_start_end_frac, c.run.meta.soc_start_end_frac]).toEqual([0, 0.5]);
    expect(c.days[0].revenue).not.toBe(a.days[0].revenue);
  }, 60_000);
});
