import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Topology } from 'topojson-specification';
import { countiesGeoJson } from './load';
import { countyAt, nearestPlace } from './place';
import type { Place } from './types';

const geo = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), '../results/v4/geo', f), 'utf8'));
const fc = countiesGeoJson(geo('tx_counties.topo.json') as Topology);

describe('where a point is', () => {
  it('finds the county that contains it', () => {
    expect(countyAt(fc, 33.2, -98.2)).toBe('Jack');
    expect(countyAt(fc, 29.76, -95.37)).toBe('Harris');
  });
  it('is null outside Texas', () => {
    expect(countyAt(fc, 40, -98)).toBeNull();
  });
  it('finds the nearest listed city', () => {
    const places = geo('places.json') as Place[];
    const hit = nearestPlace(places, 29.76, -95.37)!;
    expect(hit.place.name).toBe('Houston');
    expect(hit.km).toBeLessThan(10);
    expect(nearestPlace([], 1, 1)).toBeNull();
  });
});
