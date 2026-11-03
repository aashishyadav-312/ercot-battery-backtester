import locations from './locations.json';
import glossary from './glossary.json';
import type { IndexRun } from './types';
import { TERMS } from '../copy/terms';

// ------------------------------------------------------------ site facts (About + footer)
export const SITE = {
  author: 'Aashish Yadav',
  role: 'Duke Grad Student - Energy',
  linkedin: 'https://www.linkedin.com/in/x0aashish/',
  email: 'aashish.yadav@duke.edu',
  repo: 'https://github.com/aashishyadav-312/ercot-battery-backtester',
  issues: 'https://github.com/aashishyadav-312/ercot-battery-backtester/issues',
  /** Opens the feature-request form (.github/ISSUE_TEMPLATE/feature_request.yml; live once merged to main). */
  featureRequest: 'https://github.com/aashishyadav-312/ercot-battery-backtester/issues/new?template=feature_request.yml',
};

// ------------------------------------------------------------ friendly location names
interface Loc { name: string; region: string; type: 'hub' | 'node' }
const LOCS = locations.locations as Record<string, Loc>;
const ZONES = locations.load_zones as Record<string, string>;

/** "Houston Hub (HB_HOUSTON)" / "Russek St, West Texas node (RUSSEKST_RN)". Unknown codes pass through. */
export function locFull(code: string): string {
  const l = LOCS[code];
  if (!l) return code;
  return l.type === 'hub' ? `${l.name} (${code})` : `${l.name}, ${l.region} ${TERMS.node.label.toLowerCase()} (${code})`;
}
/** Label only, e.g. "Houston Hub" or "Russek St". */
export const locName = (code: string): string => LOCS[code]?.name ?? code;
/** Two-line label for chart axes: name over code. */
export const locAxis = (code: string): string => (LOCS[code] ? `${LOCS[code].name}\n${code}` : code);
/** True for the 10 detailed locations (5 hubs, 5 resource nodes) that have full runs for every year, size and degradation cost. */
export const isDetailed = (code: string): boolean => code in LOCS;
/** Region for a code, e.g. "West Texas". */
export const locRegion = (code: string): string | undefined => LOCS[code]?.region;
/** "West Texas load zone (LZ_WEST)". */
export const zoneFull = (code: string): string => (ZONES[code] ? `${ZONES[code]} (${code})` : code);

// ------------------------------------------------------------ glossary
export type TermId = keyof typeof glossary.terms;
export const GLOSSARY = glossary.terms as Record<string, { term: string; definition: string }>;
// The labels of the shared terms come from copy/terms.ts; the longer definitions stay in glossary.json until Learn is rebuilt.
for (const [id, key] of [
  ['perfect_foresight', 'perfectForesight'], ['capture_rate', 'captureRate'], ['top10_day_share', 'top10DayShare'], ['usd_per_kw_yr', 'revenueUnit'],
  ['degradation_cost', 'degradationCost'], ['hub', 'hub'], ['resource_node', 'node'],
] as const) GLOSSARY[id] = { ...GLOSSARY[id], term: TERMS[key].label };

// ------------------------------------------------------------ data freshness
/** Latest day covered by any run in results/index.json, plus the latest per location type. */
export function dataThrough(index: IndexRun[]) {
  const latest = (rs: IndexRun[]) => rs.reduce((m, r) => (r.last_day > m ? r.last_day : m), '');
  return {
    all: latest(index),
    hubs: latest(index.filter((r) => r.location_type === 'hub')),
    nodes: latest(index.filter((r) => r.location_type !== 'hub')),
  };
}
