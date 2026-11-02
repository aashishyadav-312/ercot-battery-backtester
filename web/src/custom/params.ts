// Studio inputs <-> URL query (#/studio?loc=HB_WEST&mw=100&dur=1.5&rte=88&deg=5&soc=0&from=2025-06-01&to=2025-08-31&strat=da).
// Values outside the allowed ranges are clamped; anything unreadable falls back to the default,
// so a hand-edited or old link always opens a valid run.
import type { CustomParams } from './runner';

export type Strategy = 'pf' | 'da';

export interface CustomForm {
  location: string;
  powerMw: number;
  durationH: number;
  /** Percent, as typed. */
  rtePct: number;
  degCost: number;
  /** Start (and end) state of charge of each day, percent of energy, as typed. */
  socPct: number;
  startDate: string;
  endDate: string;
  strategy: Strategy;
}

export const LIMITS = {
  powerMw: { min: 1, max: 2000 },
  durationH: { min: 0.5, max: 8 },
  rtePct: { min: 50, max: 100 },
  degCost: { min: 0, max: 200 },
  socPct: { min: 0, max: 100 },
} as const;

export const FORM_DEFAULTS: CustomForm = {
  location: 'HB_HOUSTON',
  powerMw: 100,
  durationH: 2,
  rtePct: 85,
  degCost: 10,
  socPct: 0,
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  strategy: 'pf',
};

/** First and last day with prices for each location-year (results/prices/index.json). */
export interface Coverage {
  location: string;
  year: number;
  first: string;
  last: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function numberParam(q: URLSearchParams, key: string, fallback: number, lim: { min: number; max: number }) {
  const raw = q.get(key);
  const v = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(v) ? clamp(v, lim.min, lim.max) : fallback;
}

/**
 * Keep a date range valid for one location: both ends inside one year with prices,
 * start <= end. A range that spans years is cut to the start year.
 */
export function fitRange(location: string, start: string, end: string, coverage: Coverage[]): { startDate: string; endDate: string } {
  const years = coverage.filter((c) => c.location === location).sort((a, b) => a.year - b.year);
  if (!years.length) return { startDate: start, endDate: end };
  const want = Number(start.slice(0, 4));
  const y = years.find((c) => c.year === want) ?? years.find((c) => c.year === Number(FORM_DEFAULTS.startDate.slice(0, 4))) ?? years[years.length - 1];
  const inYear = (d: string, fallback: string) => (DATE.test(d) && d.startsWith(String(y.year)) ? d : fallback);
  let s = inYear(start, y.first);
  let e = inYear(end, y.last);
  s = s < y.first ? y.first : s > y.last ? y.last : s;
  e = e > y.last ? y.last : e < y.first ? y.first : e;
  if (e < s) e = s;
  return { startDate: s, endDate: e };
}

export function parseForm(query: string, coverage: Coverage[]): CustomForm {
  const q = new URLSearchParams(query);
  const locations = new Set(coverage.map((c) => c.location));
  const loc = q.get('loc');
  const location = loc && (locations.size === 0 || locations.has(loc)) ? loc : FORM_DEFAULTS.location;
  // A link from the top-bar pages carries only `year`: open that full year.
  const year = Number(q.get('year'));
  const from = q.get('from') ?? (year ? `${year}-01-01` : FORM_DEFAULTS.startDate);
  const to = q.get('to') ?? (year ? `${year}-12-31` : FORM_DEFAULTS.endDate);
  return {
    location,
    powerMw: numberParam(q, 'mw', FORM_DEFAULTS.powerMw, LIMITS.powerMw),
    durationH: numberParam(q, 'dur', FORM_DEFAULTS.durationH, LIMITS.durationH),
    rtePct: numberParam(q, 'rte', FORM_DEFAULTS.rtePct, LIMITS.rtePct),
    degCost: numberParam(q, 'deg', FORM_DEFAULTS.degCost, LIMITS.degCost),
    socPct: numberParam(q, 'soc', FORM_DEFAULTS.socPct, LIMITS.socPct),
    ...fitRange(location, from, to, coverage),
    strategy: q.get('strat') === 'da' ? 'da' : 'pf',
  };
}

/** Query string for a form. `year` is written too, so the top-bar pages pick up the same year. */
export function formQuery(f: CustomForm): string {
  return new URLSearchParams({
    loc: f.location,
    mw: String(f.powerMw),
    dur: String(f.durationH),
    rte: String(f.rtePct),
    deg: String(f.degCost),
    soc: String(f.socPct),
    year: f.startDate.slice(0, 4),
    from: f.startDate,
    to: f.endDate,
    strat: f.strategy,
  }).toString();
}

export function toParams(f: CustomForm): CustomParams {
  return {
    location: f.location,
    startDate: f.startDate,
    endDate: f.endDate,
    powerMw: f.powerMw,
    durationH: f.durationH,
    rte: f.rtePct / 100,
    degCost: f.degCost,
    soc0Frac: f.socPct / 100,
  };
}

/** Battery settings the precomputed results were run with: 85% round trip, empty at the start and end of each day. */
export const PRECOMPUTED = { rtePct: 85, socPct: 0, durations: [1, 2, 4], degs: [0, 10] } as const;

/**
 * The precomputed result these inputs ask for, if the battery settings are ones that were precomputed. Power is not
 * checked: revenue per kW does not depend on it (every constraint scales with power), so power only scales dollar
 * totals. Dates are not checked either; the caller compares them with the run's own first and last day.
 */
export function precomputedKey(f: CustomForm) {
  const P = PRECOMPUTED;
  if (f.rtePct !== P.rtePct || f.socPct !== P.socPct) return null;
  if (!(P.durations as readonly number[]).includes(f.durationH) || !(P.degs as readonly number[]).includes(f.degCost)) return null;
  return { location: f.location, year: Number(f.startDate.slice(0, 4)), duration: f.durationH, deg: f.degCost };
}
