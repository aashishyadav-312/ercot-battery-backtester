// Site report: the pure parts. Link, storage wording, and the CSV block. No UI imports, so the tests can rebuild every figure.

import { MONTHS, num } from '../../data/format';
import type { SheetStorage } from '../../v4/site/SitePrint';
import { siteCsv, readSiteFromHash, type CsvSite, type Point, type Settings, type SiteLink } from '../../v4/site/siteValue';
import type { BatteriesFile, NearbyBatteries, NearbyUnit } from '../nearby';

/**
 * `#/site?lat=&lon=&dur=&year=[&basis=stack]`. The strategy is written only when it is the non-default one. Pass the current hash
 * to keep its other parameters (such as `v5=1`); the site and settings keys are replaced.
 */
export function siteReportHash(site: { lat: number; lon: number }, s: Settings, current = ''): string {
  const i = current.indexOf('?');
  const q = new URLSearchParams(i < 0 ? '' : current.slice(i + 1));
  ['lat', 'lon', 'dur', 'year', 'basis', 'mode'].forEach((k) => q.delete(k));
  const out = new URLSearchParams({ lat: site.lat.toFixed(4), lon: site.lon.toFixed(4), dur: String(s.durationH), year: String(s.year) });
  if (s.basis === 'stack') out.set('basis', 'stack');
  if (s.mode === 'foresight') out.set('mode', 'foresight');
  q.forEach((v, k) => out.append(k, v));
  return `#/site?${out}`;
}

/** The site named by the address, or why there is none. Coordinates must be numbers; the caller checks Texas. */
export const readReport = (hash: string): SiteLink | null => readSiteFromHash(hash);

/** "2026-09" to "September 2026". Anything else comes back as written. */
export function releaseLabel(release: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(release);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return release;
  return `${new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${m[1]}`;
}

/** "2026-03" to "Mar 2026"; null when EIA gives no date. */
export function onlineLabel(online: string | null): string {
  const m = online ? /^(\d{4})-(\d{2})$/.exec(online) : null;
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : 'no date';
}

export const mwLabel = (mw: number) => `${num(mw, 0)} MW`;
export const kmLabel = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));
const unitWord = (n: number) => (n === 1 ? 'unit' : 'units');

/** Shape of the file, checked before use. A file that does not look right is treated as missing. */
export function parseBatteries(x: unknown): BatteriesFile | null {
  const f = x as Partial<BatteriesFile> | null;
  if (!f || typeof f !== 'object' || !Array.isArray(f.units) || typeof f.release !== 'string' || typeof f.sourceUrl !== 'string') return null;
  const ok = f.units.every((u) => u && Number.isFinite(u.lat) && Number.isFinite(u.lon) && Number.isFinite(u.mw) && (u.status === 'operating' || u.status === 'planned'));
  return ok ? (f as BatteriesFile) : null;
}

/** The two summary sentences of the section. */
export function storageLines(n: NearbyBatteries, radiusKm: number): string[] {
  return [
    `Within ${radiusKm} km: ${mwLabel(n.operatingMw)} operating in ${n.operatingCount} ${unitWord(n.operatingCount)}, and ${mwLabel(n.plannedMw)} planned in ${n.plannedCount} ${unitWord(n.plannedCount)}.`,
  ];
}

export const statusLabel = (u: Pick<NearbyUnit, 'status'>) => (u.status === 'operating' ? 'Operating' : 'Planned');

/** The block printed with the sheet. */
export function storageSheet(file: BatteriesFile, n: NearbyBatteries, radiusKm: number): SheetStorage {
  return {
    heading: 'Storage nearby',
    lines: storageLines(n, radiusKm),
    rows: n.nearest.map((u) => ({ name: u.name, status: statusLabel(u), mw: num(u.mw, 0), distance: kmLabel(u.distanceKm), online: onlineLabel(u.online) })),
    source: `Source: ${file.source}, release ${releaseLabel(file.release)}. ${file.sourceUrl}`,
  };
}

/**
 * The V4 site CSV, then the Storage nearby block under it (a blank line, then its own header rows). The block has its own columns
 * because a storage row has no $/kW-yr; a spreadsheet opens it as a second table.
 */
export function reportCsv(site: CsvSite, s: Settings, strip: Point[], storage: { file: BatteriesFile; near: NearbyBatteries; radiusKm: number } | null) {
  const { headers, rows } = siteCsv(site, s, strip);
  if (!storage) return { headers, rows };
  const { file, near, radiusKm } = storage;
  const out: (string | number | null)[][] = [...rows, [], ['Storage nearby'], ['Radius (km)', 'Operating MW', 'Operating units', 'Planned MW', 'Planned units', 'EIA-860M release', 'Source']];
  out.push([radiusKm, round(near.operatingMw), near.operatingCount, round(near.plannedMw), near.plannedCount, file.release, file.sourceUrl]);
  out.push(['Nearest units'], ['Unit', 'Status', 'MW', 'Distance (km)', 'Online', 'County', 'Owner']);
  near.nearest.forEach((u) => out.push([u.name, statusLabel(u), round(u.mw), round(u.distanceKm, 1), u.online, u.county, u.owner]));
  return { headers, rows: out };
}
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
