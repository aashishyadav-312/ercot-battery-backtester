// 12CP engine (v5 Step 2): what a battery at a large-load site avoids in transmission charges under
// today's 4CP rule and under the PUCT's proposed 12CP rule (Project No. 58000, proposed, not adopted).
//
// Pure: no UI imports. runTwelveCpCase runs the Data Center engine (datacenter.ts) three times on the
// same battery, load, efficiency and price inputs:
//   baseline: no coincident peaks, so nothing is held (what the battery earns from energy at this site)
//   4CP:      runDataCenterCase(input) exactly as today
//   12CP:     the 12 monthly peaks of results/v5/twelvecp/<year>.json, at the 12CP rate per peak
// The energy (and ancillary) revenue given up to hold the cuts is baseline minus each case.
//
// Model rules (config/twelvecp_rules.json):
//   foresight: the LP knows each monthly peak hour and earns rate x the cut held through all of it.
//   realistic: the 4CP alert rule in every month (daily peak >= threshold x month-to-date peak), with
//              an even cut through the season's hold window. Only the cut the executed schedule held
//              through the whole peak hour counts.
//   rate:      the 4CP postage stamp rate / 12 per peak, or the entered 4CP rate x 4 / 12.
// Ignored (see notModelled in the config): large load minimum billing demand, rate rebasing on the
// lower 12CP load, storage and export exclusions, retail TCRF pass-through, the start date.
import dcRules from './config/datacenter_rules.json';
import rules from './config/twelvecp_rules.json';
import {
  runDataCenterCase,
  type DataCenterInputs,
  type DataCenterResult,
  type FourCpDetail,
  type FourCpYear,
  type HoldWindow,
} from './datacenter';

export const TWELVECP_RULES = rules;
export type TwelveCpRules = typeof rules;

// --- data shapes (results/v5/twelvecp/<year>.json) ----------------------------------------------

export interface TwelveCpInterval {
  month: number;
  label?: string;
  interval_ending_local: string;
  start_utc: string;
  end_utc: string;
  resolution_minutes: number;
  ercot_peak_mw: number;
  /** The proposal's 12CP year (October to September) this month falls in. */
  twelvecp_year?: number;
}

export interface TwelveCpYear {
  year: number;
  status: 'computed' | 'official';
  complete: boolean;
  source: string;
  asOf: string;
  months_finished?: number[];
  mean_monthly_peak_mw?: number | null;
  intervals: TwelveCpInterval[];
  daily_peaks: { date: string; peak_mw: number; hour_ending: number }[];
  sources?: Record<string, string>;
  notes?: string[];
}

// --- rules -------------------------------------------------------------------------------------

const cents = (x: number) => Math.round(x * 100) / 100;

/**
 * $/kW per monthly peak. With no 4CP rate entered: the postage stamp rate in datacenter_rules.json
 * divided by 12 and rounded to the cent. With a 4CP rate entered: the same annual amount, rate x 4 / 12.
 */
export function defaultTwelveCpRate(fourCpRatePerKw?: number, r: TwelveCpRules = rules): number {
  const d = r.defaultRatePerKwPerPeak;
  if (fourCpRatePerKw !== undefined) return (fourCpRatePerKw * 4) / d.divisor;
  const annual = dcRules.fourCp.postageStampRate.value / d.divisor;
  return d.roundToCents ? cents(annual) : annual;
}

/** The realistic hold windows from the config. */
export function holdWindows(r: TwelveCpRules = rules): HoldWindow[] {
  return r.realisticStrategy.windows.map((w) => ({ months: [...w.months], hours: w.hours.map(([s, e]) => [s, e] as [number, number]) }));
}

/** A 12CP year in the shape the Data Center engine reads. */
export function toPeakFile(peaks: TwelveCpYear): FourCpYear {
  return {
    year: peaks.year,
    status: peaks.status,
    complete: peaks.complete,
    intervals: peaks.intervals.map((iv) => ({
      month: iv.month,
      label: iv.label ?? iv.interval_ending_local,
      interval_ending_local: iv.interval_ending_local,
      start_utc: iv.start_utc,
      end_utc: iv.end_utc,
      resolution_minutes: iv.resolution_minutes,
      hourly_load_mw: iv.ercot_peak_mw,
    })),
    daily_peaks: peaks.daily_peaks,
    sources: peaks.sources ?? { intervals: peaks.source },
    notes: peaks.notes ?? [],
  };
}

// --- engine ------------------------------------------------------------------------------------

export interface CpOutcome {
  method: '4CP' | '12CP';
  /** $/kW per coincident peak interval. */
  ratePerKw: number;
  /** Peaks the rule bills on in a full year (4 or 12). */
  peaksInYear: number;
  /** Peaks in the data file (fewer than peaksInYear for an incomplete year). */
  peaksValued: number;
  peaksCovered: number;
  /** Transmission charge avoided, USD per year and per kW of battery power per year. */
  avoidedUsd: number;
  avoidedPerKwYr: number;
  /** Days the realistic strategy held a cut (0 for foresight). */
  alertDays: number;
  reservedHours: number;
  /** Energy revenue given up to hold the cuts, against the baseline (USD/yr, $/kW-yr). */
  energyGivenUpUsd: number;
  energyGivenUpPerKwYr: number;
  /** Ancillary service revenue given up for the held hours (0 unless ancillary services are on). */
  asGivenUpUsd: number;
  /** Avoided charge less the energy and ancillary revenue given up, USD/yr and $/kW-yr. */
  netUsd: number;
  netPerKwYr: number;
  detail: FourCpDetail[];
  result: DataCenterResult;
}

export interface TwelveCpComparison {
  year: number;
  strategy: DataCenterInputs['fourCpStrategy'];
  /** 12CP rule status from the config, e.g. "proposed, not adopted". */
  status: string;
  baseline: { energyUsd: number; asUsd: number; energyPerKwYr: number };
  fourCp: CpOutcome;
  twelveCp: CpOutcome;
  notes: string[];
}

export interface TwelveCpOptions {
  /** $/kW per monthly peak. Default: defaultTwelveCpRate(input.fourCpRatePerKw). */
  twelveCpRatePerKw?: number;
}

function outcome(method: CpOutcome['method'], r: DataCenterResult, base: DataCenterResult, rate: number, peaksInYear: number, kw: number): CpOutcome {
  const energyGivenUpUsd = base.breakdown.energy - r.breakdown.energy;
  const asGivenUpUsd = base.breakdown.as - r.breakdown.as;
  const avoidedUsd = r.breakdown.fourCp;
  const netUsd = avoidedUsd - energyGivenUpUsd - asGivenUpUsd;
  return {
    method,
    ratePerKw: rate,
    peaksInYear,
    peaksValued: r.fourCpDetail.length,
    peaksCovered: r.fourCpDetail.filter((d) => d.covered).length,
    avoidedUsd,
    avoidedPerKwYr: avoidedUsd / kw,
    alertDays: r.alertDays,
    reservedHours: r.reservedHours,
    energyGivenUpUsd,
    energyGivenUpPerKwYr: energyGivenUpUsd / kw,
    asGivenUpUsd,
    netUsd,
    netPerKwYr: netUsd / kw,
    detail: r.fourCpDetail,
    result: r,
  };
}

/**
 * 4CP and 12CP transmission savings for one node-year on the same inputs. `input` is a Data Center
 * case (its fourCp file is the 4CP year); `peaks` is the 12CP year for the same year. The 4CP run is
 * runDataCenterCase(input) unchanged; input.onDay sees only that run.
 */
export function runTwelveCpCase(
  input: DataCenterInputs,
  r: TwelveCpRules = rules,
  peaks: TwelveCpYear,
  opts: TwelveCpOptions = {},
): TwelveCpComparison {
  if (peaks.year !== input.year) throw new Error(`12CP file is for ${peaks.year}, not ${input.year}`);
  const rate12 = opts.twelveCpRatePerKw ?? defaultTwelveCpRate(input.fourCpRatePerKw, r);
  if (!(Number.isFinite(rate12) && rate12 >= 0)) throw new Error('12CP rate must be a number at or above 0.');
  const rate4 = input.fourCpRatePerKw ?? dcRules.fourCp.defaultRatePerKwPer4cp.value;
  const kw = input.batteryMw * 1000;

  const four = runDataCenterCase(input);
  const quiet = { ...input, onDay: undefined };
  const base = runDataCenterCase({ ...quiet, fourCp: { ...input.fourCp, intervals: [], daily_peaks: [] } });
  const twelve = runDataCenterCase({
    ...quiet,
    fourCp: toPeakFile(peaks),
    fourCpRatePerKw: rate12,
    holdWindows: holdWindows(r),
    peakLabel: '12CP',
  });

  const notes = [
    `12CP is ${r.status.value}: PUCT Project No. 58000.`,
    'The 12CP value assumes the site is billed on its 12CP demand. Under the proposal a large load is billed on at least its contracted or highest non-coincident peak demand, which can leave a battery cut worth nothing.',
    `Monthly peaks are hourly; the proposal measures 30-minute intervals.`,
    ...twelve.notes.filter((n) => !four.notes.includes(n)),
  ];
  if (!peaks.complete) notes.push(`The ${peaks.year} 12CP data has ${peaks.intervals.length} of 12 months; the 12CP savings cover only those months.`);

  return {
    year: input.year,
    strategy: input.fourCpStrategy,
    status: r.status.value,
    baseline: { energyUsd: base.breakdown.energy, asUsd: base.breakdown.as, energyPerKwYr: base.breakdown.energy / kw },
    fourCp: outcome('4CP', four, base, rate4, 4, kw),
    twelveCp: outcome('12CP', twelve, base, rate12, 12, kw),
    notes,
  };
}
