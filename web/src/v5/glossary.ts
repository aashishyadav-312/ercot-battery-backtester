// Glossary terms added with V5 (12CP, coincident peak, site report, storage nearby). Rule text, sources and dates come from
// custom/config/twelvecp_rules.json, custom/config/datacenter_rules.json and src/v5/config.json, not retyped here.
// The Glossary page lists these only with V5 on, so with V5 off it is unchanged.
import type { ConfigTerm } from '../v4/glossary';

interface TwelveRules {
  status: { value: string };
  method: { text: string; citation: string; source: string; asOf: string };
}
interface FourRules { fourCp: { method: { citation: string; source: string; asOf: string } } }
interface NearbyConfig { asOf: string; nearbyBatteries: { defaultRadiusKm: number; assumption: boolean } }

/** EIA's page for the monthly generator inventory (the workbook link changes each month; data/fetch_eia860m.py walks this page). */
export const EIA860M_PAGE = 'https://www.eia.gov/electricity/data/eia860m/';

export type V5Term = Omit<ConfigTerm, 'citation' | 'source' | 'asOf'> & Partial<Pick<ConfigTerm, 'citation' | 'source' | 'asOf'>>;

export function v5Terms(twelve: TwelveRules, dc: FourRules, cfg: NearbyConfig): Record<string, V5Term> {
  const radius = cfg.nearbyBatteries.defaultRadiusKm;
  return {
    twelvecp: {
      term: '12CP',
      definition: `A proposed way to set Texas transmission charges from a customer's load at ERCOT's 12 monthly peaks, instead of the four summer peaks of 4CP. ${twelve.method.text} Status: ${twelve.status.value}. Data Center mode shows it next to 4CP as a screening case.`,
      citation: twelve.method.citation, source: twelve.method.source, asOf: twelve.method.asOf,
    },
    coincident_peak: {
      term: 'Coincident peak',
      definition: "A customer's load during the interval when the whole ERCOT grid is at its peak. ERCOT transmission charges are set from these intervals: 4CP uses the four summer monthly peaks, and the 12CP proposal would use all twelve. A battery that discharges in those intervals lowers the load that is counted.",
      citation: dc.fourCp.method.citation, source: dc.fourCp.method.source, asOf: dc.fourCp.method.asOf,
    },
    site_report: {
      term: 'Site report',
      definition: 'One page for one place in Texas: what a battery there would have earned in the backtest, the nearest priced nodes, the storage nearby, and a link into Data Center mode. Open it from the search on Home or from a pin on the Atlas. It is a screening tool, not a forecast.',
    },
    storage_nearby: {
      term: 'Storage nearby',
      definition: `The battery storage operating, and planned, within ${radius} km of a site, from EIA's monthly generator inventory (EIA-860M).${cfg.nearbyBatteries.assumption ? ' The radius is a screening choice, not a market rule.' : ''} Planned units may never be built. More storage nearby tends to narrow the price spreads a new battery can earn.`,
      citation: 'EIA-860M', source: EIA860M_PAGE, asOf: cfg.asOf,
    },
  };
}
