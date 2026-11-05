import type { Place } from './types';

/** bounds = [west, south, east, north], used to zoom to a county. */
export type Bounds = [number, number, number, number];
export interface CountyInput { name: string; lat: number; lon: number; bounds?: Bounds }
export interface SearchHit { kind: 'county' | 'city' | 'latlon'; label: string; sub: string; lat: number; lon: number; bounds?: Bounds }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Texas bounds with a margin. A point outside is not a Texas site. */
export const TX_BOUNDS = { south: 25.5, north: 36.8, west: -106.9, east: -93.3 };
export const inTexas = (lat: number, lon: number) => lat >= TX_BOUNDS.south && lat <= TX_BOUNDS.north && lon >= TX_BOUNDS.west && lon <= TX_BOUNDS.east;

/**
 * "33.2, -98.2", "33.2 -98.2", "33.2N 98.2W", "lat 33.2 lon -98.2". Returns null unless it reads as two numbers in range.
 * A positive longitude with no E is read as west, since every Texas longitude is west.
 */
export function parseLatLon(q: string): { lat: number; lon: number } | null {
  const s = q.trim().toLowerCase().replace(/[°,;]/g, ' ').replace(/\b(lat|latitude|lon|lng|long|longitude)\b/g, ' ');
  const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*([ns])?\s+(-?\d+(?:\.\d+)?)\s*([ew])?\s*$/);
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (m[2] === 's') lat = -Math.abs(lat);
  if (m[4] === 'w') lon = -Math.abs(lon);
  else if (m[4] === 'e') lon = Math.abs(lon);
  else if (lon > 0 && lat > 0 && lon <= 180) lon = -lon;
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  return { lat, lon };
}

/** Rank: exact name, then name starts with the query, then a word starts with it. Lower is better; -1 = no match. */
function rank(name: string, q: string): number {
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.split(' ').some((w) => w.startsWith(q))) return 2;
  return -1;
}

export interface SearchIndex { entries: (SearchHit & { kind: 'county' | 'city'; names: string[] })[] }

/**
 * Index of county names (matched with or without "County") and place names. County points are supplied by the caller
 * (the centre of the county outline), so this module needs no geometry code.
 */
export function buildSearchIndex(counties: CountyInput[], places: Place[]): SearchIndex {
  const entries: SearchIndex['entries'] = [];
  for (const c of counties) {
    const n = norm(c.name);
    entries.push({ kind: 'county', label: `${c.name} County`, sub: 'County', lat: c.lat, lon: c.lon, bounds: c.bounds, names: [n, `${n} county`] });
  }
  for (const p of places) {
    entries.push({ kind: 'city', label: p.name, sub: p.county ? `City, ${p.county} County` : 'City', lat: p.lat, lon: p.lon, names: [norm(p.name)] });
  }
  return { entries };
}

/** Matches for a typed query, best first. A "lat, lon" query returns one point result. */
export function searchSites(index: SearchIndex, query: string, limit = 8): SearchHit[] {
  const ll = parseLatLon(query);
  if (ll) return [{ kind: 'latlon', label: `${ll.lat}, ${ll.lon}`, sub: inTexas(ll.lat, ll.lon) ? 'Point' : 'Outside Texas', lat: ll.lat, lon: ll.lon }];
  const q = norm(query);
  if (!q) return [];
  const asCounty = q.replace(/ county$/, '');
  const hits: { r: number; tie: number; hit: SearchHit }[] = [];
  for (const e of index.entries) {
    let best = -1;
    for (const name of e.names) {
      for (const cand of e.kind === 'county' ? [q, asCounty] : [q]) {
        const r = rank(name, cand);
        if (r >= 0 && (best < 0 || r < best)) best = r;
      }
    }
    if (best >= 0) hits.push({ r: best, tie: e.kind === 'city' ? 0 : 1, hit: { kind: e.kind, label: e.label, sub: e.sub, lat: e.lat, lon: e.lon, bounds: e.bounds } });
  }
  hits.sort((a, b) => a.r - b.r || a.tie - b.tie || (a.hit.label < b.hit.label ? -1 : 1));
  return hits.slice(0, limit).map((h) => h.hit);
}
