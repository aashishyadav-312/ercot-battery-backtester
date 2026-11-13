import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_RADIUS_KM, nearbyBatteries, type BatteriesFile, type BatteryUnit } from './nearby';
import config from './config.json';

const unit = (name: string, lat: number, lon: number, mw: number, status: 'operating' | 'planned'): BatteryUnit => ({
  name, owner: 'o', county: 'c', lat, lon, mw, mwh: null, status, online: '2025-01', ba: 'ERCO',
});

// One degree of latitude is 111.195 km on the 6371.0088 km sphere, so offsets are easy to place.
const KM_PER_DEG = (Math.PI / 180) * 6371.0088;
const north = (km: number) => 30 + km / KM_PER_DEG;

const units = [
  unit('A', north(10), -97, 100, 'operating'),
  unit('B', north(30), -97, 50, 'operating'),
  unit('C', north(35), -97, 200, 'planned'),
  unit('D', north(60), -97, 999, 'operating'),
  unit('E', north(20), -97, 75, 'planned'),
];

describe('nearbyBatteries', () => {
  it('sums operating and planned MW inside the radius and lists the nearest first', () => {
    const r = nearbyBatteries(units, 30, -97, 40);
    expect(r.operatingMw).toBe(150);
    expect(r.plannedMw).toBe(275);
    expect(r.operatingCount).toBe(2);
    expect(r.plannedCount).toBe(2);
    expect(r.nearest.map((u) => u.name)).toEqual(['A', 'E', 'B', 'C']);
    expect(r.nearest[0].distanceKm).toBeCloseTo(10, 1);
  });

  it('caps the nearest list at five and widens with the radius', () => {
    const many = Array.from({ length: 8 }, (_, i) => unit(`U${i}`, north(i + 1), -97, 10, 'operating'));
    const r = nearbyBatteries(many, 30, -97, 100);
    expect(r.operatingCount).toBe(8);
    expect(r.operatingMw).toBe(80);
    expect(r.nearest).toHaveLength(5);
    expect(r.nearest[4].name).toBe('U4');
  });

  it('counts a unit exactly at the radius and ignores one just beyond', () => {
    const r = nearbyBatteries([unit('edge', north(40), -97, 5, 'operating')], 30, -97, 40.0001);
    expect(r.operatingCount).toBe(1);
    expect(nearbyBatteries([unit('far', north(40.5), -97, 5, 'operating')], 30, -97, 40).operatingCount).toBe(0);
  });

  it('returns zeros and an empty list with no units nearby', () => {
    expect(nearbyBatteries([], 30, -97)).toEqual({ operatingMw: 0, plannedMw: 0, operatingCount: 0, plannedCount: 0, nearest: [] });
    expect(nearbyBatteries(units, 25, -105, 40).nearest).toEqual([]);
  });

  it('measures great-circle distance (a degree of longitude shrinks with latitude)', () => {
    // 0.5 degrees of longitude at 30N is about 48 km, outside 40 km, inside 50 km.
    const u = [unit('east', 30, -96.5, 1, 'operating')];
    expect(nearbyBatteries(u, 30, -97, 40).operatingCount).toBe(0);
    const r = nearbyBatteries(u, 30, -97, 50);
    expect(r.operatingCount).toBe(1);
    expect(r.nearest[0].distanceKm).toBeGreaterThan(47);
    expect(r.nearest[0].distanceKm).toBeLessThan(49);
  });

  it('uses the configured default radius', () => {
    expect(DEFAULT_RADIUS_KM).toBe(config.nearbyBatteries.defaultRadiusKm);
    expect(config.nearbyBatteries.assumption).toBe(true);
    expect(nearbyBatteries(units, 30, -97).operatingCount).toBe(nearbyBatteries(units, 30, -97, DEFAULT_RADIUS_KM).operatingCount);
  });
});

describe('results/v5/batteries/tx_batteries.json', () => {
  const file = JSON.parse(readFileSync(resolve(__dirname, '../../../results/v5/batteries/tx_batteries.json'), 'utf8')) as BatteriesFile;

  it('follows the contract', () => {
    expect(file.release).toMatch(/^\d{4}-\d{2}$/);
    expect(file.sourceUrl).toMatch(/^https:\/\/www\.eia\.gov\//);
    expect(file.asOf).toBeTruthy();
    expect(file.count).toBe(file.units.length);
    for (const u of file.units) {
      expect(['operating', 'planned']).toContain(u.status);
      expect(u.mw).toBeGreaterThan(0);
      expect(u.lat).toBeGreaterThan(25);
      expect(u.lat).toBeLessThan(37);
      expect(u.lon).toBeGreaterThan(-107);
      expect(u.lon).toBeLessThan(-93);
      expect(u.online === null || /^\d{4}-\d{2}$/.test(u.online)).toBe(true);
    }
  });

  it('finds batteries around Houston', () => {
    const r = nearbyBatteries(file.units, 29.76, -95.37, DEFAULT_RADIUS_KM);
    expect(r.operatingMw + r.plannedMw).toBeGreaterThan(0);
    expect(r.nearest.length).toBeGreaterThan(0);
  });
});
