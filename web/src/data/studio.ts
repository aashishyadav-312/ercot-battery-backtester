// Everything the Studio page shows, derived from loaded results files or from a run solved in the browser. Pure
// functions only, so the tests can check every figure on screen against results/*.json.
//
// Studio has two sources for one result shape (data/types.ts `Run`):
// - preset: a precomputed results/<LOC>_<YEAR>_<N>h_0.85_<DEG>.json, used when the inputs match it exactly
//   (location, year, dates, duration, degradation cost, 85% round trip, empty at the start of each day);
// - solved: the same model run in the browser by the highs-js worker (custom/runner.ts) for any other inputs.
// Power is not part of the match: revenue per kW does not depend on it, so a preset at 250 MW is the 100 MW file with
// its dollar figures scaled (scaleRun).

import { hubOf } from './analytics';
import { fmtDate } from './format';
import type { IndexRun, NodeSelection, Run } from './types';
import { PRECOMPUTED, fitRange, parseForm, precomputedKey, type Coverage, type CustomForm } from '../custom/params';

export type Source = 'preset' | 'solved';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** The precomputed run these inputs ask for, or null when they have to be solved in the browser. */
export function presetFor(f: CustomForm, index: IndexRun[]): IndexRun | null {
  const k = precomputedKey(f);
  if (!k) return null;
  return index.find((r) =>
    r.location === k.location && r.year === k.year && r.duration_h === k.duration && r.deg_cost_per_mwh === k.deg
    && near(r.rte * 100, f.rtePct) && r.first_day === f.startDate && r.last_day === f.endDate) ?? null;
}

/** Steps for the number inputs (arrow keys and the spin buttons). */
export const INPUT_STEP = { powerMw: 10, durationH: 0.5, rtePct: 1, degCost: 1, socPct: 5 } as const;

/** True when efficiency or start charge differ from the precomputed runs (the comparisons below use those runs as they are). */
export const batteryDiffers = (f: CustomForm) => !near(f.rtePct, PRECOMPUTED.rtePct) || !near(f.socPct, PRECOMPUTED.socPct);

const list = (xs: readonly number[], unit: (x: number) => string) =>
  xs.length > 1 ? `${xs.slice(0, -1).map(unit).join(', ')} or ${unit(xs[xs.length - 1])}` : unit(xs[0]);

/** Why these inputs are not a precomputed run, one line per input, for the inputs panel. Empty when they are one. */
export function presetGaps(f: CustomForm, index: IndexRun[]): string[] {
  if (presetFor(f, index)) return [];
  const P = PRECOMPUTED;
  const out: string[] = [];
  if (!(P.durations as readonly number[]).includes(f.durationH)) out.push(`Duration ${f.durationH} h (precomputed: ${list(P.durations, (h) => `${h}`)} h)`);
  if (!(P.degs as readonly number[]).includes(f.degCost)) out.push(`Degradation $${f.degCost}/MWh (precomputed: ${list(P.degs, (d) => `$${d}`)})`);
  if (!near(f.rtePct, P.rtePct)) out.push(`Round trip ${f.rtePct}% (precomputed: ${P.rtePct}%)`);
  if (!near(f.socPct, P.socPct)) out.push(`Start charge ${f.socPct}% (precomputed: ${P.socPct}%, empty)`);
  const year = Number(f.startDate.slice(0, 4));
  const r = index.find((x) => x.location === f.location && x.year === year);
  if (!r) out.push(`No precomputed run for this location in ${year}`);
  else if (r.first_day !== f.startDate || r.last_day !== f.endDate) {
    out.push(`Dates ${fmtDate(f.startDate)} to ${fmtDate(f.endDate)} (precomputed: ${fmtDate(r.first_day)} to ${fmtDate(r.last_day)})`);
  }
  return out;
}

/**
 * The dates a year opens with: the precomputed run's own range when there is one, so the result shows at once,
 * otherwise every day with prices. The two differ where the price files run ahead of the precomputed results.
 */
export function yearRange(location: string, year: number, index: IndexRun[], coverage: Coverage[]) {
  const row = index.find((r) => r.location === location && r.year === year);
  if (row) return { startDate: row.first_day, endDate: row.last_day };
  const c = coverage.find((x) => x.location === location && x.year === year);
  return c ? { startDate: c.first, endDate: c.last } : null;
}

/** Last day with prices for the form's location and year (null if none). */
export function pricesEnd(f: CustomForm, coverage: Coverage[]) {
  return coverage.find((c) => c.location === f.location && c.year === Number(f.startDate.slice(0, 4)))?.last ?? null;
}

/** True when the dates are a whole year as a year button sets them (the preset's range or every day with prices). */
function isYearRange(f: CustomForm, index: IndexRun[], coverage: Coverage[]) {
  const year = Number(f.startDate.slice(0, 4));
  const r = yearRange(f.location, year, index, coverage);
  const c = coverage.find((x) => x.location === f.location && x.year === year);
  return (!!r && r.startDate === f.startDate && r.endDate === f.endDate) || (!!c && c.first === f.startDate && c.last === f.endDate);
}

/**
 * Inputs from the URL. A link without dates (the header tab, or an old Compare or Custom run link that carries only
 * `year`) opens the year's preset range, so it shows a precomputed result instead of starting the solver.
 */
export function initialForm(query: string, coverage: Coverage[], index: IndexRun[]): CustomForm {
  const f = parseForm(query, coverage);
  const q = new URLSearchParams(query);
  if (q.has('from') || q.has('to')) return f;
  const r = yearRange(f.location, Number(f.startDate.slice(0, 4)), index, coverage);
  return r ? { ...f, ...r } : f;
}

/** Apply a change to the inputs, keeping the dates valid; a whole-year range follows a new location or year. */
export function applyPatch(cur: CustomForm, patch: Partial<CustomForm>, index: IndexRun[], coverage: Coverage[]): CustomForm {
  const merged = { ...cur, ...patch };
  const year = Number(merged.startDate.slice(0, 4));
  if (patch.location && patch.location !== cur.location && isYearRange(cur, index, coverage)) {
    const r = yearRange(merged.location, year, index, coverage);
    if (r) return { ...merged, ...r };
  }
  return { ...merged, ...fitRange(merged.location, merged.startDate, merged.endDate, coverage) };
}

/** Inputs that change revenue per kW. Power is left out: it only scales dollar figures (see scaleRun). */
export function resultKey(f: CustomForm) {
  return [f.location, f.startDate, f.endDate, f.durationH, f.rtePct, f.degCost, f.socPct].join('|');
}

/**
 * The run at another power. Every constraint of the daily LP scales with power at a fixed duration, so revenue per kW,
 * cycles and prices stay the same and every dollar or MW figure scales by the ratio.
 */
export function scaleRun(run: Run, powerMw: number): Run {
  const k = powerMw / run.meta.power_mw;
  if (k === 1) return run;
  const m = run.metrics;
  return {
    meta: { ...run.meta, power_mw: powerMw, energy_mwh: run.meta.energy_mwh * k },
    metrics: {
      ...m,
      total_revenue: m.total_revenue * k,
      heatmap_net_mw: { ...m.heatmap_net_mw, values: m.heatmap_net_mw.values.map((row) => row.map((v) => v * k)) },
    },
    daily: {
      ...run.daily,
      revenue: run.daily.revenue.map((v) => v * k),
      ...(run.daily.da_rt_revenue ? { da_rt_revenue: run.daily.da_rt_revenue.map((v) => (v == null ? null : v * k)) } : {}),
    },
  };
}

export interface Totals {
  /** Dollars over the run's days at the chosen power. */
  pf: number;
  da: number | null;
  /** $/kW-yr (annualized when the run is not one whole calendar year). */
  pfYear: number;
  daYear: number | null;
  /** Day-ahead revenue as a share of perfect foresight on the same days. */
  kept: number | null;
  annualized: boolean;
}

/** Perfect-foresight and day-ahead totals. Dollar totals are revenue per kW over the period times the power in kW. */
export function totals(run: Run, powerMw: number): Totals {
  const m = run.metrics;
  const kw = powerMw * 1000;
  return {
    pf: m.revenue_per_kw_period * kw,
    da: m.da_rt_revenue_per_kw_period != null ? m.da_rt_revenue_per_kw_period * kw : null,
    pfYear: m.revenue_per_kw_year,
    daYear: m.da_rt_revenue_per_kw_year ?? null,
    kept: m.capture_rate ?? null,
    annualized: m.annualized,
  };
}

/** "$5.31M", "$812k", "$4,210": dollar totals to three significant figures, which is all a backtest supports. */
export function money(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return '–';
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  const r = Number(a.toPrecision(3)); // round first, so 999,999 reads $1M and not $1000k
  const unit = r >= 1e9 ? { d: 1e9, s: 'B' } : r >= 1e6 ? { d: 1e6, s: 'M' } : r >= 1e4 ? { d: 1e3, s: 'k' } : null;
  if (!unit) return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
  return `${sign}$${Number((r / unit.d).toPrecision(3))}${unit.s}`;
}

export interface MonthBar {
  /** 1-12. */
  month: number;
  /** $/kW in that month (null when the run has no days in it). */
  value: number | null;
}

/**
 * Revenue by month in $/kW, for the months the run covers. Perfect foresight is the run's own monthly series; the
 * day-ahead plan is summed from its daily revenue (days the strategy skipped count as nothing).
 */
export function monthlyBars(run: Run, strategy: 'pf' | 'da'): MonthBar[] {
  const first = Number(run.meta.first_day.slice(5, 7));
  const last = Number(run.meta.last_day.slice(5, 7));
  const kw = run.meta.power_mw * 1000;
  const da = new Map<number, number>();
  if (strategy === 'da') {
    const rev = run.daily.da_rt_revenue;
    if (!rev) return [];
    run.daily.date.forEach((d, i) => {
      const v = rev[i];
      if (v != null) da.set(Number(d.slice(5, 7)), (da.get(Number(d.slice(5, 7))) ?? 0) + v / kw);
    });
  }
  const out: MonthBar[] = [];
  for (let month = first; month <= last; month++) {
    const v = strategy === 'pf' ? run.metrics.monthly_revenue_per_kw[String(month)] : da.get(month);
    out.push({ month, value: v ?? null });
  }
  return out;
}

/** The precomputed value closest to `v` (for the trade-off and comparison when the inputs are off-preset). */
export const nearest = (v: number, list: readonly number[]) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

export interface DurationRow {
  hours: number;
  /** $/kW-yr, perfect foresight. */
  pf: number;
  /** pf divided by hours: $ per kWh of storage per year. */
  perKwh: number;
  da: number | null;
  annualized: boolean;
}

/** 1, 2 and 4 hours at one location, year and degradation cost, from the precomputed runs. */
export function durationTradeoff(index: IndexRun[], location: string, year: number, deg: number): DurationRow[] {
  return PRECOMPUTED.durations.flatMap((h) => {
    const r = index.find((x) => x.location === location && x.year === year && x.duration_h === h && x.deg_cost_per_mwh === deg);
    return r ? [{ hours: h, pf: r.revenue_per_kw_year, perKwh: r.revenue_per_kw_year / h, da: r.da_rt_revenue_per_kw_year ?? null, annualized: r.annualized }] : [];
  });
}

export interface CompareRow {
  location: string;
  type: 'hub' | 'node';
  pf: number;
  da: number | null;
  kept: number | null;
  top10: number | null;
  /** For a resource node: its hub (node_selection.json) and node revenue divided by that hub's, same year and settings. */
  hub: string | null;
  vsHub: number | null;
  firstDay: string;
  lastDay: string;
  annualized: boolean;
}

/**
 * Every precomputed location for one year, duration and degradation cost, ranked by perfect-foresight revenue. Node vs
 * hub divides two detailed runs (the hub run uses ERCOT's archive prices), as finding 6 does; the Atlas divides by the
 * all-node run's hub rows instead (finding 9), so the two can differ in the second decimal.
 */
export function compareRows(index: IndexRun[], nodes: NodeSelection | null, year: number, duration: number, deg: number): CompareRow[] {
  const rows = index.filter((r) => r.year === year && r.duration_h === duration && r.deg_cost_per_mwh === deg && near(r.rte * 100, PRECOMPUTED.rtePct));
  const byLoc = new Map(rows.map((r) => [r.location, r]));
  return rows
    .map((r) => {
      const hub = r.location_type === 'node' ? hubOf(r.location, nodes ?? undefined) ?? null : null;
      const h = hub ? byLoc.get(hub) : undefined;
      return {
        location: r.location,
        type: r.location_type,
        pf: r.revenue_per_kw_year,
        da: r.da_rt_revenue_per_kw_year ?? null,
        kept: r.capture_rate ?? null,
        top10: r.top10_day_share,
        hub,
        vsHub: h ? r.revenue_per_kw_year / h.revenue_per_kw_year : null,
        firstDay: r.first_day,
        lastDay: r.last_day,
        annualized: r.annualized,
      };
    })
    .sort((a, b) => b.pf - a.pf);
}
