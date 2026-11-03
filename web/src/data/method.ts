// Copy for the Method page that carries a figure. Every value comes from the run metadata, the index or the ancillary
// metadata, so the sentences follow the results; the only typed figures are Modo Energy's published ones, below.
import { MONTHS, degLabel, fmtDate, pct, usd } from './format';
import type { IndexRun, NodeSelection, RunMeta } from './types';

/** The part of results/ancillary.json that Method reads. */
export interface AncillaryMeta {
  rtc_date: string;
  max_as_share?: number;
  solver_target_gap: number;
  default_mip_time_limit_s: number;
  durations_before_h: Record<string, number>;
  durations_after_h: Record<string, number>;
  software?: Record<string, string>;
}

const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
const list = (xs: (string | number)[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const lastDay = (rs: IndexRun[]) => rs.reduce((m, r) => (r.last_day > m ? r.last_day : m), '');
/** "Oct 24", for a window that names its year elsewhere. */
export const shortDate = (iso: string) => fmtDate(iso).replace(/, \d{4}$/, '');
const short = shortDate;

export interface AssumptionRow { label: string; text: string }

/** Years whose figures are scaled to 365 days, with the last day each location type reaches. */
export function partialYears(index: IndexRun[]) {
  return uniq(index.filter((r) => r.annualized).map((r) => r.year)).map((year) => {
    const rs = index.filter((r) => r.year === year);
    return { year, hubs: lastDay(rs.filter((r) => r.location_type === 'hub')), nodes: lastDay(rs.filter((r) => r.location_type !== 'hub')) };
  });
}

export function assumptionRows(meta: RunMeta, index: IndexRun[], anc: AncillaryMeta | undefined): AssumptionRow[] {
  const sw = anc?.software;
  const partial = partialYears(index);
  return [
    { label: 'Prices', text: `${meta.price_series[0].toUpperCase()}${meta.price_series.slice(1)}. The day-ahead plan also uses hourly day-ahead prices.` },
    { label: 'Optimizer', text: `One linear program per day, solved with PuLP${sw?.pulp ? ` ${sw.pulp}` : ''} and HiGHS${sw?.highspy ? ` ${sw.highspy}` : ''}.` },
    { label: 'Daily boundary', text: `The battery starts and ends each day ${meta.soc_start_end_frac === 0 ? 'empty' : `at ${pct(meta.soc_start_end_frac)} charge`}, so no day borrows from another.` },
    { label: 'Efficiency', text: `${pct(meta.rte)} round trip, split evenly between charging and discharging.` },
    { label: 'Degradation cost', text: `Revenue is net of a cost per MWh discharged: ${list(uniq(index.map((r) => r.deg_cost_per_mwh)).map(degLabel))}.` },
    { label: 'Size', text: `${meta.power_mw} MW, in ${list(uniq(index.map((r) => r.duration_h)).map((h) => `${h}`))} hour durations. Results are per kW, so size does not change them.` },
    {
      label: 'Partial years',
      text: partial.length
        ? `${partial.map((p) => `${p.year} runs to ${short(p.hubs)} for hubs and ${short(p.nodes)} for nodes`).join('; ')}. Those figures are scaled to 365 days and marked Annualized YTD.`
        : 'Every year is complete.',
    },
  ];
}

export function reserveRows(anc: AncillaryMeta) {
  const b = anc.durations_before_h, a = anc.durations_after_h;
  const names: [string, string[]][] = [['Regulation Up / Down', ['REGUP', 'REGDN']], ['Responsive Reserve', ['RRS']], ['ECRS', ['ECRS']], ['Non-Spin', ['NSPIN']]];
  return names.map(([name, keys]) => [name, String(b[keys[0]]), String(a[keys[0]])] as const);
}

export const rtcLabel = (anc: AncillaryMeta) => fmtDate(anc.rtc_date);

/** Modo Energy's published fleet figures, from the three sources linked on the page. Not model results. */
export const MODO = {
  y2024: '~$55–56/kW-yr from all sources. Ancillary services were about 74% of it in H1.',
  y2025: '~$29/kW-yr from all sources (Modo nowcast, Feb 2026).',
  /** $/kW-yr, rounded as Modo's article rounds it. */
  total2025: 29,
};

/** Range of $/kW-yr across the five 2-hour hubs for a year, one text per degradation setting. */
function hubRange(index: IndexRun[], year: number, deg: number) {
  const v = index.filter((r) => r.location_type === 'hub' && r.year === year && r.duration_h === 2 && r.deg_cost_per_mwh === deg).map((r) => r.revenue_per_kw_year);
  return v.length ? { lo: Math.min(...v), hi: Math.max(...v) } : null;
}
const dollars = (r: { lo: number; hi: number }) => `${usd(r.lo, 0)}–${r.hi.toFixed(0)}`;

export function modoRows(index: IndexRun[]) {
  const row = (year: number, real: string, check: (lo: number, hi: number) => string) => {
    const d10 = hubRange(index, year, 10), d0 = hubRange(index, year, 0);
    if (!d10 || !d0) return null;
    return { year: String(year), real, ours: `${dollars(d10)} (${degLabel(10)} degradation), ${dollars(d0)} (${degLabel(0)})`, check: check(Math.min(d10.lo, d0.lo), Math.max(d10.hi, d0.hi)) };
  };
  return [
    row(2024, MODO.y2024, () => 'Above the fleet’s arbitrage share'),
    row(2025, MODO.y2025, (lo, hi) => `${(lo / MODO.total2025).toFixed(1)}–${(hi / MODO.total2025).toFixed(1)} times the fleet total`),
  ].filter((r): r is NonNullable<typeof r> => r !== null);
}

export const monthYear = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

/** Three sentences on where the prices and locations come from. */
export function locationSentences(sel: NodeSelection, hubCount: number): string[] {
  const high = sel.nodes.filter((n) => n.group === 'high').length;
  return [
    `${hubCount} ERCOT hubs and ${sel.nodes.length} resource nodes are modeled in detail, from ${sel.n_nodes_ranked} nodes with complete data.`,
    `The nodes were picked by the spread of their real-time prices in ${monthYear(sel.sample_month)}: the ${high} most volatile, plus ${sel.nodes.length - high} close to the median.`,
    'Hub prices come from ERCOT’s annual archive, which includes later corrections; node prices are as first posted by ERCOT’s public API.',
  ];
}

export function solverSentence(anc: AncillaryMeta) {
  return `Charge and discharge overlap, including overlap induced by capacity awards at positive prices, triggers a binary fallback (${anc.default_mip_time_limit_s}-second limit, ${pct(anc.solver_target_gap, 1)} target gap; both are configurable in the runner).`;
}
