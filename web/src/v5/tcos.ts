// V5 Step 5: the transmission charge switch in Data Center mode. Pure: which rule is selected, the two outcomes side by side, the
// rows that go into the CSV and the print sheet, and the rule text. Every figure comes from runTwelveCpCase or twelvecp_rules.json.
import { TWELVECP_RULES, type CpOutcome, type TwelveCpComparison } from '../custom/twelvecp';
import type { Tcos } from '../v4/dc/dcForm';

export const TCOS_LABEL: Record<Tcos, string> = { '4cp': '4CP (current rule)', '12cp': '12CP (proposed)' };
export const TCOS_SHORT: Record<Tcos, string> = { '4cp': '4CP', '12cp': '12CP' };
export const TCOS_ORDER: Tcos[] = ['4cp', '12cp'];

/** `tcos=12cp` means 12CP; anything else, or nothing, is 4CP. */
export const parseTcos = (v: string | null | undefined): Tcos => (v === '12cp' ? '12cp' : '4cp');

export const outcomeOf = (c: TwelveCpComparison, t: Tcos): CpOutcome => (t === '12cp' ? c.twelveCp : c.fourCp);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "10 of 12 monthly peaks (Jan to Oct)" when the peak data stops short of a full year, else null. */
export function coverageNote(o: CpOutcome): string | null {
  if (o.peaksValued >= o.peaksInYear) return null;
  const ms = o.detail.map((d) => d.month).sort((a, b) => a - b);
  const span = ms.length > 1 ? `${MONTHS[ms[0] - 1]} to ${MONTHS[ms[ms.length - 1] - 1]}` : ms.length ? MONTHS[ms[0] - 1] : 'none';
  return `${o.peaksValued} of ${o.peaksInYear} peaks (${span})`;
}

export interface TcosRow {
  tcos: Tcos;
  label: string;
  outcome: CpOutcome;
  /** Set when the file holds fewer peaks than the rule bills on in a full year. */
  partial: string | null;
}

/** Both rules, 4CP first, for the comparison block, CSV and print sheet. */
export const tcosRows = (c: TwelveCpComparison): TcosRow[] =>
  TCOS_ORDER.map((t) => ({ tcos: t, label: TCOS_LABEL[t], outcome: outcomeOf(c, t), partial: coverageNote(outcomeOf(c, t)) }));

const r2 = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** CSV rows (section, item, value, unit) for both rules. The same inputs, so the two sets differ only by the rule. */
export function tcosCsvRows(c: TwelveCpComparison): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  for (const x of tcosRows(c)) {
    const s = `Transmission ${TCOS_SHORT[x.tcos]}`;
    const o = x.outcome;
    rows.push([s, 'Rule', x.label, '']);
    rows.push([s, 'Rate', r2(o.ratePerKw), '$/kW per peak']);
    rows.push([s, 'Peaks valued', `${o.peaksValued} of ${o.peaksInYear}`, '']);
    rows.push([s, 'Avoided charge', r2(o.avoidedPerKwYr), '$/kW-yr']);
    rows.push([s, 'Avoided charge', r2(o.avoidedUsd, 0), '$/yr']);
    rows.push([s, 'Alert days', c.strategy === 'realistic' ? o.alertDays : null, c.strategy === 'realistic' ? 'days' : 'n/a, perfect foresight']);
    rows.push([s, 'Energy revenue given up', r2(o.energyGivenUpPerKwYr), '$/kW-yr']);
    rows.push([s, 'Energy revenue given up', r2(o.energyGivenUpUsd, 0), '$/yr']);
    rows.push([s, 'Net value', r2(o.netPerKwYr), '$/kW-yr']);
    rows.push([s, 'Net value', r2(o.netUsd, 0), '$/yr']);
  }
  rows.push(['Transmission', 'Status of 12CP', c.status, '']);
  for (const n of c.notes) rows.push(['Note', '', n, '']);
  return rows;
}

/** The rule text for the note under the block, all from twelvecp_rules.json. */
export function tcosRuleText() {
  const r = TWELVECP_RULES;
  return {
    status: r.status,
    method: r.method,
    rate: r.defaultRatePerKwPerPeak,
    resolution: r.dataResolution,
    billing: r.minimumBillingDemand,
    notModelled: r.notModelled,
    asOf: r.asOf,
  };
}
