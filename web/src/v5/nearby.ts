// Nearby batteries: how much storage operates, and is planned, around a site.
// Data: results/v5/batteries/tx_batteries.json (data/fetch_eia860m.py, EIA-860M).

import { haversineKm } from '../v4/geo/nearest';
import config from './config.json';

export interface BatteryUnit {
  name: string;
  owner: string;
  county: string;
  lat: number;
  lon: number;
  mw: number;
  mwh: number | null;
  status: 'operating' | 'planned';
  /** YYYY-MM, or null when EIA gives no date. */
  online: string | null;
  ba: string | null;
}

export interface BatteriesFile {
  source: string;
  sourceUrl: string;
  asOf: string;
  release: string;
  count: number;
  scope?: string;
  units: BatteryUnit[];
}

export interface NearbyUnit extends BatteryUnit { distanceKm: number }

export interface NearbyBatteries {
  operatingMw: number;
  plannedMw: number;
  operatingCount: number;
  plannedCount: number;
  /** Up to 5 nearest units inside the radius (operating and planned), nearest first. */
  nearest: NearbyUnit[];
}

/** Default radius in km, from src/v5/config.json (assumption: true). */
export const DEFAULT_RADIUS_KM: number = config.nearbyBatteries.defaultRadiusKm;
export const NEAREST_COUNT = 5;

/**
 * Batteries within `radiusKm` of a point (great-circle distance). Sums use each unit's `mw`. Units exactly on the
 * radius count. Ties in distance sort by name so the list is stable.
 */
export function nearbyBatteries(units: readonly BatteryUnit[], lat: number, lon: number, radiusKm: number = DEFAULT_RADIUS_KM): NearbyBatteries {
  const inside: NearbyUnit[] = [];
  for (const u of units) {
    const distanceKm = haversineKm(lat, lon, u.lat, u.lon);
    if (distanceKm <= radiusKm) inside.push({ ...u, distanceKm });
  }
  inside.sort((a, b) => a.distanceKm - b.distanceKm || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let operatingMw = 0, plannedMw = 0, operatingCount = 0, plannedCount = 0;
  for (const u of inside) {
    if (u.status === 'operating') { operatingMw += u.mw; operatingCount++; } else { plannedMw += u.mw; plannedCount++; }
  }
  return { operatingMw, plannedMw, operatingCount, plannedCount, nearest: inside.slice(0, NEAREST_COUNT) };
}
