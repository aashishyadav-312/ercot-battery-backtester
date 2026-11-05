// Site Value card: the pure model. Given the nearest nodes to a pinned site and the loaded result files, it returns the
// $/kW-yr range, the year strip, the shareable URL, the CSV and the Studio link. No UI imports, so the tests can rebuild every figure.

import type { HubRec, IndexRun, NodeRec, NodesFile } from '../../data/types';
import { SITE_DEFAULT_DURATION_H, SITE_DEG } from '../config';
import type { StackFile, StackMode } from '../stack';
import type { NodeFileKey, StackKey } from './stackIndex';

export type Basis = 'energy' | 'stack';
export interface Settings { year: number; durationH: number; mode: StackMode; basis: Basis }

/** What the card knows about the result files. `nodeFiles` and `stackFiles` are the ones loaded for the chosen size (and mode). */
export interface SiteData {
  manifest: NodeFileKey[];
  runs: IndexRun[];
  stackKeys: StackKey[];
  nodeFiles: Map<number, NodesFile>;
  stackFiles: Map<number, StackFile>;
}
export const EMPTY_DATA: SiteData = { manifest: [], runs: [], stackKeys: [], nodeFiles: new Map(), stackFiles: new Map() };

// ---------------------------------------------------------------- what exists

const hubRuns = (runs: IndexRun[], durationH: number) => runs.filter((r) => r.location_type === 'hub' && r.duration_h === durationH && r.deg_cost_per_mwh === SITE_DEG);

/** Years with a result for this basis, size and mode, oldest first. Energy: an all-node file, or a hub run for the same size. */
export function yearsFor(d: Pick<SiteData, 'manifest' | 'runs' | 'stackKeys'>, basis: Basis, durationH: number, mode: StackMode): number[] {
  const ys = new Set<number>();
  if (basis === 'energy') {
    d.manifest.filter((f) => f.durationH === durationH).forEach((f) => ys.add(f.year));
    hubRuns(d.runs, durationH).forEach((r) => ys.add(r.year));
  } else d.stackKeys.filter((k) => k.durationH === durationH && k.mode === mode).forEach((k) => ys.add(k.year));
  return [...ys].sort((a, b) => a - b);
}

export function durationsFor(d: Pick<SiteData, 'manifest' | 'runs' | 'stackKeys'>, basis: Basis, mode: StackMode): number[] {
  const all = new Set<number>();
  if (basis === 'energy') {
    d.manifest.forEach((f) => all.add(f.durationH));
    d.runs.filter((r) => r.location_type === 'hub' && r.deg_cost_per_mwh === SITE_DEG).forEach((r) => all.add(r.duration_h));
  } else d.stackKeys.filter((k) => k.mode === mode).forEach((k) => all.add(k.durationH));
  return [...all].sort((a, b) => a - b);
}

export const modesFor = (d: Pick<SiteData, 'stackKeys'>, basis: Basis, durationH?: number): StackMode[] =>
  basis === 'energy' ? ['realistic', 'foresight'] : (['realistic', 'foresight'] as StackMode[]).filter((m) => d.stackKeys.some((k) => k.mode === m && (durationH == null || k.durationH === durationH)));

export const hasFullStack = (d: Pick<SiteData, 'stackKeys'>): boolean => d.stackKeys.length > 0;

/** Snap a wanted setting to one that has data: Energy if there is no stack, the usual size if it exists, else the latest year with node-level results. */
export function resolveSettings(want: Partial<Settings>, d: Pick<SiteData, 'manifest' | 'runs' | 'stackKeys'>): Settings {
  let basis: Basis = want.basis === 'stack' && hasFullStack(d) ? 'stack' : 'energy';
  let mode: StackMode = want.mode === 'foresight' ? 'foresight' : 'realistic';
  if (basis === 'stack' && !modesFor(d, 'stack').includes(mode)) mode = modesFor(d, 'stack')[0] ?? mode;
  let durs = durationsFor(d, basis, mode);
  if (basis === 'stack' && !durs.length) { basis = 'energy'; durs = durationsFor(d, basis, mode); }
  const durationH = want.durationH != null && durs.includes(want.durationH) ? want.durationH : durs.includes(SITE_DEFAULT_DURATION_H) ? SITE_DEFAULT_DURATION_H : durs[0] ?? SITE_DEFAULT_DURATION_H;
  const years = yearsFor(d, basis, durationH, mode);
  // The year to open on is the latest with a node-level result; a hub-only year (the study-site runs) is reachable from the strip.
  const nodeYears = basis === 'energy' ? years.filter((y) => d.manifest.some((f) => f.year === y && f.durationH === durationH)) : years;
  const year = want.year != null && years.includes(want.year) ? want.year : (nodeYears.length ? nodeYears : years).slice(-1)[0] ?? want.year ?? 0;
  return { year, durationH, mode, basis };
}

// ---------------------------------------------------------------- range

export interface NearIn { code: string; km: number }
export interface NodeVal { code: string; km: number; value: number }
export interface Range { min: number; max: number; median: number; n: number; of: number; nodes: NodeVal[] }

export function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Min, median and max of the nodes that have a value; `of` is how many nodes were asked. Null when none has one. */
export function rangeOf(vals: NodeVal[], of: number): Range | null {
  if (!vals.length) return null;
  const v = vals.map((x) => x.value);
  return { min: Math.min(...v), max: Math.max(...v), median: medianOf(v), n: vals.length, of, nodes: vals };
}

/** Energy value of a node row in a mode: perfect foresight is the upper bound, the day-ahead plan is the realistic one. */
export const energyOf = (n: Pick<NodeRec | HubRec, 'rev' | 'da_rev'>, mode: StackMode): number => (mode === 'foresight' ? n.rev : n.da_rev);

export interface Point {
  year: number;
  /** "2026" or "2026 YTD, annualized". */
  label: string;
  partial: boolean;
  /** Range over the nearest nodes; null when the year has only a hub value or no result for these nodes. */
  range: Range | null;
  hubCode: string | null;
  hub: number | null;
}

export const yearLabel = (year: number, partial: boolean) => (partial ? `${year} YTD, annualized` : String(year));

const byCode = new WeakMap<object, Map<string, NodeRec>>();
function nodeMap(f: NodesFile): Map<string, NodeRec> {
  let m = byCode.get(f);
  if (!m) { m = new Map(f.nodes.map((n) => [n.code, n])); byCode.set(f, m); }
  return m;
}

/** One year of the card for these nearest nodes (nearest first) and hub. Never invents a value: a missing one stays null. */
export function pointFor(year: number, s: Pick<Settings, 'durationH' | 'mode' | 'basis'>, near: NearIn[], hubCode: string | null, d: SiteData): Point {
  if (s.basis === 'stack') {
    const f = d.stackFiles.get(year);
    if (!f) return { year, label: yearLabel(year, false), partial: false, range: null, hubCode, hub: null };
    const vals = near.flatMap((n) => (f.nodes[n.code] ? [{ code: n.code, km: n.km, value: f.nodes[n.code].total }] : []));
    return { year, label: yearLabel(year, f.meta.partialYear), partial: f.meta.partialYear, range: rangeOf(vals, near.length), hubCode, hub: hubCode ? f.nodes[hubCode]?.total ?? null : null };
  }
  const f = d.nodeFiles.get(year);
  const run = hubCode ? hubRuns(d.runs, s.durationH).find((r) => r.location === hubCode && r.year === year) : undefined;
  if (f) {
    const m = nodeMap(f);
    const vals = near.flatMap((n) => { const r = m.get(n.code); return r ? [{ code: n.code, km: n.km, value: energyOf(r, s.mode) }] : []; });
    const hubRow = hubCode ? f.hubs.find((h) => h.code === hubCode) : undefined;
    return { year, label: yearLabel(year, false), partial: false, range: rangeOf(vals, near.length), hubCode, hub: hubRow ? energyOf(hubRow, s.mode) : null };
  }
  // No all-node file for this year: only the hub value exists, from the study-site runs.
  const hubValue = run ? (s.mode === 'foresight' ? run.revenue_per_kw_year : run.da_rt_revenue_per_kw_year ?? null) : null;
  return { year, label: yearLabel(year, !!run?.annualized), partial: !!run?.annualized, range: null, hubCode, hub: hubValue };
}

/** The year strip: one point per year that has a result for the chosen basis, size and mode. */
export function stripFor(s: Settings, near: NearIn[], hubCode: string | null, d: SiteData): Point[] {
  return yearsFor(d, s.basis, s.durationH, s.mode).map((y) => pointFor(y, s, near, hubCode, d));
}

// ---------------------------------------------------------------- URL

export interface SiteLink { lat: number; lon: number; year?: number; durationH?: number; mode?: StackMode; basis?: Basis }
const KEYS = ['lat', 'lon', 'dur', 'year', 'mode', 'basis'] as const;

const splitHash = (hash: string): [string, URLSearchParams] => {
  const i = hash.indexOf('?');
  return i < 0 ? [hash, new URLSearchParams()] : [hash.slice(0, i), new URLSearchParams(hash.slice(i + 1))];
};
const join = (path: string, q: URLSearchParams) => (q.toString() ? `${path}?${q}` : path);

/** `site` null removes the site keys. Other parameters (loc, deg, v4, ...) are kept. A basis of Energy is the default and is not written. */
export function writeSiteToHash(hash: string, site: { lat: number; lon: number } | null, s: Settings | null): string {
  const [path, q] = splitHash(hash || '#/atlas');
  KEYS.forEach((k) => q.delete(k));
  if (site && s) {
    q.set('lat', site.lat.toFixed(4));
    q.set('lon', site.lon.toFixed(4));
    q.set('dur', String(s.durationH));
    q.set('year', String(s.year));
    q.set('mode', s.mode);
    if (s.basis === 'stack') q.set('basis', 'stack');
  }
  return join(path, q);
}

/** Reads a shared site. Null when lat and lon are missing or not numbers. Settings that are missing or odd are left out. */
export function readSiteFromHash(hash: string): SiteLink | null {
  const [, q] = splitHash(hash);
  const lat = q.get('lat');
  const lon = q.get('lon');
  if (lat == null || lon == null || lat.trim() === '' || lon.trim() === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
  const out: SiteLink = { lat: Number(lat), lon: Number(lon) };
  const dur = Number(q.get('dur'));
  const year = Number(q.get('year'));
  if (q.get('dur') && Number.isFinite(dur) && dur > 0) out.durationH = dur;
  if (q.get('year') && Number.isInteger(year)) out.year = year;
  const mode = q.get('mode');
  if (mode === 'foresight' || mode === 'realistic') out.mode = mode;
  if (q.get('basis') === 'stack') out.basis = 'stack';
  return out;
}

/** Studio opens on a location that has price files, with the size, year and strategy of the card. */
export function studioHash(location: string, s: Pick<Settings, 'durationH' | 'year' | 'mode'>): string {
  return `#/studio?${new URLSearchParams({ loc: location, dur: String(s.durationH), year: String(s.year), strat: s.mode === 'foresight' ? 'pf' : 'da' })}`;
}

/** The nearest of these places that Studio has price files for; the hub when no node qualifies. */
export function studioLocation(near: NearIn[], hubCode: string | null, priceLocations: Set<string>): string | null {
  return near.find((n) => priceLocations.has(n.code))?.code ?? (hubCode && priceLocations.has(hubCode) ? hubCode : null);
}

// ---------------------------------------------------------------- CSV

export interface CsvSite { name: string; lat: number; lon: number }
export const CSV_HEADERS = ['Site', 'Latitude', 'Longitude', 'Year', 'Basis', 'Mode', 'Duration (h)', 'Row', 'Location', 'Distance (km)', '$/kW-yr'];

/** One row per year and nearest node, then the nearest hub and the min, median and max, for every year in the strip. */
export function siteCsv(site: CsvSite, s: Settings, strip: Point[]): { headers: string[]; rows: (string | number | null)[][] } {
  const basis = s.basis === 'stack' ? 'Full stack' : 'Energy';
  const mode = s.mode === 'foresight' ? 'Perfect foresight' : 'Day-ahead plan';
  const rows: (string | number | null)[][] = [];
  const base = (p: Point) => [site.name, site.lat, site.lon, p.label, basis, mode, s.durationH] as const;
  for (const p of strip) {
    if (p.range) {
      p.range.nodes.forEach((n) => rows.push([...base(p), 'Node', n.code, round(n.km, 1), n.value]));
      rows.push([...base(p), 'Minimum', null, null, p.range.min], [...base(p), 'Median', null, null, p.range.median], [...base(p), 'Maximum', null, null, p.range.max]);
    }
    if (p.hubCode && p.hub != null) rows.push([...base(p), 'Nearest hub', p.hubCode, null, p.hub]);
  }
  return { headers: CSV_HEADERS, rows };
}
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
