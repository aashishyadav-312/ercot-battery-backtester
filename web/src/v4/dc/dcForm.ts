// Data Center mode (v4 Step 7): the form, its link, the stack match, the 4CP window check and the export rows. Pure: no React,
// no fetches, so every rule here has a test. The engine itself is web/src/custom/datacenter.ts (Step 2).
import rules from '../../custom/config/datacenter_rules.json';
import {
  DC_LIMITS, countedSpan, validateDataCenterInputs,
  type AsStack, type Breakdown, type DataCenterInputs, type DataCenterResult, type FourCpInterval, type FourCpYear,
} from '../../custom/datacenter';
import { centralHour } from '../../custom/prices';
import type { StackRow, StackMode } from '../stack';
import type { StackKey } from '../site/stackIndex';
import { FOURCP_YEARS, STACK_BATTERY } from '../config';

export type DcStrategy = 'foresight' | 'realistic';

/** Where the site is, when Data Center mode was opened from the Site Value card. */
export interface DcSite {
  label: string;
  lat: number;
  lon: number;
  /** Nearest node to the pin (it may have no price file) and its distance, km. */
  node: string | null;
  km: number | null;
}

export interface DcForm {
  /** Location whose price file the engine runs on. */
  loc: string;
  year: number;
  siteLoadMw: number;
  loadFactor: number;
  exportAllowed: boolean;
  batteryMw: number;
  batteryMwh: number;
  rte: number;
  fourCpRatePerKw: number;
  fourCpStrategy: DcStrategy;
  windowStartHour: number;
  windowEndHour: number;
  curtailmentHoursPerYear: number;
  valueOfLostLoad: number;
  asEnabled: boolean;
  site: DcSite | null;
}

/** Price coverage of one location-year (Studio's Coverage). */
export interface DcCoverage { location: string; year: number; first: string; last: string }

const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2));
const strategyRule = rules.fourCp.realisticStrategy;

/**
 * Defaults. Site and battery sizes are starting values for the form, not market data. Every market default comes from
 * custom/config/datacenter_rules.json with its source; the battery's efficiency and degradation match the Step 1 stack files, so
 * ancillary services can be used as soon as the form opens.
 */
export const DC_DEFAULTS = {
  siteLoadMw: 100,
  loadFactor: 1,
  exportAllowed: false,
  batteryMw: 50,
  batteryMwh: 100,
  rte: STACK_BATTERY.rte,
  fourCpRatePerKw: rules.fourCp.defaultRatePerKwPer4cp.value,
  fourCpStrategy: 'realistic' as DcStrategy,
  windowStartHour: hourOf(strategyRule.windowStartLocal),
  windowEndHour: hourOf(strategyRule.windowEndLocal),
  curtailmentHoursPerYear: rules.defaults.curtailmentHoursPerYear.value,
  valueOfLostLoad: rules.defaults.valueOfLostLoad.value,
  asEnabled: true,
};

/** Degradation cost the engine runs with ($/MWh discharged): the same as the stack files and the Studio default. */
export const DC_DEG_COST = STACK_BATTERY.degCost;

/** Step sizes for the number inputs. */
export const DC_STEP = {
  siteLoadMw: 5, loadFactor: 0.05, batteryMw: 5, batteryMwh: 10, rte: 0.01, fourCpRatePerKw: 0.5,
  curtailmentHoursPerYear: 1, valueOfLostLoad: 1000,
} as const;

/** Round-trip efficiency shown as a share; the engine's limits. */
export const DC_RTE_LIMITS = DC_LIMITS.rte;

// ---------------------------------------------------------------- years and locations

/** Years Data Center mode can run for a location: a 4CP file and a price file, oldest first. */
export function dcYears(coverage: DcCoverage[], loc: string): DcCoverage[] {
  return coverage.filter((c) => c.location === loc && (FOURCP_YEARS as readonly number[]).includes(c.year)).sort((a, b) => a.year - b.year);
}

/** True when the price file does not cover the whole calendar year. */
export const isPartial = (c: DcCoverage): boolean => c.first > `${c.year}-01-01` || c.last < `${c.year}-12-31`;

/** "2026 YTD, annualized" for a partial year, the plain year otherwise. */
export const yearLabel = (c: DcCoverage | undefined, year: number): string => (c && isPartial(c) ? `${year} YTD, annualized` : String(year));

/** Locations with at least one year Data Center mode can run, hubs first. */
export function dcLocations(coverage: DcCoverage[]): string[] {
  const locs = [...new Set(coverage.filter((c) => (FOURCP_YEARS as readonly number[]).includes(c.year)).map((c) => c.location))];
  return [...locs.filter((l) => l.startsWith('HB_')), ...locs.filter((l) => !l.startsWith('HB_'))];
}

/** The latest full year for a location, else its latest year, else null. */
export function defaultYear(coverage: DcCoverage[], loc: string): number | null {
  const ys = dcYears(coverage, loc);
  return ([...ys].reverse().find((c) => !isPartial(c)) ?? ys[ys.length - 1])?.year ?? null;
}

// ---------------------------------------------------------------- link

/** True for a Studio link that opens Data Center mode. */
export function isDcHash(hash: string): boolean {
  if (!/^#\/studio(\?|$)/.test(hash)) return false;
  return new URLSearchParams(hash.split('?')[1] ?? '').get('mode') === 'dc';
}

const numParam = (q: URLSearchParams, k: string, fallback: number): number => {
  const raw = q.get(k);
  if (raw == null || raw.trim() === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
};
const boolParam = (q: URLSearchParams, k: string, fallback: boolean): boolean => {
  const raw = q.get(k);
  return raw === '1' ? true : raw === '0' ? false : fallback;
};

/** The form from a Studio query (`mode=dc&loc=...`). Unknown or missing values fall back to the defaults. */
export function parseDcQuery(query: string, coverage: DcCoverage[]): DcForm {
  const q = new URLSearchParams(query);
  const locs = dcLocations(coverage);
  const wantLoc = q.get('loc') ?? '';
  const loc = locs.includes(wantLoc) ? wantLoc : locs.includes('HB_HOUSTON') ? 'HB_HOUSTON' : locs[0] ?? wantLoc;
  const wantYear = numParam(q, 'year', NaN);
  const year = dcYears(coverage, loc).some((c) => c.year === wantYear) ? wantYear : defaultYear(coverage, loc) ?? wantYear;
  const strat = q.get('strat');
  const lat = numParam(q, 'lat', NaN);
  const lon = numParam(q, 'lon', NaN);
  const km = numParam(q, 'km', NaN);
  const site: DcSite | null = Number.isFinite(lat) && Number.isFinite(lon)
    ? { label: q.get('site') || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon, node: q.get('node') || null, km: Number.isFinite(km) ? km : null }
    : null;
  return {
    loc,
    year,
    siteLoadMw: numParam(q, 'load', DC_DEFAULTS.siteLoadMw),
    loadFactor: numParam(q, 'lf', DC_DEFAULTS.loadFactor),
    exportAllowed: boolParam(q, 'exp', DC_DEFAULTS.exportAllowed),
    batteryMw: numParam(q, 'mw', DC_DEFAULTS.batteryMw),
    batteryMwh: numParam(q, 'mwh', DC_DEFAULTS.batteryMwh),
    rte: numParam(q, 'rte', DC_DEFAULTS.rte),
    fourCpRatePerKw: numParam(q, 'rate', DC_DEFAULTS.fourCpRatePerKw),
    fourCpStrategy: strat === 'pf' ? 'foresight' : strat === 'da' ? 'realistic' : DC_DEFAULTS.fourCpStrategy,
    windowStartHour: numParam(q, 'ws', DC_DEFAULTS.windowStartHour),
    windowEndHour: numParam(q, 'we', DC_DEFAULTS.windowEndHour),
    curtailmentHoursPerYear: numParam(q, 'ch', DC_DEFAULTS.curtailmentHoursPerYear),
    valueOfLostLoad: numParam(q, 'voll', DC_DEFAULTS.valueOfLostLoad),
    asEnabled: boolParam(q, 'as', DC_DEFAULTS.asEnabled),
    site,
  };
}

/** The query for a form, `mode=dc` first. Values equal to their default are left out, so links stay short. */
export function dcQuery(f: DcForm): string {
  const q = new URLSearchParams({ mode: 'dc', loc: f.loc, year: String(f.year) });
  const put = (k: string, v: number | boolean | string, d: number | boolean | string) => {
    if (v !== d) q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  };
  put('load', f.siteLoadMw, DC_DEFAULTS.siteLoadMw);
  put('lf', f.loadFactor, DC_DEFAULTS.loadFactor);
  put('exp', f.exportAllowed, DC_DEFAULTS.exportAllowed);
  put('mw', f.batteryMw, DC_DEFAULTS.batteryMw);
  put('mwh', f.batteryMwh, DC_DEFAULTS.batteryMwh);
  put('rte', f.rte, DC_DEFAULTS.rte);
  put('rate', f.fourCpRatePerKw, DC_DEFAULTS.fourCpRatePerKw);
  put('strat', f.fourCpStrategy === 'foresight' ? 'pf' : 'da', DC_DEFAULTS.fourCpStrategy === 'foresight' ? 'pf' : 'da');
  put('ws', f.windowStartHour, DC_DEFAULTS.windowStartHour);
  put('we', f.windowEndHour, DC_DEFAULTS.windowEndHour);
  put('ch', f.curtailmentHoursPerYear, DC_DEFAULTS.curtailmentHoursPerYear);
  put('voll', f.valueOfLostLoad, DC_DEFAULTS.valueOfLostLoad);
  put('as', f.asEnabled, DC_DEFAULTS.asEnabled);
  if (f.site) {
    q.set('site', f.site.label);
    q.set('lat', f.site.lat.toFixed(4));
    q.set('lon', f.site.lon.toFixed(4));
    if (f.site.node) q.set('node', f.site.node);
    if (f.site.km != null) q.set('km', f.site.km.toFixed(1));
  }
  return q.toString();
}

export const dcHash = (f: DcForm): string => `#/studio?${dcQuery(f)}`;

/**
 * Link from the Site Value card: the site, its nearest node and the card's year, duration and mode. The battery keeps the default
 * power and takes the card's duration, so a stack the card showed is used here too.
 */
export function dcLinkFromSite(x: { loc: string; year: number; durationH: number; mode: StackMode; site: DcSite }): string {
  const q = new URLSearchParams({ mode: 'dc', loc: x.loc, year: String(x.year) });
  q.set('mwh', String(DC_DEFAULTS.batteryMw * x.durationH));
  if (x.mode !== DC_DEFAULTS.fourCpStrategy) q.set('strat', x.mode === 'foresight' ? 'pf' : 'da');
  q.set('site', x.site.label);
  q.set('lat', x.site.lat.toFixed(4));
  q.set('lon', x.site.lon.toFixed(4));
  if (x.site.node) q.set('node', x.site.node);
  if (x.site.km != null) q.set('km', x.site.km.toFixed(1));
  return `#/studio?${q}`;
}

// ---------------------------------------------------------------- validation and engine inputs

export type DcEngineInputs = Omit<DataCenterInputs, 'highs' | 'prices' | 'onDay'>;

/** Battery hours of storage at full power. */
export const durationOf = (f: Pick<DcForm, 'batteryMw' | 'batteryMwh'>): number => f.batteryMwh / f.batteryMw;

/** The inputs the engine gets, without the price file and solver (the worker adds those). */
export function toEngineInputs(f: DcForm, fourCp: FourCpYear, asStack: AsStack | null, profile: number[] | null): DcEngineInputs {
  return {
    fourCp,
    node: f.loc,
    year: f.year,
    siteLoadMw: f.siteLoadMw,
    loadFactor: f.loadFactor,
    loadProfileMw: profile,
    batteryMw: f.batteryMw,
    batteryMwh: f.batteryMwh,
    rte: f.rte,
    degCost: DC_DEG_COST,
    exportAllowed: f.exportAllowed,
    fourCpRatePerKw: f.fourCpRatePerKw,
    fourCpStrategy: f.fourCpStrategy,
    windowStartHour: f.windowStartHour,
    windowEndHour: f.windowEndHour,
    curtailmentHoursPerYear: f.curtailmentHoursPerYear,
    valueOfLostLoad: f.valueOfLostLoad,
    // With no stack row the engine runs energy only; the reason is shown by the page (stackChoice), not as a second note.
    asEnabled: f.asEnabled && !!asStack,
    asStack,
  };
}

/** Problems with the form in plain words; empty when it can run. The engine's own checks plus the location and year. */
export function validateDcForm(f: DcForm, coverage: DcCoverage[], profile: number[] | null): string[] {
  const errors = validateDataCenterInputs({
    siteLoadMw: f.siteLoadMw, loadFactor: f.loadFactor, batteryMw: f.batteryMw, batteryMwh: f.batteryMwh, rte: f.rte,
    fourCpRatePerKw: f.fourCpRatePerKw, fourCpStrategy: f.fourCpStrategy, exportAllowed: f.exportAllowed,
    windowStartHour: f.windowStartHour, windowEndHour: f.windowEndHour, curtailmentHoursPerYear: f.curtailmentHoursPerYear,
    valueOfLostLoad: f.valueOfLostLoad, loadProfileMw: profile,
  });
  if (!dcYears(coverage, f.loc).some((c) => c.year === f.year)) errors.push(`No price file and 4CP data for ${f.loc} in ${f.year}.`);
  return errors;
}

// ---------------------------------------------------------------- stack (ancillary services)

export type StackChoice =
  | { status: 'off' }
  | { status: 'none'; reason: string }
  | { status: 'match'; key: StackKey };

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Which Step 1 stack file the ancillary part comes from. A file is used only when results/v4/stack/index.json lists the same
 * year, duration (MWh / MW) and mode (foresight for perfect foresight, realistic for the day-ahead plan) and the battery has the
 * stack's efficiency. Otherwise the run is energy only and the reason says why.
 */
export function stackChoice(f: DcForm, keys: StackKey[]): StackChoice {
  if (!f.asEnabled) return { status: 'off' };
  const dur = durationOf(f);
  const mode: StackMode = f.fourCpStrategy;
  const modeWord = mode === 'foresight' ? 'perfect foresight' : 'day-ahead plan';
  if (!sameNumber(f.rte, STACK_BATTERY.rte)) {
    return { status: 'none', reason: `The precomputed stack assumes ${Math.round(STACK_BATTERY.rte * 100)}% round-trip efficiency. Set efficiency to that to add ancillary services.` };
  }
  const key = keys.find((k) => k.year === f.year && k.mode === mode && sameNumber(k.durationH, dur));
  if (!key) {
    const durs = [...new Set(keys.filter((k) => k.year === f.year && k.mode === mode).map((k) => k.durationH))].sort((a, b) => a - b);
    const have = durs.length ? ` Durations with a stack for ${f.year}: ${durs.map((d) => `${d} h`).join(', ')}.` : '';
    return { status: 'none', reason: `No precomputed stack for a ${round(dur, 2)}-hour battery, ${modeWord}, ${f.year}.${have}` };
  }
  return { status: 'match', key };
}

/** A stack file row as the engine's input. */
export const toAsStack = (r: StackRow): AsStack => ({ energy: r.energy, regup: r.regup, regdn: r.regdn, rrs: r.rrs, ecrs: r.ecrs, nsrs: r.nsrs, total: r.total });

// ---------------------------------------------------------------- 4CP window check

const MIN = 60_000;
/** Local minute of the day (US Central) of a UTC instant. Central offsets are whole hours, so the UTC minutes carry over. */
const localMinute = (ms: number) => {
  const h = centralHour(ms);
  return { date: h.date, minute: h.hour * 60 + new Date(ms).getUTCMinutes() };
};

/** The counted span of a 4CP interval in local minutes of its day, [start, end). */
export function localSpan(iv: FourCpInterval): { date: string; start: number; end: number } {
  const [a, b] = countedSpan(iv);
  const s = localMinute(a);
  const e = localMinute(b - MIN);
  return { date: s.date, start: s.minute, end: e.date === s.date ? e.minute + 1 : 24 * 60 };
}

/** 4CP intervals whose counted span is not inside the window [startHour, endHour) local. */
export function windowMisses(intervals: FourCpInterval[], startHour: number, endHour: number): FourCpInterval[] {
  return intervals.filter((iv) => {
    const s = localSpan(iv);
    return s.start < startHour * 60 || s.end > endHour * 60;
  });
}

/** The smallest whole-hour window that holds [startHour, endHour) and every interval's counted span. */
export function fitWindow(intervals: FourCpInterval[], startHour: number, endHour: number): [number, number] {
  let s = startHour;
  let e = endHour;
  for (const iv of intervals) {
    const sp = localSpan(iv);
    s = Math.min(s, Math.floor(sp.start / 60));
    e = Math.max(e, Math.ceil(sp.end / 60));
  }
  return [s, e];
}

export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

// ---------------------------------------------------------------- outputs

export const BREAKDOWN_KEYS = ['energy', 'as', 'fourCp', 'reliability'] as const;
export type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];
export const BREAKDOWN_LABEL: Record<BreakdownKey, string> = { energy: 'Energy', as: 'Ancillary', fourCp: '4CP avoided', reliability: 'Reliability' };

export interface BreakdownRow { key: BreakdownKey; label: string; usd: number; perKw: number }

/** The engine's breakdown as display rows, in the order of the chart. Their sums are the engine's totals. */
export function breakdownRows(r: Pick<DataCenterResult, 'breakdown' | 'breakdownPerKwYr'>): BreakdownRow[] {
  return BREAKDOWN_KEYS.map((key) => ({ key, label: BREAKDOWN_LABEL[key], usd: r.breakdown[key], perKw: r.breakdownPerKwYr[key] }));
}

/** Waterfall steps: each part starts where the last one ended; the total is a full bar from zero. */
export function waterfall(b: Breakdown): { label: string; base: number; value: number; end: number }[] {
  let at = 0;
  const steps = BREAKDOWN_KEYS.map((k) => {
    const v = b[k];
    const s = { label: BREAKDOWN_LABEL[k], base: Math.min(at, at + v), value: Math.abs(v), end: at + v };
    at += v;
    return s;
  });
  return [...steps, { label: 'Total', base: Math.min(0, at), value: Math.abs(at), end: at }];
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** CSV: every input, then every output, one per row. */
export function dcCsv(f: DcForm, r: DataCenterResult, x: { yearLabel: string; stackNote: string | null; profileName: string | null }): { headers: string[]; rows: (string | number | null)[][] } {
  const rows: (string | number | null)[][] = [];
  const add = (section: string, item: string, value: string | number | null, unit = '') => rows.push([section, item, value, unit]);
  if (f.site) {
    add('Site', 'Name', f.site.label);
    add('Site', 'Latitude', f.site.lat);
    add('Site', 'Longitude', f.site.lon);
    if (f.site.node) add('Site', 'Nearest node', f.site.node);
    if (f.site.km != null) add('Site', 'Nearest node distance', round(f.site.km, 1), 'km');
  }
  add('Input', 'Price location', f.loc);
  add('Input', 'Year', x.yearLabel);
  add('Input', 'Site load', f.siteLoadMw, 'MW');
  add('Input', 'Load factor', f.loadFactor);
  add('Input', 'Load profile', x.profileName ?? 'flat');
  add('Input', 'Export allowed', f.exportAllowed ? 'yes' : 'no');
  add('Input', 'Battery power', f.batteryMw, 'MW');
  add('Input', 'Battery energy', f.batteryMwh, 'MWh');
  add('Input', 'Round-trip efficiency', f.rte);
  add('Input', 'Degradation cost', DC_DEG_COST, '$/MWh');
  add('Input', '4CP rate', f.fourCpRatePerKw, '$/kW per 4CP');
  add('Input', '4CP strategy', f.fourCpStrategy);
  add('Input', '4CP window', `${hourLabel(f.windowStartHour)}-${hourLabel(f.windowEndHour)}`, 'local');
  add('Input', 'Curtailment hours', f.curtailmentHoursPerYear, 'h/yr');
  add('Input', 'Value of lost load', f.valueOfLostLoad, '$/MWh');
  add('Input', 'Ancillary services', f.asEnabled ? (x.stackNote ? 'on, no stack' : 'on') : 'off');
  for (const row of breakdownRows(r)) {
    add('Output', `${row.label}`, round(row.usd, 0), '$/yr');
    add('Output', `${row.label}`, round(row.perKw, 2), '$/kW-yr');
  }
  add('Output', 'Total', round(r.totalUsd, 0), '$/yr');
  add('Output', 'Total', round(r.perKwYr, 2), '$/kW-yr');
  add('Output', `Standalone at ${f.loc}`, round(r.standalone.totalUsd, 0), '$/yr');
  add('Output', `Standalone at ${f.loc}`, round(r.standalone.perKwYr, 2), '$/kW-yr');
  for (const d of r.fourCpDetail) add('4CP', d.intervalEndingLocal, round(d.valueUsd, 0), d.covered ? `$ (cut ${round(d.cutMw, 2)} MW)` : '$ (not covered)');
  for (const n of [...(x.stackNote ? [x.stackNote] : []), ...r.notes]) add('Note', '', n);
  return { headers: ['Section', 'Item', 'Value', 'Unit'], rows };
}

/** Assumption tags: the config items the form's Advanced defaults come from. */
export const DC_ASSUMPTIONS = {
  rate: rules.fourCp.defaultRatePerKwPer4cp,
  strategy: rules.fourCp.realisticStrategy,
  curtailment: rules.defaults.curtailmentHoursPerYear,
  voll: rules.defaults.valueOfLostLoad,
} as const;
