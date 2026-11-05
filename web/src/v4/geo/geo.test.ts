import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Topology } from 'topojson-specification';
import { countiesGeoJson } from './load';
import { haversineKm, nearestNodes } from './nearest';
import { buildSearchIndex, inTexas, parseLatLon, searchSites } from './search';
import type { NodeIndex, Place } from './types';
import type { CountyInput } from './search';

// Tests run from web/, so the committed data is one level up.
const dir = resolve(process.cwd(), '../results/v4/geo');
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
const COUNTIES = read<(CountyInput & { fips: string })[]>('county_index.json');
const PLACES = read<Place[]>('places.json');
const NODES = read<NodeIndex>('node_index.json');
const INDEX = buildSearchIndex(COUNTIES, PLACES);

describe('lat/long parsing', () => {
  it('reads common forms', () => {
    expect(parseLatLon('33.2, -98.2')).toEqual({ lat: 33.2, lon: -98.2 });
    expect(parseLatLon('33.2 -98.2')).toEqual({ lat: 33.2, lon: -98.2 });
    expect(parseLatLon('33.2N 98.2W')).toEqual({ lat: 33.2, lon: -98.2 });
    expect(parseLatLon('lat 33.2 lon -98.2')).toEqual({ lat: 33.2, lon: -98.2 });
    expect(parseLatLon('33.2, 98.2')).toEqual({ lat: 33.2, lon: -98.2 }); // Texas longitudes are all west
  });
  it('rejects text, one number and out-of-range values', () => {
    expect(parseLatLon('jack')).toBeNull();
    expect(parseLatLon('33.2')).toBeNull();
    expect(parseLatLon('133.2, -98.2')).toBeNull();
    expect(parseLatLon('')).toBeNull();
  });
  it('knows what is inside Texas', () => {
    expect(inTexas(33.2, -98.2)).toBe(true);
    expect(inTexas(40, -98.2)).toBe(false);
  });
});

describe('site search', () => {
  it('finds a county with or without the word County, any case', () => {
    for (const q of ['Jack County', 'jack', 'JACK county', ' jack ']) {
      const hit = searchSites(INDEX, q)[0];
      expect(hit.label).toBe('Jack County');
      expect(hit.kind).toBe('county');
    }
  });
  it('finds a place by name and ranks an exact name first', () => {
    const r = searchSites(INDEX, 'austin');
    expect(r[0]).toMatchObject({ kind: 'city', label: 'Austin' });
    expect(searchSites(INDEX, 'lubb')[0].label).toBe('Lubbock');
  });
  it('returns a point for lat/long input and nothing for gibberish', () => {
    expect(searchSites(INDEX, '33.2, -98.2')[0]).toMatchObject({ kind: 'latlon', lat: 33.2, lon: -98.2 });
    expect(searchSites(INDEX, 'zzzzqq')).toEqual([]);
    expect(searchSites(INDEX, '')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(searchSites(INDEX, 'c', 3).length).toBeLessThanOrEqual(3);
  });
  it('county results carry bounds that contain the county point', () => {
    const jack = searchSites(INDEX, 'Jack County')[0];
    const [w, s, e, n] = jack.bounds!;
    expect(jack.lon).toBeGreaterThan(w);
    expect(jack.lon).toBeLessThan(e);
    expect(jack.lat).toBeGreaterThan(s);
    expect(jack.lat).toBeLessThan(n);
  });
});

describe('distance and nearest nodes', () => {
  it('haversine matches a known pair (Dallas to Houston, about 361 km)', () => {
    expect(haversineKm(32.7767, -96.797, 29.7604, -95.3698)).toBeGreaterThan(355);
    expect(haversineKm(32.7767, -96.797, 29.7604, -95.3698)).toBeLessThan(367);
    expect(haversineKm(31, -99, 31, -99)).toBe(0);
  });
  const small: NodeIndex = {
    HB_NORTH: { lat: 32.78, lon: -96.8, county: 'Dallas', nearestCity: 'Dallas', cityKm: 1, kind: 'hub', precision: 'hub', hub: 'HB_NORTH' },
    A_RN: { lat: 33.0, lon: -98.0, county: 'Jack', nearestCity: 'Wichita Falls', cityKm: 90, kind: 'node', precision: 'plant', hub: 'HB_NORTH' },
    B_RN: { lat: 33.5, lon: -98.0, county: 'Young', nearestCity: 'Wichita Falls', cityKm: 70, kind: 'node', precision: 'county', hub: 'HB_NORTH' },
    C_RN: { lat: 29.0, lon: -98.0, county: 'Atascosa', nearestCity: 'San Antonio', cityKm: 60, kind: 'node', precision: 'plant', hub: 'HB_SOUTH' },
  };
  it('returns k nodes nearest first, hubs separate', () => {
    const r = nearestNodes(small, 33.1, -98.0, 2);
    expect(r.nodes.map((n) => n.code)).toEqual(['A_RN', 'B_RN']);
    expect(r.nodes[0].km).toBeLessThan(r.nodes[1].km);
    expect(r.nearestHub?.code).toBe('HB_NORTH');
    expect(r.zoneHub).toBe('HB_NORTH');
    expect(nearestNodes(small, 33.1, -98.0, 10).nodes).toHaveLength(3);
  });
  it('works on the real index: a Jack County point is near North-zone nodes', () => {
    const jack = COUNTIES.find((c) => c.name === 'Jack')!;
    const r = nearestNodes(NODES, jack.lat, jack.lon, 3);
    expect(r.nodes).toHaveLength(3);
    expect(r.nodes[0].km).toBeLessThanOrEqual(r.nodes[2].km);
    expect(r.nearestHub?.code).toBe('HB_NORTH');
  });
});

describe('committed geo data', () => {
  it('counties file is small and covers 254 Texas counties', () => {
    expect(statSync(resolve(dir, 'tx_counties.topo.json')).size).toBeLessThan(300 * 1024);
    expect(COUNTIES).toHaveLength(254);
    expect(new Set(COUNTIES.map((c) => c.fips)).size).toBe(254);
    expect(COUNTIES.every((c) => c.fips.startsWith('48'))).toBe(true);
  });
  it('counties TopoJSON decodes to 254 features with name and FIPS matching the county index', () => {
    const fc = countiesGeoJson(read<Topology>('tx_counties.topo.json'));
    expect(fc.features).toHaveLength(254);
    const byFips = new Map(COUNTIES.map((c) => [c.fips, c.name]));
    for (const f of fc.features) expect(byFips.get(f.properties.fips)).toBe(f.properties.name);
  });
  it('places: at most 20, the 10 largest present, each with a county and a Texas point', () => {
    expect(PLACES.length).toBeLessThanOrEqual(20);
    expect(PLACES.length).toBeGreaterThanOrEqual(10);
    expect(PLACES.map((p) => p.name).slice(0, 3)).toEqual(['Houston', 'San Antonio', 'Dallas']);
    for (const p of PLACES) {
      expect(p.kind).toBe('city');
      expect(p.county).toBeTruthy();
      expect(inTexas(p.lat, p.lon)).toBe(true);
    }
    expect([...PLACES].sort((a, b) => b.pop - a.pop)).toEqual(PLACES);
  });
  it('node index: every entry has a county, a place and a distance; hubs are included', () => {
    const entries = Object.entries(NODES);
    expect(entries.length).toBeGreaterThan(400);
    for (const [code, n] of entries) {
      expect(n.county, code).toBeTruthy();
      expect(n.nearestCity, code).toBeTruthy();
      expect(n.cityKm, code).toBeGreaterThanOrEqual(0);
      expect(inTexas(n.lat, n.lon), code).toBe(true);
    }
    for (const h of ['HB_HOUSTON', 'HB_NORTH', 'HB_SOUTH', 'HB_WEST', 'HB_PAN']) expect(NODES[h]?.kind).toBe('hub');
  });
  it('every node in the 2025 results with coordinates is indexed', () => {
    const res = JSON.parse(readFileSync(resolve(process.cwd(), '../results/nodes_2025_2h.json'), 'utf8')) as { nodes: { code: string; lat: number | null }[] };
    const withCoords = res.nodes.filter((n) => n.lat != null);
    expect(withCoords.length).toBeGreaterThan(0);
    expect(withCoords.filter((n) => !NODES[n.code]).map((n) => n.code)).toEqual([]);
  });
  it('sources file lists the nodes without coordinates', () => {
    const src = read<{ nodes: { n_without_coordinates: number; without_coordinates: string[] } }>('SOURCES.json');
    expect(src.nodes.without_coordinates).toHaveLength(src.nodes.n_without_coordinates);
    expect(src.nodes.without_coordinates.some((c) => NODES[c])).toBe(false);
  });
});
