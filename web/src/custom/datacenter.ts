// Data Center engine (v4 Step 2): the value of a battery co-located with a large load.
//
//   value = energy arbitrage (+ ancillary services from the Step 1 stack, when given)
//         + 4CP transmission charge avoided
//         + reliability cover during curtailment (user assumption)
//
// Pure: no UI imports. Inputs are a HiGHS instance, one EBP1 price file (results/prices), one
// 4CP file (results/v4/fourcp/<year>.json) and the site and battery settings. Rules and
// defaults come from config/datacenter_rules.json, each with a source.
//
// Dispatch follows the Studio engine (runner.ts): each US/Central operating day is solved on its
// own with the state of charge at soc0 (default 0) at the start and end of the day.
//   foresight: perfect foresight on real-time 15-min prices. On each 4CP day the LP also earns
//              rate x the cut held through the 4CP interval, so it knows the peak.
//   realistic: schedule on day-ahead hourly prices (the Studio "Day-ahead plan"), settle at
//              real-time prices. On alert days (daily ERCOT peak >= threshold x month-to-date peak)
//              the plan holds an even cut through the 4CP window. 4CP value counts only the cut the
//              executed schedule actually held at each official interval.
// Without export, discharge never exceeds the site load in any interval. A 4CP cut never counts
// more than the site load.
import type { Highs } from 'highs';
import rules from './config/datacenter_rules.json';
import { TOL, optimizeDay } from './dispatch';
import { centralHour, expectedIntervals, filledDay, missingCount, splitDays, type Day, type PriceFile } from './prices';
import { MAX_DA_GAP_HOURS, MAX_GAP_INTERVALS } from './runner';

export const DC_RULES = rules;

const RT_DT = 0.25;
const PER_HOUR = 4;
const HOUR_MS = 3_600_000;
const MIN15_MS = 900_000;
const MODEL_OPTIMAL = 7;
const SOLUTION_FEASIBLE = 2;

// --- data shapes ---------------------------------------------------------------------------------

export interface FourCpInterval {
  month: number;
  label: string;
  interval_ending_local: string;
  start_utc: string;
  end_utc: string;
  resolution_minutes: number;
  ercot_4cp_mw?: number;
  hourly_load_mw?: number;
}

export interface FourCpYear {
  year: number;
  status: 'official' | 'computed';
  complete: boolean;
  intervals: FourCpInterval[];
  daily_peaks: { date: string; peak_mw: number; hour_ending: number }[];
  sources: Record<string, string>;
  notes: string[];
}

/** One node's entry in a Step 1 stack file (results/v4/stack/<year>_<dur>h_<mode>.json), $/kW-yr. */
export interface AsStack {
  energy: number;
  regup: number;
  regdn: number;
  rrs: number;
  ecrs: number;
  nsrs: number;
  total?: number;
}

export type FourCpStrategy = 'foresight' | 'realistic';

export interface DataCenterInputs {
  highs: Highs;
  prices: PriceFile;
  fourCp: FourCpYear;
  node: string;
  year: number;
  /** Site load, MW. With a flat profile the load is siteLoadMw x loadFactor in every interval. */
  siteLoadMw: number;
  /** 0 to 1, default 1. Ignored when loadProfileMw is given. */
  loadFactor?: number;
  /** Optional hourly load (MW), 8760 or 8784 values from Jan 1 00:00 Central Standard Time (UTC-6). */
  loadProfileMw?: ArrayLike<number> | null;
  batteryMw: number;
  batteryMwh: number;
  /** Round-trip efficiency, (0, 1]. Default 0.85 (Studio default). */
  rte?: number;
  /** $/MWh discharged. Default 10 (Studio default). */
  degCost?: number;
  /** Start and end state of charge each day, share of energy. Default 0, as in the Studio engine. */
  soc0Frac?: number;
  exportAllowed: boolean;
  /** $/kW per 4CP interval. Default from the config. */
  fourCpRatePerKw?: number;
  fourCpStrategy: FourCpStrategy;
  /** Realistic strategy settings; defaults from the config. */
  alertThresholdPct?: number;
  windowStartHour?: number;
  windowEndHour?: number;
  curtailmentHoursPerYear?: number;
  curtailmentEvents?: number;
  /** $/MWh. */
  valueOfLostLoad?: number;
  asEnabled?: boolean;
  /** Step 1 stack for this node, year, duration and mode. Used only when asEnabled. */
  asStack?: AsStack | null;
  /** Optional inclusive local date range inside the year (default: the whole price file). */
  startDate?: string;
  endDate?: string;
  /** Optional hook that sees each solved day's 15-min schedule (used by tests and charts). */
  onDay?: (date: string, schedule: Schedule, loadMw: number[]) => void;
}

export interface FourCpDetail {
  month: number;
  intervalEndingLocal: string;
  /** Battery cut held through the whole counted interval, MW (0 when not covered). */
  cutMw: number;
  covered: boolean;
  alertDay: boolean;
  valueUsd: number;
}

export interface DispatchSample {
  date: string;
  /** Local start time of each 15-minute interval, HH:MM. */
  times: string[];
  loadMw: number[];
  chargeMw: number[];
  dischargeMw: number[];
  /** State of charge at the end of each interval, MWh. */
  socMwh: number[];
  priceUsdMwh: number[];
  /** Indices of the counted 4CP interval on this day, or null. */
  fourCp: [number, number] | null;
  /** Indices of the realistic 4CP window [start, end), or null. */
  window: [number, number] | null;
  alertDay: boolean;
}

export interface Breakdown {
  energy: number;
  as: number;
  fourCp: number;
  reliability: number;
}

export interface DataCenterResult {
  /** USD per kW of battery power per year. */
  perKwYr: number;
  /** USD per year (merchant revenue annualized for a partial year). */
  totalUsd: number;
  /** USD per year by source; sums to totalUsd. */
  breakdown: Breakdown;
  breakdownPerKwYr: Breakdown;
  /** The same battery as a standalone merchant at this node: no load cap, no 4CP. */
  standalone: { totalUsd: number; perKwYr: number; energy: number; as: number };
  fourCpDetail: FourCpDetail[];
  dispatchSample: DispatchSample | null;
  alertDays: number;
  reservedHours: number;
  daysCovered: number;
  daysSolved: number;
  skippedDays: string[];
  annualized: boolean;
  notes: string[];
}

// --- validation and load profile -----------------------------------------------------------------

export interface FormLimits {
  min: number;
  max: number;
}

export const DC_LIMITS = {
  siteLoadMw: { min: 1, max: 10000 },
  loadFactor: { min: 0.05, max: 1 },
  batteryMw: { min: 1, max: 2000 },
  batteryMwh: { min: 0.5, max: 16000 },
  rte: { min: 0.5, max: 1 },
  degCost: { min: 0, max: 200 },
  fourCpRatePerKw: { min: 0, max: 200 },
  curtailmentHoursPerYear: { min: 0, max: 8760 },
  curtailmentEvents: { min: 1, max: 365 },
  valueOfLostLoad: { min: 0, max: 1_000_000 },
  alertThresholdPct: { min: 50, max: 100 },
} as const satisfies Record<string, FormLimits>;

type Limited = keyof typeof DC_LIMITS;

/** Problems with the inputs, in plain words; empty when they can run. */
export function validateDataCenterInputs(x: Partial<DataCenterInputs>): string[] {
  const errors: string[] = [];
  const check = (key: Limited, label: string, required: boolean) => {
    const v = x[key];
    if (v === undefined || v === null) {
      if (required) errors.push(`${label} is required.`);
      return;
    }
    const lim = DC_LIMITS[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${label} must be a number.`);
    else if (v < lim.min || v > lim.max) errors.push(`${label} must be between ${lim.min} and ${lim.max}.`);
  };
  check('siteLoadMw', 'Site load (MW)', true);
  check('loadFactor', 'Load factor', false);
  check('batteryMw', 'Battery power (MW)', true);
  check('batteryMwh', 'Battery energy (MWh)', true);
  check('rte', 'Round-trip efficiency', false);
  check('degCost', 'Degradation cost', false);
  check('fourCpRatePerKw', '4CP rate', false);
  check('curtailmentHoursPerYear', 'Curtailment hours', false);
  check('curtailmentEvents', 'Curtailment events', false);
  check('valueOfLostLoad', 'Value of lost load', false);
  check('alertThresholdPct', 'Alert threshold', false);
  if (x.fourCpStrategy !== 'foresight' && x.fourCpStrategy !== 'realistic') errors.push('4CP strategy must be foresight or realistic.');
  if (typeof x.exportAllowed !== 'boolean') errors.push('Choose whether export to the grid is allowed.');
  if (x.windowStartHour !== undefined || x.windowEndHour !== undefined) {
    const s = x.windowStartHour ?? 0;
    const e = x.windowEndHour ?? 0;
    if (!(Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e <= 24 && s < e)) errors.push('The 4CP window must be whole hours with start before end.');
  }
  if (x.loadProfileMw) {
    const n = x.loadProfileMw.length;
    if (n !== 8760 && n !== 8784) errors.push(`The load profile must have 8760 or 8784 hourly values; it has ${n}.`);
    for (let i = 0; i < n; i++) {
      const v = x.loadProfileMw[i];
      if (!Number.isFinite(v) || v < 0) {
        errors.push(`Load profile hour ${i + 1} is not a number of MW at or above 0.`);
        break;
      }
    }
  }
  return errors;
}

/**
 * Hourly site load from a CSV: one value per row, the last numeric column of each row is used,
 * a header row is skipped. Returns the MW values; throws with a plain message on a bad file.
 */
export function parseLoadCsv(text: string): number[] {
  const out: number[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim()).filter((c) => c !== '');
    if (!cells.length) return;
    const last = cells[cells.length - 1].replace(/^"|"$/g, '');
    const v = Number(last);
    if (!Number.isFinite(v)) {
      if (out.length === 0 && i === 0) return; // header
      throw new Error(`Row ${i + 1} has no number in its last column.`);
    }
    if (v < 0) throw new Error(`Row ${i + 1} is negative.`);
    out.push(v);
  });
  if (out.length !== 8760 && out.length !== 8784) throw new Error(`Expected 8760 or 8784 hourly values, found ${out.length}.`);
  return out;
}

/** Site load (MW) at a UTC instant. */
export function makeLoad(x: Pick<DataCenterInputs, 'siteLoadMw' | 'loadFactor' | 'loadProfileMw' | 'year'>): (ms: number) => number {
  const profile = x.loadProfileMw;
  if (profile && profile.length) {
    const t0 = Date.UTC(x.year, 0, 1, 6); // Jan 1 00:00 Central Standard Time
    return (ms) => {
      const h = Math.floor((ms - t0) / HOUR_MS);
      return Number(profile[Math.min(profile.length - 1, Math.max(0, h))]);
    };
  }
  const flat = x.siteLoadMw * (x.loadFactor ?? 1);
  return () => flat;
}

// --- day LP -------------------------------------------------------------------------------------

export interface DaySpec {
  prices: ArrayLike<number>;
  dt: number;
  P: number;
  E: number;
  eta: number;
  degCost: number;
  soc0: number;
  /** Discharge upper bound per interval (MW). */
  dMax: ArrayLike<number>;
  /** Groups whose common cut r (<= d - c in each interval, <= rMax) earns `reward` $ per MW. */
  groups?: { idx: number[]; rMax: number; reward: number }[];
  /** Required net discharge per interval (MW), or 0. */
  req?: ArrayLike<number> | null;
}

interface DaySolution {
  charge: Float64Array;
  discharge: Float64Array;
  soc: Float64Array;
  cuts: number[];
}

/**
 * Solve a day's LP, optionally first without the site and 4CP constraints ("free": discharge up
 * to P, no 4CP reward, no required cut) and then with them, reusing the model so the second solve
 * starts from the first one's basis. Returns [free?, site]. A solution that charges and discharges
 * in the same interval (only worth it at prices at or below zero) is re-solved as a MILP with a
 * charge-or-discharge binary on those intervals, as dispatch.ts does.
 */
function solveSpec(highs: Highs, s: DaySpec, exclusive: boolean, withFree: boolean): DaySolution[] {
  const n = s.prices.length;
  const groups = s.groups ?? [];
  const bins: number[] = [];
  if (exclusive) for (let t = 0; t < n; t++) if (s.prices[t] <= 0) bins.push(t);
  // Columns: c_t, d_t (t < n), soc_t (t <= n), r_k, m_j.
  const ci = (t: number) => t;
  const di = (t: number) => n + t;
  const si = (t: number) => 2 * n + t;
  const ri = (k: number) => 3 * n + 1 + k;
  const mi = (j: number) => 3 * n + 1 + groups.length + j;
  const numCols = 3 * n + 1 + groups.length + bins.length;
  const colCost = new Float64Array(numCols);
  const colLower = new Float64Array(numCols);
  const colUpper = new Float64Array(numCols);
  const integrality = new Int32Array(numCols);
  const siteDUpper = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const p = Number(s.prices[t]);
    colCost[ci(t)] = p * s.dt; // minimize the negated objective
    colCost[di(t)] = -(p * s.dt - s.degCost * s.dt);
    colUpper[ci(t)] = s.P;
    siteDUpper[t] = Math.max(0, Math.min(s.P, s.dMax[t]));
    colUpper[di(t)] = withFree ? s.P : siteDUpper[t];
  }
  for (let t = 0; t <= n; t++) colUpper[si(t)] = s.E;
  groups.forEach((g, k) => {
    colCost[ri(k)] = -g.reward;
    colUpper[ri(k)] = withFree ? 0 : Math.max(0, g.rMax);
  });
  bins.forEach((_, j) => {
    colUpper[mi(j)] = 1;
    integrality[mi(j)] = highs.constants.variableType.integer;
  });

  const starts = [0];
  const indices: number[] = [];
  const values: number[] = [];
  const rowLower: number[] = [];
  const rowUpper: number[] = [];
  const reqRows: [number, number][] = [];
  const row = (entries: [number, number][], lo: number, hi: number) => {
    for (const [j, v] of entries) {
      indices.push(j);
      values.push(v);
    }
    starts.push(indices.length);
    rowLower.push(lo);
    rowUpper.push(hi);
    return rowLower.length - 1;
  };
  const inf = highs.infinity;
  row([[si(0), 1]], s.soc0, s.soc0);
  row([[si(n), 1]], s.soc0, s.soc0);
  for (let t = 0; t < n; t++) {
    row([[si(t), -1], [si(t + 1), 1], [ci(t), -(s.eta * s.dt)], [di(t), s.dt / s.eta]], 0, 0);
    row([[ci(t), 1], [di(t), 1]], -inf, s.P);
    const need = s.req ? Number(s.req[t]) : 0;
    if (need > 0) reqRows.push([row([[ci(t), -1], [di(t), 1]], withFree ? -inf : need, inf), need]);
  }
  groups.forEach((g, k) => {
    for (const t of g.idx) row([[ci(t), -1], [di(t), 1], [ri(k), -1]], 0, inf);
  });
  bins.forEach((t, j) => {
    row([[ci(t), 1], [mi(j), -s.P]], -inf, 0);
    row([[di(t), 1], [mi(j), s.P]], -inf, s.P);
  });

  const model = highs.createModel({
    numCols,
    numRows: rowLower.length,
    sense: highs.constants.objectiveSense.minimize,
    colCost,
    colLower,
    colUpper,
    rowLower,
    rowUpper,
    matrix: { format: 'csr', numRows: rowLower.length, numCols, starts, indices, values },
    ...(bins.length ? { integrality } : {}),
  });
  const extract = (): DaySolution => {
    const { modelStatus } = model.run();
    const ok =
      modelStatus === MODEL_OPTIMAL ||
      (exclusive && Number(model.info.get('primal_solution_status')) === SOLUTION_FEASIBLE);
    if (!ok) throw new Error(`Data center dispatch solve failed: model status ${modelStatus}`);
    const x = model.getSolution().colValue;
    const charge = new Float64Array(n);
    const discharge = new Float64Array(n);
    const soc = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      charge[t] = x[ci(t)] < TOL ? 0 : x[ci(t)];
      discharge[t] = x[di(t)] < TOL ? 0 : x[di(t)];
      soc[t] = x[si(t + 1)];
    }
    return { charge, discharge, soc, cuts: groups.map((_, k) => x[ri(k)]) };
  };
  try {
    model.options.set({ output_flag: false });
    if (exclusive) model.options.set({ mip_rel_gap: 1e-4, time_limit: 10 });
    const out: DaySolution[] = [];
    if (withFree) {
      out.push(extract());
      for (let t = 0; t < n; t++) model.changeColBounds(di(t), 0, siteDUpper[t]);
      groups.forEach((g, k) => model.changeColBounds(ri(k), 0, Math.max(0, g.rMax)));
      for (const [r, need] of reqRows) model.changeRowBounds(r, need, inf);
    }
    out.push(extract());
    return out;
  } finally {
    model.dispose();
  }
}

const simultaneous = (r: DaySolution) => r.charge.some((c, t) => c > TOL && r.discharge[t] > TOL);

/** The day's schedule with the site and 4CP constraints. */
export function solveDaySpec(highs: Highs, s: DaySpec): DaySolution {
  const [r] = solveSpec(highs, s, false, false);
  return simultaneous(r) ? solveSpec(highs, s, true, false)[0] : r;
}

/** The day's schedule without ([0]) and with ([1]) the site and 4CP constraints. */
export function solveDayPair(highs: Highs, s: DaySpec): [DaySolution, DaySolution] {
  let [free, site] = solveSpec(highs, s, false, true);
  if (simultaneous(free)) free = solveSpec(highs, { ...s, dMax: new Float64Array(s.prices.length).fill(s.P), groups: [], req: null }, true, false)[0];
  if (simultaneous(site)) site = solveSpec(highs, s, true, false)[0];
  return [free, site];
}

// --- helpers ------------------------------------------------------------------------------------

export interface Schedule {
  charge: ArrayLike<number>;
  discharge: ArrayLike<number>;
  soc: ArrayLike<number>;
}

const toSolution = (r: { charge: Float64Array; discharge: Float64Array; soc: Float64Array }): DaySolution => ({
  charge: r.charge,
  discharge: r.discharge,
  soc: r.soc,
  cuts: [],
});

/** RT revenue minus degradation of a 15-min schedule. */
function settle(prices: ArrayLike<number>, sch: Schedule, degCost: number) {
  let gross = 0;
  let discharged = 0;
  for (let t = 0; t < prices.length; t++) {
    const net = sch.discharge[t] - sch.charge[t];
    gross += prices[t] * net;
    discharged += sch.discharge[t];
  }
  return (gross - degCost * discharged) * RT_DT;
}

/** An hourly plan held for each of the hour's four 15-min intervals. */
function expandHourly(h: DaySolution, E: number, eta: number, soc0: number): Schedule {
  const n = h.charge.length * PER_HOUR;
  const charge = new Float64Array(n);
  const discharge = new Float64Array(n);
  const soc = new Float64Array(n);
  let s = soc0;
  for (let t = 0; t < n; t++) {
    const k = Math.floor(t / PER_HOUR);
    charge[t] = h.charge[k];
    discharge[t] = h.discharge[k];
    s = Math.min(E, Math.max(0, s + charge[t] * eta * RT_DT - (discharge[t] / eta) * RT_DT));
    soc[t] = s;
  }
  return { charge, discharge, soc };
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function hhmm(ms: number) {
  const h = centralHour(ms);
  const minutes = new Date(ms).getUTCMinutes();
  return `${String(h.hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function dayCount(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
}

/** Alert days for the realistic strategy: daily peak >= threshold x the month's highest earlier peak. */
export function alertDays(peaks: FourCpYear['daily_peaks'], thresholdPct: number): Set<string> {
  const out = new Set<string>();
  const best = new Map<string, number>();
  for (const p of [...peaks].sort((a, b) => a.date.localeCompare(b.date))) {
    const month = p.date.slice(0, 7);
    const prior = best.get(month);
    if (prior === undefined || p.peak_mw >= (thresholdPct / 100) * prior) out.add(p.date);
    best.set(month, Math.max(prior ?? -Infinity, p.peak_mw));
  }
  return out;
}

/** The UTC span the engine counts for a 4CP interval (see config fourCp.interval). */
export function countedSpan(iv: FourCpInterval): [number, number] {
  const start = Date.parse(iv.start_utc);
  const end = Date.parse(iv.end_utc);
  if (iv.resolution_minutes === 15 && rules.fourCp.interval.coverBothConventions) return [end - MIN15_MS, end + MIN15_MS];
  return [start, end];
}

// --- engine -------------------------------------------------------------------------------------

/** Value of a battery at a large-load site for one node-year. */
export function runDataCenterCase(inputs: DataCenterInputs): DataCenterResult {
  const errors = validateDataCenterInputs(inputs);
  if (errors.length) throw new Error(errors.join(' '));
  const { highs, prices: file, fourCp } = inputs;
  if (file.header.year !== inputs.year) throw new Error(`price file is for ${file.header.year}, not ${inputs.year}`);
  if (fourCp.year !== inputs.year) throw new Error(`4CP file is for ${fourCp.year}, not ${inputs.year}`);

  const P = inputs.batteryMw;
  const E = inputs.batteryMwh;
  const rte = inputs.rte ?? 0.85;
  const eta = Math.sqrt(rte);
  const degCost = inputs.degCost ?? 10;
  const soc0 = (inputs.soc0Frac ?? 0) * E;
  const kw = P * 1000;
  const rate = inputs.fourCpRatePerKw ?? rules.fourCp.defaultRatePerKwPer4cp.value;
  const realistic = inputs.fourCpStrategy === 'realistic';
  const threshold = inputs.alertThresholdPct ?? rules.fourCp.realisticStrategy.thresholdPct;
  const wStart = inputs.windowStartHour ?? Number(rules.fourCp.realisticStrategy.windowStartLocal.slice(0, 2));
  const wEnd = inputs.windowEndHour ?? Number(rules.fourCp.realisticStrategy.windowEndLocal.slice(0, 2));
  const load = makeLoad(inputs);
  const notes: string[] = [];

  const alerts = realistic ? alertDays(fourCp.daily_peaks, threshold) : new Set<string>();
  // 4CP intervals by local date, with the RT index span filled in per day.
  const cpByDate = new Map<string, { iv: FourCpInterval; span: [number, number] }>();
  for (const iv of fourCp.intervals) {
    const span = countedSpan(iv);
    cpByDate.set(centralHour(span[0]).date, { iv, span });
  }

  const daDays = new Map(splitDays(file.da).map((d) => [d.date, d]));
  const start = inputs.startDate ?? `${inputs.year}-01-01`;
  const end = inputs.endDate ?? `${inputs.year}-12-31`;
  const rtDays = splitDays(file.rt).filter((d) => d.date >= start && d.date <= end);

  let constrained = 0; // energy revenue with the site and 4CP constraints, USD
  let unconstrained = 0; // standalone energy revenue, USD
  let minLoad = Infinity;
  let alertCount = 0;
  let reservedHours = 0;
  let daUnmatched = 0;
  const skippedDays: string[] = [];
  const detail = new Map<number, FourCpDetail>();
  const samples = new Map<string, DispatchSample>();
  let solved = 0;
  let lastDay = '';

  const makeSample = (date: string, ms: number[], rt: Float64Array, loadMw: number[], sch: Schedule, cp: [number, number] | null, win: [number, number] | null, alert: boolean): DispatchSample => ({
    date,
    times: ms.map(hhmm),
    loadMw: loadMw.map((v) => round(v, 3)),
    chargeMw: Array.from(sch.charge, (v) => round(v, 3)),
    dischargeMw: Array.from(sch.discharge, (v) => round(v, 3)),
    socMwh: Array.from(sch.soc, (v) => round(v, 3)),
    priceUsdMwh: Array.from(rt, (v) => round(v, 2)),
    fourCp: cp,
    window: win,
    alertDay: alert,
  });

  for (const rtDay of rtDays) {
    const date = rtDay.date;
    const missing = expectedIntervals(date, file.rt.stepMs) - (rtDay.count - missingCount(file.rt, rtDay));
    const rt = missing > MAX_GAP_INTERVALS ? null : filledDay(file.rt, rtDay);
    if (!rt) {
      skippedDays.push(date);
      continue;
    }
    solved++;
    lastDay = date;
    const n = rt.length;
    const ms = Array.from({ length: n }, (_, t) => file.rt.startMs + (rtDay.start + t) * file.rt.stepMs);
    const loadMw = ms.map(load);
    for (const v of loadMw) minLoad = Math.min(minLoad, v);
    const dMax = loadMw.map((v) => (inputs.exportAllowed ? P : Math.min(P, v)));
    const capBinds = dMax.some((v) => v < P - 1e-9);
    const cp = cpByDate.get(date);
    let cpIdx: number[] = [];
    let cpRange: [number, number] | null = null;
    if (cp) {
      cpIdx = ms.flatMap((m, t) => (m >= cp.span[0] && m < cp.span[1] ? [t] : []));
      if (cpIdx.length) cpRange = [cpIdx[0], cpIdx[cpIdx.length - 1] + 1];
    }
    const cpRMax = cpIdx.length ? Math.min(P, ...cpIdx.map((t) => loadMw[t])) : 0;
    const alert = realistic && rate > 0 && alerts.has(date); // no 4CP rate, nothing to hold for
    const winIdx = alert ? ms.flatMap((m, t) => {
      const h = centralHour(m).hour;
      return h >= wStart && h < wEnd ? [t] : [];
    }) : [];
    const win: [number, number] | null = winIdx.length ? [winIdx[0], winIdx[winIdx.length - 1] + 1] : null;

    let sch: Schedule;
    if (!realistic) {
      const groups = cpIdx.length && rate > 0 ? [{ idx: cpIdx, rMax: cpRMax, reward: rate * 1000 }] : [];
      if (!capBinds && !groups.length) {
        sch = optimizeDay(highs, rt, RT_DT, P, E, rte, degCost, soc0 / E);
        unconstrained += settle(rt, sch, degCost);
      } else {
        const [free, site] = solveDayPair(highs, { prices: rt, dt: RT_DT, P, E, eta, degCost, soc0, dMax, groups });
        unconstrained += settle(rt, free, degCost);
        sch = site;
      }
      if (cpIdx.length) reservedHours += cpIdx.length * RT_DT;
    } else {
      // Day-ahead plan, settled at RT (runner.ts rules for lining DA up with RT).
      const daDay: Day | undefined = daDays.get(date);
      const daPrices = daDay && missingCount(file.da, daDay) <= MAX_DA_GAP_HOURS ? filledDay(file.da, daDay) : null;
      const aligned =
        !!daDay && !!daPrices && rtDay.count === PER_HOUR * daDay.count &&
        file.rt.startMs + rtDay.start * file.rt.stepMs === file.da.startMs + daDay.start * file.da.stepMs;
      if (!aligned) {
        daUnmatched++;
        sch = { charge: new Float64Array(n), discharge: new Float64Array(n), soc: new Float64Array(n).fill(soc0) };
      } else {
        const hours = daPrices!.length;
        const hourLoad = Array.from({ length: hours }, (_, h) => Math.min(...loadMw.slice(h * PER_HOUR, h * PER_HOUR + PER_HOUR)));
        const hdMax = hourLoad.map((v) => (inputs.exportAllowed ? P : Math.min(P, v)));
        const winHours = Array.from(new Set(winIdx.map((t) => Math.floor(t / PER_HOUR))));
        let req: Float64Array | null = null;
        if (alert && winHours.length) {
          alertCount++;
          reservedHours += winHours.length;
          const usable = E * eta; // energy a full battery delivers
          const cut = Math.max(0, Math.min(P, ...winHours.map((h) => hourLoad[h]), usable / winHours.length) * (1 - 1e-6));
          req = new Float64Array(hours);
          for (const h of winHours) req[h] = cut;
        }
        let hourly: DaySolution;
        if (!req && hdMax.every((v) => v >= P - 1e-9)) {
          hourly = toSolution(optimizeDay(highs, daPrices!, 1, P, E, rte, degCost, soc0 / E));
          unconstrained += settle(rt, expandHourly(hourly, E, eta, soc0), degCost);
        } else {
          const [free, site] = solveDayPair(highs, { prices: daPrices!, dt: 1, P, E, eta, degCost, soc0, dMax: hdMax, req });
          unconstrained += settle(rt, expandHourly(free, E, eta, soc0), degCost);
          hourly = site;
        }
        sch = expandHourly(hourly, E, eta, soc0);
      }
    }
    constrained += settle(rt, sch, degCost);
    inputs.onDay?.(date, sch, loadMw);

    if (cp) {
      const cut = cpIdx.length ? Math.max(0, Math.min(...cpIdx.map((t) => Math.min(loadMw[t], sch.discharge[t] - sch.charge[t])))) : 0;
      const covered = cut > 1e-6;
      detail.set(cp.iv.month, {
        month: cp.iv.month,
        intervalEndingLocal: cp.iv.interval_ending_local,
        cutMw: round(covered ? cut : 0, 4),
        covered,
        alertDay: realistic ? alert : true,
        valueUsd: covered ? cut * 1000 * rate : 0,
      });
      samples.set(date, makeSample(date, ms, rt, loadMw, sch, cpRange, win, realistic ? alert : true));
    } else if (alert && !samples.has('firstAlert')) {
      samples.set('firstAlert', makeSample(date, ms, rt, loadMw, sch, null, win, true));
    }
  }
  if (!solved) throw new Error('no complete days in the selected range');
  if (daUnmatched) notes.push(`${daUnmatched} day(s) had day-ahead prices that did not line up with real-time prices; the realistic plan stays idle on them.`);

  // Annualize merchant revenue as model/metrics.py does: a full calendar year is not scaled.
  const covered = dayCount(start, lastDay);
  const fullYear = start === `${inputs.year}-01-01` && end === `${inputs.year}-12-31` && covered === dayCount(start, end);
  const scale = fullYear ? 1 : 365 / covered;
  if (!fullYear) notes.push(`Partial year: ${covered} days, energy and ancillary revenue annualized (x ${round(scale, 4)}).`);

  const fourCpDetail = fourCp.intervals.map(
    (iv) =>
      detail.get(iv.month) ?? {
        month: iv.month,
        intervalEndingLocal: iv.interval_ending_local,
        cutMw: 0,
        covered: false,
        alertDay: false,
        valueUsd: 0,
      },
  );
  const fourCpUsd = fourCpDetail.reduce((a, d) => a + d.valueUsd, 0);
  if (!fourCp.complete) notes.push('The 4CP file does not have all four months; only the months present are valued.');
  if (fourCp.status === 'computed') notes.push(`${fourCp.year} 4CP intervals are computed from hourly load (ERCOT has not published them yet).`);

  // Ancillary services from the Step 1 stack.
  let asUsd = 0;
  let energyUsd = constrained * scale;
  let standaloneAs = 0;
  if (inputs.asEnabled) {
    const st = inputs.asStack;
    if (!st) notes.push('Ancillary services are on, but no stack results exist for these settings; energy only.');
    else {
      const asPerKw = st.regup + st.regdn + st.rrs + st.ecrs + st.nsrs;
      const hoursInPeriod = covered * 24;
      const reservedShare = Math.min(1, reservedHours / hoursInPeriod);
      const exportScale = inputs.exportAllowed ? 1 : Math.min(1, minLoad / P);
      asUsd = asPerKw * kw * (1 - reservedShare) * exportScale;
      standaloneAs = asPerKw * kw;
      // Use the co-optimized energy from the stack, less what the site constraints cost the energy-only dispatch.
      const constraintCost = (unconstrained - constrained) * scale;
      energyUsd = st.energy * kw - constraintCost;
      notes.push(
        `Ancillary services from the precomputed stack, reduced by the ${round(reservedShare * 100, 2)}% of hours held for 4CP` +
          (inputs.exportAllowed ? '.' : ` and scaled by ${round(exportScale, 3)} for no export.`),
      );
    }
  }

  // Reliability: battery covers curtailment hours, starting each event full.
  const hours = inputs.curtailmentHoursPerYear ?? rules.defaults.curtailmentHoursPerYear.value;
  const events = inputs.curtailmentEvents ?? rules.defaults.curtailmentEvents.value;
  const voll = inputs.valueOfLostLoad ?? rules.defaults.valueOfLostLoad.value;
  const coverMw = Math.min(P, Number.isFinite(minLoad) ? minLoad : 0);
  const coverHoursPerEvent = coverMw > 0 ? (E * eta) / coverMw : 0;
  const coveredHours = events * Math.min(hours / events, coverHoursPerEvent);
  const reliabilityUsd = hours > 0 ? coveredHours * coverMw * voll : 0;
  if (hours > 0) notes.push('Reliability value is a user assumption: curtailment hours and value of lost load are inputs, not market data.');

  const breakdown: Breakdown = { energy: energyUsd, as: asUsd, fourCp: fourCpUsd, reliability: reliabilityUsd };
  const totalUsd = breakdown.energy + breakdown.as + breakdown.fourCp + breakdown.reliability;
  const per = (v: number) => v / kw;
  const standaloneEnergy = inputs.asEnabled && inputs.asStack ? inputs.asStack.energy * kw : unconstrained * scale;
  const standaloneTotal = standaloneEnergy + standaloneAs;

  const sample =
    [...fourCpDetail].sort((a, b) => b.valueUsd - a.valueUsd).map((d) => samples.get(d.intervalEndingLocal.slice(0, 10))).find(Boolean) ??
    samples.get('firstAlert') ??
    null;

  return {
    perKwYr: per(totalUsd),
    totalUsd,
    breakdown,
    breakdownPerKwYr: {
      energy: per(breakdown.energy),
      as: per(breakdown.as),
      fourCp: per(breakdown.fourCp),
      reliability: per(breakdown.reliability),
    },
    standalone: { totalUsd: standaloneTotal, perKwYr: per(standaloneTotal), energy: standaloneEnergy, as: standaloneAs },
    fourCpDetail,
    dispatchSample: sample,
    alertDays: alertCount,
    reservedHours,
    daysCovered: covered,
    daysSolved: solved,
    skippedDays,
    annualized: !fullYear,
    notes,
  };
}
