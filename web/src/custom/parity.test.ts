/// <reference types="node" />
// Parity: the highs-js port must reproduce the Python model within 0.5% on the
// same published price files (results/prices/*.ebp). The reference numbers come
// from scripts/parity_reference.py, which also records how close those files
// come to the committed results JSON (required within 0.5% here as well).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import highsLoader, { type Highs } from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parsePriceFile } from './prices';
import { runCustom, type CustomResult } from './runner';

const RESULTS = fileURLToPath(new URL('../../../results/', import.meta.url));
const reference = JSON.parse(readFileSync(join(RESULTS, 'parity', 'reference.json'), 'utf8'));
const TOL: number = reference.tolerance_rel;

interface RefRun {
  location: string;
  year: number;
  hours: number;
  deg: number;
  power_mw: number;
  rte: number;
  start_date: string;
  end_date: string;
  days_solved: number;
  skipped_days: string[];
  max_rel_difference_from_published: number;
  metrics: Record<string, number | null>;
}

/** |a - b| within TOL of |b|, with a small absolute floor for values near zero. */
function close(actual: number, expected: number, floor = 0.01) {
  return Math.abs(actual - expected) <= Math.max(TOL * Math.abs(expected), floor);
}

let highs: Highs;
const results: CustomResult[] = [];

beforeAll(async () => {
  highs = await highsLoader();
  for (const r of reference.runs as RefRun[]) {
    const file = await parsePriceFile(readFileSync(join(RESULTS, 'prices', `${r.location}_${r.year}.ebp`)));
    const t0 = performance.now();
    results.push(
      runCustom(highs, [file], {
        location: r.location,
        startDate: r.start_date,
        endDate: r.end_date,
        powerMw: r.power_mw,
        durationH: r.hours,
        rte: r.rte,
        degCost: r.deg,
      }),
    );
    console.log(`${r.location} ${r.year} ${r.hours}h $${r.deg}: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
}, 900_000); // HB_PAN 2024 has 230 MILP-fallback days and takes ~4 minutes on a laptop

describe('browser LP matches the Python model within 0.5%', () => {
  (reference.runs as RefRun[]).forEach((r, i) => {
    it(`${r.location} ${r.year} ${r.hours}h, $${r.deg}/MWh`, () => {
      expect(r.max_rel_difference_from_published, 'price files reproduce the committed results').toBeLessThanOrEqual(TOL);
      const { run, skippedDays } = results[i];
      expect(run.meta.days_solved).toBe(r.days_solved);
      expect(skippedDays).toEqual(r.skipped_days);
      const got = run.metrics as unknown as Record<string, number | null>;
      const rows = Object.entries(r.metrics).map(([k, want]) => ({ k, want, got: got[k] }));
      console.table(rows);
      for (const { k, want, got: g } of rows) {
        if (want === null) expect(g, k).toBeNull();
        else expect(close(g as number, want), `${k}: browser ${g}, Python ${want}`).toBe(true);
      }
    });
  });
});

describe('single days', () => {
  for (const d of reference.days) {
    it(`${d.date}: ${d.why}`, () => {
      const row = results[d.run].days.find((x) => x.date === d.date);
      expect(row, d.date).toBeDefined();
      expect(row!.intervals).toBe(d.intervals);
      expect(row!.usedMilp).toBe(d.used_milp);
      expect(close(row!.revenue, d.revenue), `revenue: browser ${row!.revenue}, Python ${d.revenue}`).toBe(true);
      expect(close(row!.cycles, d.cycles, 1e-4)).toBe(true);
      if (d.da_rt_revenue === null) expect(row!.daRtRevenue).toBeNull();
      else {
        expect(close(row!.daRtRevenue!, d.da_rt_revenue), `DA-scheduled: ${row!.daRtRevenue} vs ${d.da_rt_revenue}`).toBe(true);
        expect(close(row!.daDaRevenue!, d.da_da_revenue)).toBe(true);
      }
    });
  }
});
