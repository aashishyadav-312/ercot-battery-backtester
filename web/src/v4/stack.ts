// Revenue stack: types for results/v4/stack/<year>_<dur>h_<mode>.json (the Stack results contract in the v4 plan) and the
// pure functions the Atlas, the location chart and Studio use. No UI imports, so the tests can rebuild each figure.

import { RTCB_GO_LIVE } from './config';
import type { NodeRec } from '../data/types';

export const PRODUCTS = ['energy', 'regup', 'regdn', 'rrs', 'ecrs', 'nsrs'] as const;
export type Product = (typeof PRODUCTS)[number];
export type StackMode = 'foresight' | 'realistic';
export type RtcbEra = 'pre' | 'post' | 'mixed';

/** Chart token of each product (the same six hues as the existing Ancillary card): --chart-<token>, ChartTheme[token]. */
export const PRODUCT_TOKEN = { energy: 'blue', regup: 'green', regdn: 'cyan', rrs: 'violet', ecrs: 'orange', nsrs: 'rose' } as const;

export const PRODUCT_LABEL: Record<Product, string> = {
  energy: 'Energy', regup: 'Reg Up', regdn: 'Reg Down', rrs: 'RRS', ecrs: 'ECRS', nsrs: 'Non-Spin',
};

export type StackRow = Record<Product, number> & { total: number };

export interface StackFile {
  meta: {
    year: number;
    durationH: number;
    mode: StackMode;
    products: string[];
    partialYear: boolean;
    monthsCovered: number;
    rtcb: RtcbEra;
    assumptions: string[];
    sources: string[];
    generated: string;
  };
  nodes: Record<string, StackRow>;
}

/** Fixture files say so in meta.generated. The UI shows a banner whenever one is loaded. */
export const isFixture = (f: StackFile | null | undefined): boolean => !!f && /^FIXTURE/.test(f.meta.generated);

/** Sum of the six products; equals `total` in a valid file. */
export const sumProducts = (r: StackRow): number => PRODUCTS.reduce((s, p) => s + r[p], 0);

/** Ancillary part of the stack: everything except energy. */
export const asOf = (r: StackRow): number => r.total - r.energy;

/** True when `total` equals the sum of the products to the cent (files round each field to two decimals). */
export const stackAdds = (r: StackRow, tol = 0.011): boolean => Math.abs(sumProducts(r) - r.total) <= tol;

export const eraLabel = (e: RtcbEra): string => (e === 'pre' ? 'Before RTC+B' : e === 'post' ? 'After RTC+B' : 'Spans RTC+B go-live');

/**
 * Era of a year from the go-live date alone, for years whose file is missing: before the go-live year is pre, after is post,
 * the go-live year itself is mixed. A loaded file's own `meta.rtcb` wins.
 */
export function eraOfYear(year: number, goLive = RTCB_GO_LIVE): RtcbEra {
  const y = Number(goLive.slice(0, 4));
  return year < y ? 'pre' : year > y ? 'post' : 'mixed';
}

/** "2026 YTD (10 months)" for a partial year, the plain year otherwise. */
export const yearTag = (m: StackFile['meta']): string => (m.partialYear ? `${m.year} YTD (${m.monthsCovered} months)` : String(m.year));

/** File path under the data folder. */
export const stackPath = (year: number, durationH: number, mode: StackMode): string => `v4/stack/${year}_${durationH}h_${mode}.json`;

export interface YearStack {
  year: number;
  meta: StackFile['meta'];
  /** Realistic mode: the bars. Null when only the upper bound exists for this location. */
  realistic: StackRow | null;
  /** Foresight mode: the upper bound. Null when no foresight file has this location. */
  foresight: StackRow | null;
}

/** One entry per year that has a row for `code` in at least one mode, oldest first. */
export function yearStacks(code: string, files: { realistic: Map<number, StackFile>; foresight: Map<number, StackFile> }): YearStack[] {
  const years = [...new Set([...files.realistic.keys(), ...files.foresight.keys()])].sort((a, b) => a - b);
  const out: YearStack[] = [];
  for (const year of years) {
    const real = files.realistic.get(year);
    const fore = files.foresight.get(year);
    const realistic = real?.nodes[code] ?? null;
    const foresight = fore?.nodes[code] ?? null;
    const meta = (real ?? fore)!.meta;
    if (realistic || foresight) out.push({ year, meta, realistic, foresight });
  }
  return out;
}

/** The range shown beside a headline: realistic total to foresight total. Either end can be missing. */
export function totalRange(realistic: StackRow | null, foresight: StackRow | null): { low: number | null; high: number | null } {
  return { low: realistic ? realistic.total : null, high: foresight ? foresight.total : null };
}

/**
 * Atlas: the all-node file with each node's `rev` replaced by its stack total (or its energy part), so the existing map,
 * colour scale and ranking recompute for the new metric with no change of their own. Nodes with no stack row get rev = null
 * and drop off the map.
 */
export function withStackRevenue(nodes: NodeRec[], file: StackFile, field: 'total' | 'energy' = 'total'): { nodes: NodeRec[]; missing: number } {
  let missing = 0;
  const out = nodes.map((n) => {
    const row = file.nodes[n.code];
    if (!row) missing++;
    return { ...n, rev: row ? row[field] : (null as unknown as number) };
  });
  return { nodes: out, missing };
}

/** Rows for the CSV of a location's stack: one row per year and mode. */
export function stackCsv(years: YearStack[]): { headers: string[]; rows: (string | number | null)[][] } {
  const headers = ['Year', 'Mode', 'Basis', ...PRODUCTS.map((p) => `${PRODUCT_LABEL[p]} ($/kW-yr)`), 'Total ($/kW-yr)', 'RTC+B'];
  const rows: (string | number | null)[][] = [];
  for (const y of years) {
    for (const [mode, row] of [['realistic', y.realistic], ['foresight', y.foresight]] as const) {
      if (row) rows.push([y.year, mode, yearTag(y.meta), ...PRODUCTS.map((p) => row[p]), row.total, y.meta.rtcb]);
    }
  }
  return { headers, rows };
}
