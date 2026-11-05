import type { NodeIndex } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface NearNode { code: string; km: number; county: string | null; hub: string | null; precision: string }

/**
 * The k nearest resource nodes to a point, nearest first, and the nearest hub.
 * Hubs are not in the node list: a hub is a price average, so it is reported separately (`nearestHub`, by distance to its
 * marker city) next to `zoneHub` (the hub of the nearest node's load zone, which is the better price reference).
 */
export function nearestNodes(index: NodeIndex, lat: number, lon: number, k = 5) {
  const nodes: NearNode[] = [];
  let hub: { code: string; km: number } | null = null;
  for (const [code, n] of Object.entries(index)) {
    const km = haversineKm(lat, lon, n.lat, n.lon);
    if (n.kind === 'hub') {
      if (!hub || km < hub.km) hub = { code, km };
    } else nodes.push({ code, km, county: n.county, hub: n.hub, precision: n.precision });
  }
  nodes.sort((a, b) => a.km - b.km || (a.code < b.code ? -1 : 1));
  const top = nodes.slice(0, Math.max(0, k));
  return { nodes: top, nearestHub: hub, zoneHub: top[0]?.hub ?? null };
}
