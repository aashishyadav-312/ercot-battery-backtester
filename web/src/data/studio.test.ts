import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyPatch, compareRows, durationTradeoff, initialForm, money, monthlyBars, presetFor, presetGaps, resultKey, scaleRun, totals, yearRange,
} from './studio';
import { FORM_DEFAULTS, type Coverage } from '../custom/params';
import type { IndexRun, NodeSelection, Run } from './types';

// Real results files, as the page loads them. Tests run from web/, so results/ is one level up.
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
const NODES = read<NodeSelection>('node_selection.json');
const COVERAGE: Coverage[] = read<{ files: { location: string; year: number; rt_first_day: string; rt_last_day: string }[] }>('prices/index.json')
  .files.map((f) => ({ location: f.location, year: f.year, first: f.rt_first_day, last: f.rt_last_day }));
const row = (loc: string, year: number, h: number, deg: number) =>
  INDEX.find((r) => r.location === loc && r.year === year && r.duration_h === h && r.deg_cost_per_mwh === deg)!;
const HOU = read<Run>(row('HB_HOUSTON', 2025, 2, 10).file);

describe('presets', () => {
  it('matches the default inputs to the precomputed Houston 2025 2-hour run', () => {
    expect(presetFor(FORM_DEFAULTS, INDEX)?.file).toBe('HB_HOUSTON_2025_2h_0.85_10.json');
  });

  it('matches at any power, and at no other efficiency, start charge, duration, cost or dates', () => {
    expect(presetFor({ ...FORM_DEFAULTS, powerMw: 250 }, INDEX)?.file).toBe('HB_HOUSTON_2025_2h_0.85_10.json');
    for (const patch of [{ rtePct: 90 }, { socPct: 50 }, { durationH: 3 }, { degCost: 5 }, { startDate: '2025-02-01' }, { endDate: '2025-12-30' }]) {
      expect(presetFor({ ...FORM_DEFAULTS, ...patch }, INDEX), JSON.stringify(patch)).toBeNull();
    }
  });

  it("a year opens on the precomputed run's own dates, which can differ from the price files", () => {
    const r26 = row('HB_HOUSTON', 2026, 2, 10);
    const c26 = COVERAGE.find((c) => c.location === 'HB_HOUSTON' && c.year === 2026)!;
    expect(yearRange('HB_HOUSTON', 2026, INDEX, COVERAGE)).toEqual({ startDate: r26.first_day, endDate: r26.last_day });
    expect(r26.last_day < c26.last).toBe(true); // prices run ahead of the 2026 results
    const r24 = row('RUSSEKST_RN', 2024, 4, 0);
    expect(yearRange('RUSSEKST_RN', 2024, INDEX, COVERAGE)).toEqual({ startDate: r24.first_day, endDate: r24.last_day });
  });

  it('opens a link that carries only `year` (header tab, old Compare link) on the preset', () => {
    const f = initialForm('loc=RUSSEKST_RN&dur=4&year=2024&deg=0', COVERAGE, INDEX);
    expect(presetFor(f, INDEX)?.file).toBe('RUSSEKST_RN_2024_4h_0.85_0.json');
    expect(initialForm('loc=HB_WEST&year=2026', COVERAGE, INDEX).endDate).toBe(row('HB_WEST', 2026, 2, 10).last_day);
    // Explicit dates are kept as written.
    expect(initialForm('loc=HB_WEST&from=2025-06-01&to=2025-08-31', COVERAGE, INDEX)).toMatchObject({ startDate: '2025-06-01', endDate: '2025-08-31' });
  });

  it('moves a whole-year range with the location, and keeps a custom range', () => {
    const f = initialForm('loc=HB_HOUSTON&year=2026', COVERAGE, INDEX);
    const g = applyPatch(f, { location: 'RHESS2_ESS1' }, INDEX, COVERAGE);
    expect(presetFor(g, INDEX)?.file).toBe('RHESS2_ESS1_2026_2h_0.85_10.json');
    const custom = { ...FORM_DEFAULTS, startDate: '2025-06-01', endDate: '2025-08-31' };
    expect(applyPatch(custom, { location: 'HB_WEST' }, INDEX, COVERAGE)).toMatchObject({ startDate: '2025-06-01', endDate: '2025-08-31' });
  });

  it('says which inputs keep a run off the presets', () => {
    expect(presetGaps(FORM_DEFAULTS, INDEX)).toEqual([]);
    expect(presetGaps({ ...FORM_DEFAULTS, rtePct: 90, socPct: 20 }, INDEX)).toEqual(['Round trip 90% (precomputed: 85%)', 'Start charge 20% (precomputed: 0%, empty)']);
    expect(presetGaps({ ...FORM_DEFAULTS, durationH: 3, degCost: 5 }, INDEX)).toEqual(['Duration 3 h (precomputed: 1, 2 or 4 h)', 'Degradation $5/MWh (precomputed: $0 or $10)']);
    expect(presetGaps({ ...FORM_DEFAULTS, endDate: '2025-06-30' }, INDEX)).toEqual(['Dates Jan 1, 2025 to Jun 30, 2025 (precomputed: Jan 1, 2025 to Dec 31, 2025)']);
  });

  it('leaves power out of the result key, since it only scales dollars', () => {
    expect(resultKey({ ...FORM_DEFAULTS, powerMw: 7 })).toBe(resultKey(FORM_DEFAULTS));
    expect(resultKey({ ...FORM_DEFAULTS, socPct: 10 })).not.toBe(resultKey(FORM_DEFAULTS));
  });
});

describe('power scales dollar totals', () => {
  it('totals are revenue per kW over the period times the power in kW', () => {
    for (const mw of [1, 100, 250]) {
      const t = totals(HOU, mw);
      expect(t.pf).toBeCloseTo(HOU.metrics.revenue_per_kw_period * mw * 1000, 6);
      expect(t.da).toBeCloseTo(HOU.metrics.da_rt_revenue_per_kw_period! * mw * 1000, 6);
      expect([t.pfYear, t.daYear, t.kept]).toEqual([HOU.metrics.revenue_per_kw_year, HOU.metrics.da_rt_revenue_per_kw_year, HOU.metrics.capture_rate]);
    }
    // At the file's own power the total is the file's total revenue (to the rounding of the per-kW figure).
    expect(Math.abs(totals(HOU, HOU.meta.power_mw).pf - HOU.metrics.total_revenue)).toBeLessThan(HOU.meta.power_mw * 1000 * 0.005);
  });

  it('scaleRun scales dollars and MW, and nothing per kW', () => {
    const s = scaleRun(HOU, 250);
    const k = 250 / HOU.meta.power_mw;
    expect(s.meta.power_mw).toBe(250);
    expect(s.meta.energy_mwh).toBeCloseTo(HOU.meta.energy_mwh * k, 9);
    expect(s.metrics.total_revenue).toBeCloseTo(HOU.metrics.total_revenue * k, 6);
    expect(s.daily.revenue[0]).toBeCloseTo(HOU.daily.revenue[0] * k, 9);
    expect(s.metrics.heatmap_net_mw.values[0][0]).toBeCloseTo(HOU.metrics.heatmap_net_mw.values[0][0] * k, 9);
    expect(s.metrics.revenue_per_kw_year).toBe(HOU.metrics.revenue_per_kw_year);
    expect(s.metrics.monthly_revenue_per_kw).toEqual(HOU.metrics.monthly_revenue_per_kw);
    expect(scaleRun(HOU, HOU.meta.power_mw)).toBe(HOU);
  });

  it('formats dollar totals to three significant figures', () => {
    expect([money(5_312_345), money(999_999), money(812_400), money(12_345), money(4_210.4), money(-1_234_567), money(null)])
      .toEqual(['$5.31M', '$1M', '$812k', '$12.3k', '$4,210', '−$1.23M', '–']);
  });
});

describe('charts', () => {
  it('perfect-foresight months are the run file\'s own monthly series', () => {
    const bars = monthlyBars(HOU, 'pf');
    expect(bars.map((b) => b.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(bars.map((b) => b.value)).toEqual(bars.map((b) => HOU.metrics.monthly_revenue_per_kw[String(b.month)]));
  });

  it('day-ahead months add up to the day-ahead total', () => {
    const sum = monthlyBars(HOU, 'da').reduce((a, b) => a + (b.value ?? 0), 0);
    expect(sum).toBeCloseTo(HOU.metrics.da_rt_revenue_per_kw_period!, 1);
  });

  it('a partial year covers only its months', () => {
    const r = read<Run>(row('HB_HOUSTON', 2026, 2, 10).file);
    expect(monthlyBars(r, 'pf').map((b) => b.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('duration trade-off reads 1, 2 and 4 hours from the index, with $/kWh = $/kW / hours', () => {
    const rows = durationTradeoff(INDEX, 'HB_HOUSTON', 2025, 10);
    expect(rows.map((r) => r.hours)).toEqual([1, 2, 4]);
    for (const r of rows) {
      expect(r.pf).toBe(row('HB_HOUSTON', 2025, r.hours, 10).revenue_per_kw_year);
      expect(r.perKwh).toBeCloseTo(r.pf / r.hours, 12);
    }
  });

  it('compares every location for the same battery, ranked, with node vs hub from the same detailed runs', () => {
    const rows = compareRows(INDEX, NODES, 2025, 2, 10);
    const want = INDEX.filter((r) => r.year === 2025 && r.duration_h === 2 && r.deg_cost_per_mwh === 10);
    expect(rows).toHaveLength(want.length);
    expect(rows.map((r) => r.pf)).toEqual([...want].map((r) => r.revenue_per_kw_year).sort((a, b) => b - a));
    const russ = rows.find((r) => r.location === 'RUSSEKST_RN')!;
    const hub = NODES.nodes.find((n) => n.location === 'RUSSEKST_RN')!.nearest_hub;
    expect(russ.hub).toBe(hub);
    expect(russ.vsHub).toBeCloseTo(row('RUSSEKST_RN', 2025, 2, 10).revenue_per_kw_year / row(hub, 2025, 2, 10).revenue_per_kw_year, 12);
    expect(rows.find((r) => r.location === 'HB_WEST')!.vsHub).toBeNull();
  });
});
