import locations from './locations.json';
import glossary from './glossary.json';
import type { IndexRun } from './types';

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

/** "Houston Hub (HB_HOUSTON)" / "Russek St, West Texas resource node (RUSSEKST_RN)". Unknown codes pass through. */
export function locFull(code: string): string {
  const l = LOCS[code];
  if (!l) return code;
  return l.type === 'hub' ? `${l.name} (${code})` : `${l.name}, ${l.region} resource node (${code})`;
}
/** Label only, e.g. "Houston Hub" or "Russek St". */
export const locName = (code: string): string => LOCS[code]?.name ?? code;
/** Two-line label for chart axes: name over code. */
export const locAxis = (code: string): string => (LOCS[code] ? `${LOCS[code].name}\n${code}` : code);
/** Region for a code, e.g. "West Texas". */
export const locRegion = (code: string): string | undefined => LOCS[code]?.region;
/** "West Texas load zone (LZ_WEST)". */
export const zoneFull = (code: string): string => (ZONES[code] ? `${ZONES[code]} (${code})` : code);

// ------------------------------------------------------------ glossary
export type TermId = keyof typeof glossary.terms;
export const GLOSSARY = glossary.terms as Record<string, { term: string; definition: string }>;

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
