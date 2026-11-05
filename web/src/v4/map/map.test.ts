import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Topology } from 'topojson-specification';
import { VIEW_H, VIEW_W, project } from '../../data/home';
import { countiesGeoJson } from '../geo/load';
import type { CountyInput } from '../geo/search';
import type { Place } from '../geo/types';
import { labelRect, layoutCities, maxLabels } from './labels';
import {
  FULL_VIEW, MAX_ZOOM, PLACE_W, clampView, clientToLonLat, countyOpacity, countyPaths, panBy, unproject, viewAround, viewBox, viewForBounds, viewHeight, zoomBy, zoomOf,
} from './view';

const dir = resolve(process.cwd(), '../results/v4/geo');
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
const PLACES = read<Place[]>('places.json');
const COUNTIES = read<(CountyInput & { fips: string })[]>('county_index.json');
const TOPO = read<Topology>('tx_counties.topo.json');
const JACK = COUNTIES.find((c) => c.name === 'Jack')!;

describe('projection helpers', () => {
  it('unproject undoes project', () => {
    for (const [lat, lon] of [[33.2, -98.2], [29.76, -95.37], [31.9, -106.4]]) {
      const [x, y] = project(lon, lat);
      const p = unproject(x, y);
      expect(p.lat).toBeCloseTo(lat, 6);
      expect(p.lon).toBeCloseTo(lon, 6);
    }
  });
  it('a click maps to the point drawn under it, at any zoom', () => {
    const rect = { left: 100, top: 40, width: 310, height: 310 * (VIEW_H / VIEW_W) };
    const v = viewAround(JACK.lat, JACK.lon);
    const p = clientToLonLat(v, rect, rect.left + rect.width / 2, rect.top + rect.height / 2)!;
    expect(p.lat).toBeCloseTo(JACK.lat, 4);
    expect(p.lon).toBeCloseTo(JACK.lon, 4);
    expect(clientToLonLat(v, { ...rect, width: 0 }, 1, 1)).toBeNull();
  });
});

describe('zoom and pan', () => {
  it('the full view is zoom 1 and the whole drawing', () => {
    expect(zoomOf(FULL_VIEW)).toBe(1);
    expect(viewBox(FULL_VIEW)).toBe(`0.00 0.00 ${VIEW_W}.00 ${VIEW_H}.00`);
  });
  it('a county view holds the whole county and is never tighter than a place view', () => {
    const v = viewForBounds(JACK.bounds!);
    const [x0, y0] = project(JACK.bounds![0], JACK.bounds![3]);
    const [x1, y1] = project(JACK.bounds![2], JACK.bounds![1]);
    expect(v.w).toBeGreaterThanOrEqual(PLACE_W);
    expect(v.x).toBeLessThanOrEqual(x0);
    expect(v.x + v.w).toBeGreaterThanOrEqual(x1);
    expect(v.y).toBeLessThanOrEqual(y0);
    expect(v.y + viewHeight(v.w)).toBeGreaterThanOrEqual(y1);
  });
  it('stays inside the drawing and the zoom limits, at the edge too', () => {
    for (const c of COUNTIES) {
      const v = viewForBounds(c.bounds!);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.x + v.w).toBeLessThanOrEqual(VIEW_W + 1e-9);
      expect(v.y + viewHeight(v.w)).toBeLessThanOrEqual(VIEW_H + 1e-9);
    }
    expect(zoomOf(clampView({ x: 0, y: 0, w: 1 }))).toBeCloseTo(MAX_ZOOM);
    expect(panBy(FULL_VIEW, 500, 500)).toEqual(FULL_VIEW);
  });
  it('zooming in then out returns to the same centre', () => {
    const v = viewAround(JACK.lat, JACK.lon, 200);
    const back = zoomBy(zoomBy(v, 1.6), 1 / 1.6);
    expect(back.x).toBeCloseTo(v.x);
    expect(back.w).toBeCloseTo(v.w);
    expect(zoomBy(FULL_VIEW, 1 / 1.6)).toEqual(FULL_VIEW);
  });
  it('county lines fade in between the full view and mid zoom', () => {
    expect(countyOpacity(1)).toBe(0);
    expect(countyOpacity(1.7)).toBeGreaterThan(0);
    expect(countyOpacity(1.7)).toBeLessThan(1);
    expect(countyOpacity(3)).toBe(1);
  });
});

describe('county outlines', () => {
  const paths = countyPaths(countiesGeoJson(TOPO));
  it('has a path for every county, found by name', () => {
    expect(paths.byName.size).toBe(COUNTIES.length);
    expect(paths.byName.get('Jack')).toMatch(/^M[\d. L-]+Z$/);
    expect(paths.all.length).toBeGreaterThan(paths.byName.get('Jack')!.length);
  });
  it('draws every point inside the map box', () => {
    const nums = paths.all.match(/-?\d+\.\d/g)!.map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...nums)).toBeLessThanOrEqual(Math.max(VIEW_W, VIEW_H) + 1);
  });
});

describe('city labels', () => {
  const overlap = (a: ReturnType<typeof labelRect>, b: ReturnType<typeof labelRect>) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const clash = (view = FULL_VIEW) => {
    const { labels, marks } = layoutCities(PLACES, view);
    const rects = labels.map(labelRect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBe(false);
      for (const m of marks) expect(overlap(rects[i], { x0: m.x - m.size / 2, y0: m.y - m.size / 2, x1: m.x + m.size / 2, y1: m.y + m.size / 2 })).toBe(false);
    }
    return { labels, marks };
  };
  it('no label touches another label or a city marker, at the full view and zoomed', () => {
    clash();
    for (const p of PLACES) clash(viewAround(p.lat, p.lon, 160));
    clash(viewAround(32, -97, 280));
  });
  it('shows fewer labels at low zoom, biggest cities first', () => {
    const { labels, marks } = clash();
    expect(labels.length).toBeLessThanOrEqual(maxLabels(1));
    expect(marks.length).toBe(PLACES.length);
    const biggest = [...PLACES].sort((a, b) => b.pop - a.pop)[0].name;
    expect(labels[0].name).toBe(biggest);
    expect(maxLabels(1)).toBeLessThan(maxLabels(3));
  });
  it('keeps only what is in view', () => {
    const houston = PLACES.find((p) => p.name === 'Houston')!;
    const { marks, labels } = layoutCities(PLACES, viewAround(houston.lat, houston.lon, 120));
    expect(marks.map((m) => m.name)).toContain('Houston');
    expect(marks.length).toBeLessThan(PLACES.length);
    expect(labels.map((l) => l.name)).toContain('Houston');
  });
  it('label text stays one size on screen as the map zooms', () => {
    const a = layoutCities(PLACES, FULL_VIEW).labels[0];
    const b = layoutCities(PLACES, viewAround(29.78, -95.38, FULL_VIEW.w / 4)).labels[0];
    expect(a.fontSize * zoomOf(FULL_VIEW)).toBeCloseTo(b.fontSize * 4);
  });
});
