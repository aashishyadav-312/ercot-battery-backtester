// Custom run: the browser port of model/run_year.py (perfect foresight),
// model/forecast.py (schedule on day-ahead, settle in real time) and the
// metrics in model/metrics.py. Each local operating day is solved on its own;
// the DA-scheduled strategy runs on the same days the perfect-foresight run
// solved, so the two compare day for day, as in the precomputed results.
import type { Highs } from 'highs';
import type { Run, RunMetrics } from '../data/types';
import { optimizeDay } from './dispatch';
import {
  centralHour,
  expectedIntervals,
  filledDay,
  missingCount,
  splitDays,
  type Day,
  type PriceFile,
  type Series,
} from './prices';

export const MAX_GAP_INTERVALS = 4;
export const MAX_DA_GAP_HOURS = 1;
export const SOC0_FRAC = 0;
const RT_DT = 0.25;
const DA_DT = 1;
const PER_HOUR = 4;

export interface CustomParams {
  location: string;
  /** Inclusive local dates, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  powerMw: number;
  durationH: number;
  rte: number;
  degCost: number;
}

export interface DayRow {
  date: string;
  revenue: number;
  grossRevenue: number;
  degradationCost: number;
  energyChargedMwh: number;
  energyDischargedMwh: number;
  cycles: number;
  usedMilp: boolean;
  intervals: number;
  /** DA-scheduled, RT-settled revenue; null when the DA strategy skipped the day. */
  daRtRevenue: number | null;
  daDaRevenue: number | null;
  daCycles: number | null;
}

/** Sent as each calendar month starts (and once at the end): `month` is being solved, `daysDone` are finished. */
export interface Progress {
  month: string;
  daysDone: number;
  daysTotal: number;
}

export interface CustomResult {
  params: CustomParams;
  days: DayRow[];
  skippedDays: string[];
  daSkippedDays: string[];
  /** Same shape as a precomputed results/*.json run, so existing components can render it. */
  run: Run;
}

interface DaySlice {
  file: PriceFile;
  rtDay: Day;
  daDay?: Day;
}

/** The DA-scheduled day, or null when DA and RT intervals don't line up (model/forecast.py rules). */
function daScheduleDay(highs: Highs, s: DaySlice, p: CustomParams, rtPrices: Float64Array) {
  const { file, rtDay, daDay } = s;
  if (!daDay) return null;
  if (missingCount(file.da, daDay) > MAX_DA_GAP_HOURS) return null;
  const rtStart = file.rt.startMs + rtDay.start * file.rt.stepMs;
  const daStart = file.da.startMs + daDay.start * file.da.stepMs;
  if (rtDay.count !== PER_HOUR * daDay.count || rtStart !== daStart) return null;
  const daPrices = filledDay(file.da, daDay);
  if (!daPrices) return null;
  const energy = p.powerMw * p.durationH;
  const da = optimizeDay(highs, daPrices, DA_DT, p.powerMw, energy, p.rte, p.degCost, SOC0_FRAC);
  let gross = 0;
  let discharged = 0;
  for (let i = 0; i < rtPrices.length; i++) {
    const h = Math.floor(i / PER_HOUR);
    const net = da.discharge[h] - da.charge[h];
    gross += rtPrices[i] * net;
    if (net > 0) discharged += net;
  }
  gross *= RT_DT;
  discharged *= RT_DT;
  return { revenueAtRt: gross - p.degCost * discharged, revenueAtDa: da.revenue, cycles: da.cycles };
}

function dayCount(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Run both strategies over [startDate, endDate] using one price file per year
 * (in any order). Calls onProgress as each calendar month starts and once at the end.
 */
export function runCustom(
  highs: Highs,
  files: PriceFile[],
  p: CustomParams,
  onProgress?: (x: Progress) => void,
): CustomResult {
  const energy = p.powerMw * p.durationH;
  const slices: DaySlice[] = [];
  for (const file of [...files].sort((a, b) => a.header.year - b.header.year)) {
    const daDays = new Map(splitDays(file.da).map((d) => [d.date, d]));
    for (const rtDay of splitDays(file.rt)) {
      if (rtDay.date >= p.startDate && rtDay.date <= p.endDate) slices.push({ file, rtDay, daDay: daDays.get(rtDay.date) });
    }
  }

  const days: DayRow[] = [];
  const skippedDays: string[] = [];
  const daSkippedDays: string[] = [];
  // Interval-level sums for spread and the hour x month heatmap.
  let chargeMw = 0, dischargeMw = 0, buy = 0, sell = 0; // prettier-ignore
  const heat = new Map<number, { sum: Float64Array; n: Float64Array }>();

  slices.forEach((s, k) => {
    const { file, rtDay } = s;
    const month = rtDay.date.slice(0, 7);
    if (onProgress && (k === 0 || slices[k - 1].rtDay.date.slice(0, 7) !== month)) {
      onProgress({ month, daysDone: k, daysTotal: slices.length });
    }
    const rt: Series = file.rt;
    const missing = expectedIntervals(rtDay.date, rt.stepMs) - (rtDay.count - missingCount(rt, rtDay));
    const prices = missing > MAX_GAP_INTERVALS ? null : filledDay(rt, rtDay);
    if (!prices) skippedDays.push(rtDay.date);
    else {
      const r = optimizeDay(highs, prices, RT_DT, p.powerMw, energy, p.rte, p.degCost, SOC0_FRAC);
      for (let i = 0; i < prices.length; i++) {
        const c = r.charge[i];
        const d = r.discharge[i];
        chargeMw += c;
        dischargeMw += d;
        buy += prices[i] * c;
        sell += prices[i] * d;
        const local = centralHour(rt.startMs + (rtDay.start + i) * rt.stepMs);
        let cell = heat.get(local.month);
        if (!cell) heat.set(local.month, (cell = { sum: new Float64Array(24), n: new Float64Array(24) }));
        cell.sum[local.hour] += d - c;
        cell.n[local.hour] += 1;
      }
      const da = daScheduleDay(highs, s, p, prices);
      if (!da) daSkippedDays.push(rtDay.date);
      days.push({
        date: rtDay.date,
        revenue: r.revenue,
        grossRevenue: r.grossRevenue,
        degradationCost: r.degradationCost,
        energyChargedMwh: r.energyChargedMwh,
        energyDischargedMwh: r.energyDischargedMwh,
        cycles: r.cycles,
        usedMilp: r.usedMilp,
        intervals: prices.length,
        daRtRevenue: da?.revenueAtRt ?? null,
        daDaRevenue: da?.revenueAtDa ?? null,
        daCycles: da?.cycles ?? null,
      });
    }
  });
  onProgress?.({ month: slices[slices.length - 1]?.rtDay.date.slice(0, 7) ?? '', daysDone: slices.length, daysTotal: slices.length });
  if (!days.length) throw new Error('no complete days in the selected range');

  // Annualization follows model/metrics.py: a full calendar year is not scaled;
  // anything shorter (or a range that isn't one calendar year) scales by 365 / days covered.
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const covered = dayCount(p.startDate, last);
  const year = Number(p.startDate.slice(0, 4));
  const calendarYear = p.startDate === `${year}-01-01` && p.endDate === `${year}-12-31`;
  const annualized = !(calendarYear && covered === dayCount(p.startDate, p.endDate));
  const scale = annualized ? 365 / covered : 1;
  const kw = p.powerMw * 1000;
  const singleYear = p.startDate.slice(0, 4) === last.slice(0, 4);

  const total = days.reduce((a, d) => a + d.revenue, 0);
  const ranked = [...days].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const top10 = ranked.reduce((a, d) => a + d.revenue, 0);
  const monthly: Record<string, number> = {};
  for (const d of days) {
    const key = singleYear ? String(Number(d.date.slice(5, 7))) : d.date.slice(0, 7);
    monthly[key] = (monthly[key] ?? 0) + d.revenue / kw;
  }
  // Rows for every month from January, as the charts index them by month number
  // (a range starting mid-year gets zero rows before it; a full year is unchanged).
  const months = Array.from({ length: Math.max(...heat.keys()) }, (_, i) => i + 1);

  const matched = days.filter((d) => d.daRtRevenue !== null);
  const pfMatched = matched.reduce((a, d) => a + d.revenue, 0);
  const daRt = matched.reduce((a, d) => a + d.daRtRevenue!, 0);
  const daDa = matched.reduce((a, d) => a + d.daDaRevenue!, 0);

  const buyPrice = buy / chargeMw;
  const sellPrice = sell / dischargeMw;
  const metrics: RunMetrics = {
    revenue_per_kw_year: round((total / kw) * scale, 2),
    revenue_per_kw_period: round(total / kw, 2),
    annualized,
    days_covered: covered,
    total_revenue: Math.round(total),
    top10_day_share: total > 0 ? round(top10 / total, 4) : null,
    top10_days: ranked.map((d) => d.date),
    cycles_per_year: round(days.reduce((a, d) => a + d.cycles, 0) * scale, 1),
    avg_charge_price: round(buyPrice, 2),
    avg_discharge_price: round(sellPrice, 2),
    avg_spread_captured: round(sellPrice - buyPrice, 2),
    milp_days: days.filter((d) => d.usedMilp).length,
    monthly_revenue_per_kw: Object.fromEntries(Object.entries(monthly).map(([k, v]) => [k, round(v, 3)])),
    heatmap_net_mw: {
      months,
      hours: Array.from({ length: 24 }, (_, h) => h),
      values: months.map((m) => {
        const c = heat.get(m);
        return Array.from({ length: 24 }, (_, h) => (c?.n[h] ? round(c.sum[h] / c.n[h], 1) : 0));
      }),
    },
    da_rt_revenue_per_kw_year: round((daRt / kw) * scale, 2),
    da_rt_revenue_per_kw_period: round(daRt / kw, 2),
    da_da_revenue_per_kw_year: round((daDa / kw) * scale, 2),
    pf_revenue_per_kw_year_matched: round((pfMatched / kw) * scale, 2),
    value_of_perfect_foresight_per_kw_year: round(((pfMatched - daRt) / kw) * scale, 2),
    capture_rate: pfMatched > 0 ? round(daRt / pfMatched, 4) : null,
    da_days_matched: matched.length,
    da_losing_days: matched.filter((d) => d.daRtRevenue! < 0).length,
    da_cycles_per_year: round(matched.reduce((a, d) => a + d.daCycles!, 0) * scale, 1),
  };

  const run: Run = {
    meta: {
      location: p.location,
      year,
      market: 'RT15',
      power_mw: p.powerMw,
      duration_h: p.durationH,
      energy_mwh: energy,
      rte: p.rte,
      deg_cost_per_mwh: p.degCost,
      method: 'perfect-foresight energy arbitrage, solved one operating day at a time (in your browser, HiGHS WebAssembly)',
      price_series: 'ERCOT real-time 15-min settlement point price',
      efficiency_split: 'sqrt(rte) on charge and on discharge',
      soc_start_end_frac: SOC0_FRAC,
      degradation: 'cost per MWh discharged',
      excludes: ['ancillary services', 'forecast error', 'transmission/interconnection costs', 'capacity fade'],
      first_day: first,
      last_day: last,
      days_solved: days.length,
      skipped_days: skippedDays,
    },
    metrics,
    daily: {
      date: days.map((d) => d.date),
      revenue: days.map((d) => round(d.revenue, 2)),
      cycles: days.map((d) => round(d.cycles, 3)),
      da_rt_revenue: days.map((d) => (d.daRtRevenue === null ? null : round(d.daRtRevenue, 2))),
    },
  };
  return { params: p, days, skippedDays, daSkippedDays, run };
}
