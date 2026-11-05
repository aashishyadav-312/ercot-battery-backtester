// Where a point is: the county that contains it and the nearest listed city. Pure, so the card and its tests share one answer.
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { haversineKm } from './nearest';
import type { CountyProps, Place } from './types';

type Ring = number[][];

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon: number, lat: number, poly: Ring[]): boolean {
  return inRing(lon, lat, poly[0]) && !poly.slice(1).some((h) => inRing(lon, lat, h));
}

function inGeometry(lon: number, lat: number, g: Geometry): boolean {
  if (g.type === 'Polygon') return inPolygon(lon, lat, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some((p) => inPolygon(lon, lat, p));
  return false;
}

/** Name of the county that contains the point, from the simplified outlines (a point within a few hundred metres of a border can read as its neighbour). */
export function countyAt(fc: FeatureCollection<Geometry, CountyProps>, lat: number, lon: number): string | null {
  const hit = fc.features.find((f: Feature<Geometry, CountyProps>) => inGeometry(lon, lat, f.geometry));
  return hit ? hit.properties.name : null;
}

export function nearestPlace(places: Place[], lat: number, lon: number): { place: Place; km: number } | null {
  let best: { place: Place; km: number } | null = null;
  for (const p of places) {
    const km = haversineKm(lat, lon, p.lat, p.lon);
    if (!best || km < best.km) best = { place: p, km };
  }
  return best;
}
