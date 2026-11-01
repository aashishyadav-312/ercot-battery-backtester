import dataNotes from './data-notes.json';
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

/** Known explanations for runs that trip the data-quality note live in data-notes.json. */
const NOTES: Record<string, Record<string, string>> = dataNotes.notes;
export const dataNote = (location: string, year: number): string | undefined => NOTES[location]?.[String(year)];

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

/** Badge for a scaled-to-365-days figure: year-to-date when the run starts on Jan 1, else a custom range. */
export const annualizedBadge = (run: Run | undefined) =>
  run?.metrics.annualized ? (run.meta.first_day.endsWith('-01-01') ? 'Annualized YTD' : 'Annualized') : undefined;
