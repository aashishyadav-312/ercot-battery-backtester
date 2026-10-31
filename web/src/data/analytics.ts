import type { IndexRun, NodeSelection, Run } from './types';

export const TOP_DAY_WARN = 0.2;

export interface TopDay {
  date: string;
  revenue: number;
  share: number;
}

export function topDay(run: Run): TopDay | null {
  const { date, revenue } = run.daily;
  const total = revenue.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let k = 0;
  revenue.forEach((v, i) => {
    if (v > revenue[k]) k = i;
  });
  return { date: date[k], revenue: revenue[k], share: revenue[k] / total };
}

/** Known explanations for runs that trip the data-quality note (from results/FINDINGS.md). */
const NOTES: Record<string, string> = {
  'RHESS2_ESS1:2025':
    'On Feb 19–20, 2025 this node’s price reached $28,340/MWh, more than five times the $5,000 offer cap (possible at a node when several congestion constraints bind). Those two days alone are about $77 of the $179/kW-yr (2h, $10/MWh degradation). Node prices are as first posted by ERCOT and could not be corrected for later price revisions, so a corrected spike would change this result much more than the 0.1–0.3% seen at hubs.',
};
export const dataNote = (location: string, year: number) => NOTES[`${location}:${year}`];

export const kw = (run: Run) => run.meta.power_mw * 1000;

export function hubOf(location: string, sel: NodeSelection | undefined): string | undefined {
  if (location.startsWith('HB_')) return location;
  return sel?.nodes.find((n) => n.location === location)?.nearest_hub;
}

export function locationGroups(index: IndexRun[]) {
  const hubs = new Set<string>();
  const nodes = new Set<string>();
  index.forEach((r) => (r.location_type === 'hub' ? hubs : nodes).add(r.location));
  return { hubs: [...hubs], nodes: [...nodes] };
}
