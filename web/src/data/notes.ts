// Plain-language helper lines, built from result metadata and computed outputs (never typed figures).

import type { IndexRun } from './types';
import type { Outputs } from './economics';
import { fmtDate, usd } from './format';
import { locFull } from './site';

/** "2026 = Jan 1, 2026 to Mar 14, 2026, scaled to a full year. Updated monthly." for a partial year; null for a full one. */
export function yearNote(index: IndexRun[] | null, year: number): string | null {
  const rows = (index ?? []).filter((r) => r.year === year && r.annualized);
  if (!rows.length) return null;
  const start = rows.reduce((m, r) => (r.first_day < m ? r.first_day : m), rows[0].first_day);
  const end = rows.reduce((m, r) => (r.last_day > m ? r.last_day : m), rows[0].last_day);
  return `${year} = ${fmtDate(start)} to ${fmtDate(end)}, scaled to a full year. Updated monthly.`;
}

/** Which degradation costs have precomputed results. */
export function degNote(degs: readonly number[]): string {
  const list = degs.map((d) => `$${d}`);
  const costs = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : (list[0] ?? '');
  return `Precomputed at ${costs}/MWh. Any other cost: set it in Studio.`;
}

/** One sentence under the Economics KPI row, from the computed result. */
export function economicsVerdict(out: Outputs): string {
  if (out.npv < 0) {
    return `At these inputs, energy arbitrage alone does not pay back the battery (NPV ${usd(out.npv, 0)}/kW). Try a lower installed cost or add a tax credit.`;
  }
  return `At these inputs, energy arbitrage alone pays back the battery (NPV ${usd(out.npv, 0)}/kW). Raise the installed cost or the haircut to see where that stops.`;
}

/** Study sites subhead: the best node among the study sites and the hub it sits in, both for the chosen scenario. */
export function topNodeLine(
  rows: IndexRun[], hubOf: (code: string) => string | null | undefined,
): string | null {
  const nodes = rows.filter((r) => r.location_type === 'node').sort((a, b) => b.revenue_per_kw_year - a.revenue_per_kw_year);
  for (const n of nodes) {
    const hub = hubOf(n.location);
    const h = hub ? rows.find((r) => r.location === hub) : undefined;
    if (h) {
      return `${locFull(n.location)} earned ${usd(n.revenue_per_kw_year, 0)}/kW-yr; its hub, ${locFull(h.location)}, earned ${usd(h.revenue_per_kw_year, 0)}/kW-yr.`;
    }
  }
  return null;
}
