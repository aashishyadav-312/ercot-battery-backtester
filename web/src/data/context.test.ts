import { describe, it, expect } from 'vitest';
import { avgShareByHour, countyKey, describeFleetRevenue, joinFleetRevenue, weatherCity, weatherOn, type ContextFile } from './context';
import type { LocationRec } from './types';

const ctx = {
  weather: {
    first_day: '2024-01-01',
    cities: {
      Houston: { hub: 'HB_HOUSTON', lat: 29.76, lon: -95.37, tmax_f: [60, 61, null], tmin_f: [40, 41, 42] },
      Midland: { hub: 'HB_WEST', lat: 32.0, lon: -102.08, tmax_f: [70, 71, 72], tmin_f: [50, 51, 52] },
    },
  },
} as unknown as ContextFile;

describe('weather lookup', () => {
  it('indexes days from the first day of the file', () => {
    expect(weatherOn(ctx, 'Houston', '2024-01-02')).toEqual({ city: 'Houston', hi: 61, lo: 41 });
  });
  it('returns nothing for a missing value, an earlier date or an unknown city', () => {
    expect(weatherOn(ctx, 'Houston', '2024-01-03')).toBeUndefined();
    expect(weatherOn(ctx, 'Houston', '2023-12-31')).toBeUndefined();
    expect(weatherOn(ctx, 'Houston', '2024-02-01')).toBeUndefined();
    expect(weatherOn(ctx, 'Nowhere', '2024-01-01')).toBeUndefined();
  });
  it('uses the hub city for hubs and the closest city for a node', () => {
    const node = { code: 'X_RN', lat: 31.2, lon: -101.5 } as LocationRec;
    expect(weatherCity('HB_HOUSTON', ctx, [])).toBe('Houston');
    expect(weatherCity('X_RN', ctx, [node])).toBe('Midland');
    expect(weatherCity('NOPE', ctx, [node])).toBeUndefined();
    expect(weatherCity('X_RN', ctx, [{ code: 'X_RN', lat: null, lon: null } as LocationRec])).toBeUndefined();
  });
});

describe('fleet against revenue', () => {
  const fleet = Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, '0')}`, mw: 1000 + i * 500, mwh: 0, units: 1 }));
  it('keeps only months that have a fleet figure', () => {
    const j = joinFleetRevenue({ '2025-01': 5, '2025-02': 4, '2030-01': 9 }, fleet);
    expect(j.map((p) => p.month)).toEqual(['2025-01', '2025-02']);
    expect(j[1]).toEqual({ month: '2025-02', revenue: 4, fleetMw: 1500 });
  });
  it('describes opposite movement without claiming a cause', () => {
    const rev = Object.fromEntries(fleet.map((f, i) => [f.month, 10 - i * 0.5]));
    const s = describeFleetRevenue(joinFleetRevenue(rev, fleet))!;
    expect(s).toContain('fell while fleet capacity rose');
    expect(s).toContain('not evidence that one caused the other');
    expect(s).not.toMatch(/because|due to|driven by/);
  });
  it('says nothing for a short span', () => {
    expect(describeFleetRevenue(joinFleetRevenue({ '2025-01': 1, '2025-02': 2 }, fleet))).toBeUndefined();
  });
});

describe('shares and counties', () => {
  it('averages the months with data and leaves empty hours null', () => {
    const grid = [[10, null], [20, null], [null, null]];
    const a = avgShareByHour(grid.map((r) => [...r, ...Array(22).fill(null)]), [1, 2, 3]);
    expect(a[0]).toBe(15);
    expect(a[1]).toBeNull();
  });
  it('matches county names across spellings', () => {
    expect(countyKey('McLennan')).toBe(countyKey('Mclennan'));
    expect(countyKey('De Witt')).toBe(countyKey('Dewitt'));
  });
});
