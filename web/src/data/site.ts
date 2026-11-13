import locations from './locations.json';
import glossary from './glossary.json';
import type { IndexRun } from './types';
import { TERMS } from '../copy/terms';
import dcRules from '../custom/config/datacenter_rules.json';
import { v4ConfigTerms } from '../v4/glossary';
import twelveRules from '../custom/config/twelvecp_rules.json';
import v5Config from '../v5/config.json';
import { v5Terms } from '../v5/glossary';
import { V5 } from '../config/features';

// ------------------------------------------------------------ site facts (About + footer)
export const SITE = {
  author: 'Aashish Yadav',
  role: 'Duke Grad Student - Energy',
  linkedin: 'https://www.linkedin.com/in/x0aashish/',
  email: 'aashish.yadav@duke.edu',
  /** Where "Report an issue" goes. The site links nowhere on GitHub. */
  feedback: 'mailto:aashish.yadav@duke.edu?subject=Chargeline%20feedback',
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
export interface GlossaryTerm { term: string; definition: string; citation?: string; source?: string; asOf?: string }
export const GLOSSARY = glossary.terms as Record<string, GlossaryTerm>;
// 4CP and SB 6 come from the rules config, with the config's citation, source link and as-of date.
Object.assign(GLOSSARY, v4ConfigTerms(dcRules));
// The labels of the shared terms come from copy/terms.ts; the longer definitions stay in glossary.json for the info icons.
const SHARED = [
  ['perfect_foresight', 'perfectForesight'], ['capture_rate', 'captureRate'], ['top10_day_share', 'top10DayShare'], ['usd_per_kw_yr', 'revenueUnit'],
  ['degradation_cost', 'degradationCost'], ['hub', 'hub'], ['resource_node', 'node'],
] as const;
for (const [id, key] of SHARED) GLOSSARY[id] = { ...GLOSSARY[id], term: TERMS[key].label };

/**
 * The Glossary page: every term A to Z, with the short definition from copy/terms.ts where the term is shared. Entries ending in
 * _v4 are the V4 wording for tooltips on V4 views; the page lists the original term instead.
 */
export function glossaryEntries(v5: boolean = V5): (GlossaryTerm & { id: string })[] {
  const short = new Map<string, string>(SHARED.map(([id, key]) => [id, TERMS[key].definition]));
  // V5 adds its terms to the page only; with V5 off the Glossary is the same as before.
  const extra: Record<string, GlossaryTerm> = v5 ? v5Terms(twelveRules, dcRules, v5Config) : {};
  return Object.entries({ ...GLOSSARY, ...extra })
    .filter(([id]) => !id.endsWith('_v4'))
    .map(([id, g]) => ({ ...g, id, definition: short.get(id) ?? g.definition }))
    .sort((x, y) => x.term.localeCompare(y.term, 'en', { sensitivity: 'base' }));
}

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
