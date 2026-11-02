// Everything the Research page shows, derived from loaded results files. Pure functions only, so the tests can build the
// same model from results/*.json and check that every figure on screen equals the data. The text of each finding is not
// here: it is rendered from results/FINDINGS.md (data/markdown.ts). This file holds the topic of each finding and the
// one-line teaser on its card, whose numbers are computed.

import { HUBS } from './loader';
import { MONTHS, fmtDate, num, pct, usd } from './format';
import { STACK_KEYS, sumStack, type StackDay } from './ancillary';
import { locName } from './site';
import type { IndexRun, NodesFile, Rtcb, Run } from './types';

// ------------------------------------------------------------ inputs

export interface StackTotals {
  year: number;
  /** Energy-only baseline and the energy-plus-ancillary stack, $/kW over the covered days (not annualized). */
  energy: number;
  stack: number;
  /** Ancillary receipts inside the stack. */
  as: number;
  days: number;
  last: string;
}

export interface Capped {
  year: number;
  /** Largest share of rated power that may be sold as ancillary awards. */
  share: number;
  energy: number;
  stack: number;
  as: number;
}

/** Revenue over the same calendar window (Jan 1 to `end`, "MM-DD") in each year, $/kW, by hub code. */
export interface Windows {
  end: string;
  years: number[];
  byHub: Record<string, Record<number, number>>;
}

export interface ResearchData {
  index: IndexRun[];
  nodes: NodesFile;
  rtcb: Rtcb;
  /** Houston, standard configuration, one entry per year. Empty until the ancillary files have loaded. */
  stack: StackTotals[];
  capped: Capped | null;
  /** Null until the hub run files have loaded. */
  windows: Windows | null;
}

/** The standard configuration every finding is quoted in: the all-node run's year, duration and degradation. */
export function standard(nodes: NodesFile) {
  return { year: nodes.meta.year, durationH: nodes.meta.duration_h, deg: nodes.meta.deg_cost_per_mwh };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function findRow(index: IndexRun[], code: string, year: number, h: number, deg: number): IndexRun | undefined {
  return index.find((r) => r.location === code && r.year === year && r.duration_h === h && r.deg_cost_per_mwh === deg);
}

export const yearsOf = (index: IndexRun[]) => [...new Set(index.map((r) => r.year))].sort((a, b) => a - b);

/** "10-24" to "Oct 24". */
export function monthDay(md: string) {
  const [m, d] = md.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function stackTotals(year: number, rows: StackDay[]): StackTotals {
  const energy = sumStack(rows, false)[0];
  const parts = sumStack(rows, true);
  const stack = parts.reduce((a, b) => a + b, 0);
  return { year, energy, stack, as: stack - parts[STACK_KEYS.indexOf('energy')], days: rows.length, last: rows.at(-1)?.date ?? '' };
}

/** The award-cap sensitivity: energy and ancillary parts of the stack when awards may use at most `share` of rated power. */
export function cappedTotals(year: number, share: number, rows: StackDay[]): Capped {
  const t = stackTotals(year, rows);
  return { year, share, stack: t.stack, as: t.as, energy: t.stack - t.as };
}

/** Revenue per kW from Jan 1 to `end` ("MM-DD") of the run's year. */
export function windowRevenue(run: Run, end: string): number {
  const { date, revenue } = run.daily;
  let sum = 0;
  date.forEach((d, i) => { if (d.slice(5) <= end) sum += revenue[i]; });
  return sum / (run.meta.power_mw * 1000);
}

/** The window every year can be compared over: Jan 1 to the last day the latest year covers at every hub. */
export function windowEnd(index: IndexRun[], std: { durationH: number; deg: number }): string | null {
  const last = Math.max(...yearsOf(index));
  const ends = HUBS.map((h) => findRow(index, h, last, std.durationH, std.deg)?.last_day).filter((d): d is string => !!d);
  return ends.length ? ends.reduce((a, b) => (a < b ? a : b)).slice(5) : null;
}

// ------------------------------------------------------------ the three featured charts

export interface Series { name: string; tone: 'dot' | 'mint' | 'amber' }
export interface BarGroup { label: string; values: (number | null)[] }
export interface GroupedChart {
  title: string;
  meta: string;
  series: Series[];
  groups: BarGroup[];
  note: string;
}

const hubShort = (code: string) => code.replace(/^HB_/, '');
const x1 = (v: number) => `${v.toFixed(1)}x`;

/** Energy-only against energy plus ancillary, Houston, one pair of bars a year. */
export function ancillaryChart(d: ResearchData): GroupedChart | null {
  if (!d.stack.length) return null;
  const { durationH, deg } = standard(d.nodes);
  const complete = d.stack.filter((s) => s.last.endsWith('-12-31') && s.energy > 0);
  const lifts = complete.map((s) => `${x1(s.stack / s.energy)} in ${s.year}`);
  const cap = d.capped;
  return {
    title: lifts.length ? `Adding ancillary services lifts Houston revenue ${lifts.length > 1 ? `${lifts.slice(0, -1).join(', ')} and ${lifts.at(-1)}` : lifts[0]}.` : 'Houston revenue with and without ancillary services.',
    meta: `${locName('HB_HOUSTON')} · ${durationH}-hour battery · ${usd(deg, 0)}/MWh degradation · $/kW over the period`,
    series: [{ name: 'Energy only', tone: 'dot' }, { name: 'Energy plus ancillary', tone: 'amber' }],
    groups: d.stack.map((s) => ({
      label: s.last.endsWith('-12-31') ? String(s.year) : `${s.year} to ${fmtDate(s.last).replace(/, \d+$/, '')}`,
      values: [s.energy, s.stack],
    })),
    note: [
      d.stack.some((s) => !s.last.endsWith('-12-31')) ? 'The last year is partial and not annualized.' : '',
      'Ancillary receipts partly displace energy trades.',
      cap ? `Capping awards at ${pct(cap.share)} of rated power cuts the ${cap.year} total from ${usd(d.stack.find((s) => s.year === cap.year)?.stack, 2)} to ${usd(cap.stack, 2)}.` : '',
    ].filter(Boolean).join(' '),
  };
}

export interface CaptureRow { code: string; before: number; after: number; pts: number; days: number }
export interface CaptureChart {
  title: string;
  meta: string;
  rows: CaptureRow[];
  before: string;
  after: string;
  note: string;
}

/** Capture rate before and after RTC+B at each hub (rtcb.json, matched calendar days). */
export function captureChart(d: ResearchData): CaptureChart | null {
  const { durationH, deg } = standard(d.nodes);
  const rows: CaptureRow[] = [];
  for (const code of HUBS) {
    const run = d.rtcb.locations[code]?.runs.find((r) => r.duration_h === durationH && r.deg_cost_per_mwh === deg);
    if (run?.before.capture_rate != null && run.after.capture_rate != null) {
      rows.push({ code, before: run.before.capture_rate, after: run.after.capture_rate, pts: run.change.capture_rate_pts, days: run.days });
    }
  }
  if (!rows.length) return null;
  const drop = Math.round(-mean(rows.map((r) => r.pts)));
  const m = d.rtcb.meta;
  const win = (w: { start: string; end: string }) => `${fmtDate(w.start)} to ${fmtDate(w.end)}`;
  return {
    title: drop >= 1 ? `After RTC+B, a day-ahead schedule keeps about ${drop} points less.` : 'What a day-ahead schedule kept, before and after RTC+B.',
    meta: `Capture rate · ${rows[0].days} matched days · ${durationH}h · ${usd(deg, 0)}/MWh`,
    rows,
    before: win(m.before),
    after: win(m.after),
    note: `RTC+B went live ${fmtDate(m.after.start)}. This shows what changed, not why: the build-out of batteries also flattens price spreads.`,
  };
}

export interface FallChart extends GroupedChart {
  /** Mean change from each year to the next across the hubs, as fractions. */
  steps: { from: number; to: number; change: number }[];
}

/** Revenue over the same Jan 1 to `end` window of each year, per hub. */
export function fallChart(d: ResearchData): FallChart | null {
  const w = d.windows;
  if (!w) return null;
  const { durationH, deg } = standard(d.nodes);
  const hubs = HUBS.filter((h) => w.byHub[h]);
  if (!hubs.length) return null;
  const last = w.years.at(-1)!;
  const afterRtcb = `${last}-01-01` >= d.rtcb.meta.after.start;
  const steps = w.years.slice(1).map((y, i) => ({
    from: w.years[i], to: y,
    change: mean(hubs.map((h) => w.byHub[h][y] / w.byHub[h][w.years[i]] - 1)),
  }));
  const falling = hubs.every((h) => w.years.every((y, i) => i === 0 || w.byHub[h][y] < w.byHub[h][w.years[i - 1]]));
  const tones: Series['tone'][] = ['dot', 'mint', 'amber'];
  // The first year-to-year fall is already visible before RTC+B when that year's window ended before it went live.
  const startedBefore = steps.length > 0 && `${steps[0].to}-${w.end}` < d.rtcb.meta.after.start;
  return {
    title: falling && startedBefore ? 'Arbitrage revenue keeps falling, and it started before RTC+B.' : 'Arbitrage revenue over the same window, year by year.',
    meta: `Jan 1 to ${monthDay(w.end)} each year · ${durationH}h · ${usd(deg, 0)}/MWh · $/kW`,
    series: w.years.map((y, i) => ({ name: y === last && afterRtcb ? `${y} (all after RTC+B)` : String(y), tone: tones[Math.min(i, tones.length - 1)] })),
    groups: hubs.map((h) => ({ label: hubShort(h), values: w.years.map((y) => w.byHub[h][y] ?? null) })),
    steps,
    note: `Averaged over the hubs, revenue ${steps.map((s) => `${s.change < 0 ? 'fell' : 'rose'} ${pct(Math.abs(s.change))} from ${s.from} to ${s.to}`).join(', then ')}. This model cannot separate RTC+B from the continuing build-out of batteries.`,
  };
}

// ------------------------------------------------------------ the findings

export type Topic = 'pays' | 'run' | 'changed' | 'context';
export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'pays', label: 'Where it pays' },
  { id: 'run', label: 'How it is run' },
  { id: 'changed', label: 'How it changed' },
  { id: 'context', label: 'Context' },
];
export const topicLabel = (t: Topic) => TOPICS.find((x) => x.id === t)!.label;

export interface FindingDef {
  /** Section number in FINDINGS.md ("## 4. ..."). */
  n: number;
  key: string;
  topic: Topic;
  /** One line of numbers from the loaded data for the card. */
  teaser: (d: ResearchData) => string;
}

const sign = (v: number | null | undefined) => (v == null ? null : v < 0 ? `down ${pct(-v)}` : `up ${pct(v)}`);

function houston(d: ResearchData, year: number, h: number, deg: number) {
  return findRow(d.index, 'HB_HOUSTON', year, h, deg);
}

export const FINDINGS: FindingDef[] = [
  {
    n: 1, key: 'ten-days', topic: 'changed',
    teaser: (d) => {
      const { year, durationH, deg } = standard(d.nodes);
      const first = yearsOf(d.index)[0];
      const a = houston(d, first, durationH, deg)?.top10_day_share;
      const b = houston(d, year, durationH, deg)?.top10_day_share;
      return a != null && b != null ? `Houston earned ${pct(a, 1)} of ${first} revenue in its 10 best days, and ${pct(b, 1)} in ${year}.` : 'How much of a year the ten best days carry.';
    },
  },
  {
    n: 2, key: 'location', topic: 'pays',
    teaser: (d) => {
      const { year, durationH, deg } = standard(d.nodes);
      const w = findRow(d.index, 'HB_WEST', year, durationH, deg);
      const h = houston(d, year, durationH, deg);
      return w && h ? `${usd(w.revenue_per_kw_year)} against ${usd(h.revenue_per_kw_year)} per kW-year for a ${durationH}-hour battery in ${year}.` : 'West Texas against Houston.';
    },
  },
  {
    n: 3, key: 'duration', topic: 'run',
    teaser: (d) => {
      const { year, deg } = standard(d.nodes);
      const rows = [1, 2, 4].map((h) => ({ h, r: houston(d, year, h, deg) })).filter((x) => x.r);
      return rows.length ? `Houston ${year}: ${rows.map((x) => usd(x.r!.revenue_per_kw_year)).join(', ')} per kW-year for ${rows.map((x) => x.h).join(', ')} hours.` : 'Longer batteries, per kW and per kWh.';
    },
  },
  {
    n: 4, key: 'decline', topic: 'changed',
    teaser: (d) => {
      const w = d.windows;
      const h = w?.byHub.HB_HOUSTON;
      return w && h ? `Houston, ${monthDay('01-01')} to ${monthDay(w.end)}: ${w.years.map((y) => `${usd(h[y])} in ${y}`).join(', ')}.` : 'Revenue over the same window, year by year.';
    },
  },
  {
    n: 5, key: 'degradation', topic: 'run',
    teaser: (d) => {
      const { year, durationH, deg } = standard(d.nodes);
      const none = houston(d, year, durationH, 0);
      const cost = houston(d, year, durationH, deg);
      return none && cost
        ? `A ${usd(deg, 0)}/MWh cost cuts Houston from ${usd(none.revenue_per_kw_year)} to ${usd(cost.revenue_per_kw_year)} and cycles from ${num(none.cycles_per_year)} to ${num(cost.cycles_per_year)} a year.`
        : 'What a degradation cost removes.';
    },
  },
  {
    n: 6, key: 'node-vs-hub', topic: 'pays',
    teaser: (d) => {
      const top = [...d.nodes.nodes].sort((a, b) => a.rank - b.rank)[0];
      const hubRev = (code: string | null) => d.nodes.hubs.find((h) => h.code === code)?.rev;
      const typical = d.nodes.nodes.find((n) => n.code === 'ANSON1_ALL');
      const a = top && hubRev(top.hub) ? `${top.code} earned ${usd(top.rev)} against a ${usd(hubRev(top.hub))} hub.` : 'A congested node against its hub.';
      const b = typical && hubRev(typical.hub) ? ` ${typical.code} earned ${(typical.rev / hubRev(typical.hub)!).toFixed(2)}x its hub.` : '';
      return a + b;
    },
  },
  {
    n: 7, key: 'capture', topic: 'run',
    teaser: (d) => {
      const { durationH, deg } = standard(d.nodes);
      const parts = yearsOf(d.index).map((y) => ({ y, r: houston(d, y, durationH, deg) })).filter((x) => x.r?.capture_rate != null)
        .map((x) => `${pct(x.r!.capture_rate)} in ${x.y}${x.r!.annualized ? ' so far' : ''}`);
      return parts.length ? `Houston capture: ${parts.join(', ')}.` : 'What a day-ahead schedule keeps.';
    },
  },
  {
    n: 8, key: 'rtcb', topic: 'changed',
    teaser: (d) => {
      const { durationH, deg } = standard(d.nodes);
      const run = d.rtcb.locations.HB_HOUSTON?.runs.find((r) => r.duration_h === durationH && r.deg_cost_per_mwh === deg);
      const pf = sign(run?.change.pf_revenue);
      const da = sign(run?.change.da_rt_revenue);
      return pf && da ? `Houston: perfect foresight ${pf}, day-ahead ${da}.` : 'Before and after RTC+B.';
    },
  },
  {
    n: 9, key: 'all-nodes', topic: 'pays',
    teaser: (d) => {
      const revs = d.nodes.nodes.map((n) => n.rev).sort((a, b) => a - b);
      const top = Math.max(...revs);
      const mid = revs.length % 2 ? revs[(revs.length - 1) / 2] : (revs[revs.length / 2 - 1] + revs[revs.length / 2]) / 2;
      return revs.length ? `Median node ${usd(mid)} per kW-year; the top node ${usd(top)}.` : 'Every resource node against its hub.';
    },
  },
  {
    n: 10, key: 'ancillary', topic: 'changed',
    teaser: (d) => {
      const { year } = standard(d.nodes);
      const s = d.stack.find((x) => x.year === year);
      const c = d.capped;
      return s ? `Houston ${year}: ${usd(s.energy)} energy only, ${usd(s.stack)} with ancillary${c ? `, ${usd(c.stack)} with awards capped at ${pct(c.share)}` : ''}.` : 'Ancillary capacity changes the revenue stack.';
    },
  },
  {
    n: 11, key: 'context', topic: 'context',
    teaser: () => 'What else was moving in the market while revenue fell: fleet, queue, weather, solar and wind share.',
  },
];

/** "Eleven": the count in words for the headings; larger counts print as digits. */
export function countWord(n: number) {
  return ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'][n] ?? String(n);
}

// ------------------------------------------------------------ validation

/** One published benchmark: what a real fleet earned, from Modo Energy's ERCOT BESS Index. External figures, not results. */
export interface Benchmark { year: number; fleet: string; note: string }
export const BENCHMARKS: Benchmark[] = [
  { year: 2024, fleet: '~$55–56', note: 'all revenue; ancillary services were most of it' },
  { year: 2025, fleet: '~$29', note: 'all revenue (Modo Nowcast, February 2026)' },
];
export const MODO_SOURCES = [
  { label: 'Modo Energy: Why were ERCOT battery revenues so low in 2025?', href: 'https://modoenergy.com/research/why-were-ercot-battery-revenues-so-low-in-2025-weather-energy-arbitrage-builodout' },
  { label: 'Modo Energy: ERCOT BESS revenues H1 2024', href: 'https://modoenergy.com/research/ercot-battery-energy-storage-revenues-h1-january-june-2024-owners-ancillary-services-arbitrage-bess-index-jupiter-power-key-capture' },
  { label: 'Modo Energy: ERCOT battery revenue benchmark, November 2025', href: 'https://modoenergy.com/research/ercot-battery-revenue-benchmark-november-2025-battery-energy-storage-bess-capture-rates' },
];

export interface ValidationRow { year: number; fleet: string; note: string; ours: [number, number] | null; oursNoDeg: [number, number] | null }

/** The model's range across the hubs for each benchmark year, in dollars per kW-year. */
export function validationRows(index: IndexRun[], std: { durationH: number; deg: number }): ValidationRow[] {
  const range = (year: number, deg: number): [number, number] | null => {
    const v = HUBS.map((h) => findRow(index, h, year, std.durationH, deg)?.revenue_per_kw_year).filter((x): x is number => x != null);
    return v.length ? [Math.min(...v), Math.max(...v)] : null;
  };
  return BENCHMARKS.map((b) => ({ ...b, ours: range(b.year, std.deg), oursNoDeg: range(b.year, 0) }));
}
export const fmtRange = (r: [number, number] | null) => (r ? `${usd(r[0], 0)} to ${usd(r[1], 0)}` : '–');
