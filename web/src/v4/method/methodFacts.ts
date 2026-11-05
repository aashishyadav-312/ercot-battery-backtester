// Method page, revenue stack and Data Center (v4 Step 8). Pure functions that turn the config files and the stack metadata into
// the lines the page shows, so the page repeats the files and types no rule, rate or result of its own.
import { fmtDate } from '../../data/format';

// ---------------------------------------------------------------- assumptions read from the configs

export interface Assumption {
  /** Which config the item is in. */
  file: 'model/config/as_rules.json' | 'web/src/custom/config/datacenter_rules.json';
  /** Dotted path of the item inside the file. */
  path: string;
  title: string;
  text: string;
  source: string | null;
  asOf: string | null;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Short titles for the config keys. A key without one shows its path. */
const TITLES: Record<string, string> = {
  eligibility_note: 'ESR eligibility',
  regulation_deployment_factor: 'Regulation deployment factor',
  price_taker: 'Price taker',
  defaultRatePerKwPer4cp: '4CP rate',
  interval: '4CP interval convention',
  realisticStrategy: 'Realistic 4CP strategy',
  batteryNote: 'Battery under SB 6',
  curtailmentHoursPerYear: 'Curtailment hours',
  curtailmentEvents: 'Curtailment events',
  valueOfLostLoad: 'Value of lost load',
  asWithoutExport: 'Ancillary services without export',
  asReservedHours: 'Ancillary services and 4CP reserve',
};

/** Every item the AS rules config marks `"status": "ASSUMPTION"`, in file order. */
export function asRulesAssumptions(rules: unknown): Assumption[] {
  const out: Assumption[] = [];
  const products = isObj(rules) && isObj(rules.products) ? rules.products : {};
  const walk = (o: unknown, path: string[]) => {
    if (!isObj(o)) return;
    if (o.status === 'ASSUMPTION') {
      const dotted = path.join('.');
      const prod = path[0] === 'products' && isObj(products[path[1]]) ? (products[path[1]] as Json) : null;
      const title = prod ? `${str(prod.name) ?? path[1]}, backing before RTC+B` : TITLES[path[path.length - 1]] ?? dotted;
      const value = typeof o.value === 'number' ? ` Value used: ${o.value}${path[path.length - 1] === 'pre_rtcb' ? ' h' : ''}.` : '';
      out.push({
        file: 'model/config/as_rules.json', path: dotted, title,
        text: `${str(o.note) ?? ''}${value}`.trim(), source: str(o.source), asOf: isObj(rules) ? str(rules.as_of) : null,
      });
    }
    for (const [k, v] of Object.entries(o)) walk(v, [...path, k]);
  };
  walk(rules, []);
  return out;
}

/** Every item the data center config marks `"assumption": true`, in file order. */
export function dataCenterAssumptions(rules: unknown): Assumption[] {
  const out: Assumption[] = [];
  const walk = (o: unknown, path: string[]) => {
    if (!isObj(o)) return;
    if (o.assumption === true) {
      const key = path[path.length - 1];
      const unit = str(o.unit);
      const value = o.value !== undefined ? ` Value used: ${o.value}${unit ? ` ${unit}` : ''}.` : '';
      out.push({
        file: 'web/src/custom/config/datacenter_rules.json', path: path.join('.'),
        title: TITLES[key] ?? path.join('.'), text: `${str(o.text) ?? ''}${value}`.trim(), source: str(o.source), asOf: str(o.asOf),
      });
    }
    for (const [k, v] of Object.entries(o)) walk(v, [...path, k]);
  };
  walk(rules, []);
  return out;
}

// ---------------------------------------------------------------- headroom check

export interface HeadroomFacts { location: string; year: number; durationH: number; mode: string; twoSided: number; shared: number; sharedSource: string }

/** How much lower the stricter value is, as a whole percent of the standard value. */
export const headroomGapPct = (h: Pick<HeadroomFacts, 'twoSided' | 'shared'>): number => Math.round(((h.twoSided - h.shared) / h.twoSided) * 100);

/**
 * The headroom paragraph. The two values come from the stack file and the Step 1 progress file (scripts/build-v4-method.mjs).
 * The stricter value also differs in two other ways, which the text says, so the gap is not credited to the rule alone.
 */
export function headroomLines(h: HeadroomFacts, regDeployment: number | null): string[] {
  const where = `${h.location}, ${h.year}, ${h.durationH}-hour battery, ${h.mode === 'foresight' ? 'perfect foresight' : 'day-ahead plan'}`;
  return [
    'Headroom rule: an idle battery may offer its full power up and down at the same time. Discharge plus up products stay within rated power, and charge plus Reg Down stay within rated power. This is the standard formulation.',
    `A stricter rule counts charge, discharge and every product together against rated power. It gave $${h.shared.toFixed(2)}/kW-yr at ${where}, against $${h.twoSided.toFixed(2)} for the standard rule, about ${headroomGapPct(h)}% less.`,
    `That comparison is not the rule alone. The older screen also ran with no Regulation deployment energy${regDeployment != null ? ` (the stack uses a deployment factor of ${regDeployment})` : ''} and read prices from a different ERCOT source. Source for the stricter value: ${h.sharedSource}.`,
  ];
}

// ---------------------------------------------------------------- coverage of the stack files

export interface CoverageEntry {
  year: number; durationH: number; mode: string; partialYear: boolean; monthsCovered: number; rtcb: string;
  nNodes: number; nHubs: number; firstDay: string; lastDay: string; daysCovered: number;
  daysCoveredBySource: Record<string, number>; dataGaps: string[];
}

export interface MethodFacts { headroom: HeadroomFacts; coverage: CoverageEntry[]; energyAllNode: { year: number; durationH: number }[] }

export function parseMethodFacts(raw: unknown): MethodFacts | null {
  if (!isObj(raw) || !isObj(raw.headroom) || !Array.isArray(raw.coverage)) return null;
  if (typeof raw.headroom.twoSided !== 'number' || typeof raw.headroom.shared !== 'number') return null;
  return { energyAllNode: [], ...raw } as unknown as MethodFacts;
}

const list = (xs: (string | number)[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export interface YearCoverage { year: number; allNodes: boolean; nodes: number; hubs: number; entry: CoverageEntry }

/** One entry per year: the largest file for that year (most nodes), and whether it holds nodes beyond the hubs. */
export function yearCoverage(cov: CoverageEntry[]): YearCoverage[] {
  const years = [...new Set(cov.map((c) => c.year))].sort((a, b) => a - b);
  return years.map((year) => {
    const entry = cov.filter((c) => c.year === year).sort((a, b) => b.nNodes - a.nNodes)[0];
    return { year, allNodes: entry.nNodes > entry.nHubs, nodes: entry.nNodes, hubs: entry.nHubs, entry };
  });
}

/** The data-gap statements: which years have all nodes, what each partial year covers, and the gaps the files list. */
export function coverageLines(facts: MethodFacts): string[] {
  const years = yearCoverage(facts.coverage);
  const all = years.filter((y) => y.allNodes);
  const hubOnly = years.filter((y) => !y.allNodes);
  const lines: string[] = [];
  if (years.length) {
    lines.push(
      `Full-stack results for every node exist only for ${list(all.map((y) => `${y.year} (${y.nodes} nodes)`)) || 'no year'}.` +
      (hubOnly.length ? ` ${list(hubOnly.map((y) => y.year))} cover the ${hubOnly[0].hubs} hubs only.` : ''),
    );
  }
  if (facts.energyAllNode.length) {
    lines.push(`Energy-only results for every node exist for ${list([...new Set(facts.energyAllNode.map((e) => e.year))])}.`);
  }
  for (const y of years.filter((x) => x.entry.partialYear)) {
    const e = y.entry;
    const by = Object.entries(e.daysCoveredBySource);
    lines.push(
      `${y.year} YTD covers ${fmtDate(e.firstDay)} to ${fmtDate(e.lastDay)}, ${e.monthsCovered} whole months, and is annualized by 365 divided by the days a location has.` +
      (by.length ? ` Days covered by price source: ${by.map(([s, n]) => `${n} (${s})`).join('; ')}.` : ''),
    );
    for (const g of e.dataGaps) lines.push(g);
  }
  return lines;
}

// ---------------------------------------------------------------- reserve durations (RTC+B table)

export interface ReserveRow { name: string; before: number | null; from: number | null; beforeStatus: string | null }

/** Reserve backing hours per product, before and from RTC+B, from the AS rules config. */
export function reserveDurations(rules: unknown): ReserveRow[] {
  const products = isObj(rules) && isObj(rules.products) ? rules.products : {};
  return Object.values(products).flatMap((p) => {
    if (!isObj(p) || !isObj(p.duration_h)) return [];
    const pre = isObj(p.duration_h.pre_rtcb) ? p.duration_h.pre_rtcb : {};
    const post = isObj(p.duration_h.post_rtcb) ? p.duration_h.post_rtcb : {};
    return [{
      name: str(p.name) ?? '', before: typeof pre.value === 'number' ? pre.value : null,
      from: typeof post.value === 'number' ? post.value : null, beforeStatus: str(pre.status),
    }];
  });
}
