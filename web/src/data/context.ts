// Context layers (Phase 17): fleet size, interconnection queue, weather and solar/wind share.
// These are descriptive series shown beside the backtest results. Nothing here feeds the optimizer,
// and the sentences built from them state what moved together, never what caused what.
import type { LocationRec } from './types';

export interface FleetPoint { month: string; mw: number; mwh: number; units: number }
export interface QueueCounty { mw: number; projects: number; mw_ia_signed: number }
export interface CityWeather { hub: string; lat: number; lon: number; tmax_f: (number | null)[]; tmin_f: (number | null)[] }
export interface YearShare { months: number[]; solar_pct: (number | null)[][]; wind_pct: (number | null)[][] }

export interface ContextFile {
  generated: string;
  fleet: { source: string; as_of: string; filter: string; note: string; monthly: FleetPoint[] };
  queue: { source: string; published: string; note: string; total_mw: number; total_projects: number; counties: Record<string, QueueCounty> };
  weather: { source: string; first_day: string; days: number; note: string; cities: Record<string, CityWeather> };
  fuel: { source: string; definition: string; years: Record<string, YearShare> };
}

// ------------------------------------------------------------ weather
/** City whose weather stands in for each hub (the same cities the Map page draws the hubs at). */
export const HUB_CITY: Record<string, string> = {
  HB_HOUSTON: 'Houston', HB_NORTH: 'Dallas', HB_SOUTH: 'San Antonio', HB_WEST: 'Midland', HB_PAN: 'Amarillo',
};

const rad = (d: number) => (d * Math.PI) / 180;
/** Great-circle distance in km. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Hub city for a hub; for a node, the closest hub city to its plotted position. Undefined when the node has no coordinates. */
export function weatherCity(code: string, ctx: ContextFile, locations: LocationRec[] | undefined): string | undefined {
  if (HUB_CITY[code]) return HUB_CITY[code];
  const l = locations?.find((x) => x.code === code);
  if (l?.lat == null || l.lon == null) return undefined;
  let best: [string, number] | undefined;
  for (const [city, c] of Object.entries(ctx.weather.cities)) {
    const d = haversineKm([l.lat, l.lon], [c.lat, c.lon]);
    if (!best || d < best[1]) best = [city, d];
  }
  return best?.[0];
}

export interface DayWeather { city: string; hi: number; lo: number }

/** High and low (°F) on an ISO date, or undefined when the date lies outside the weather file or is missing. */
export function weatherOn(ctx: ContextFile, city: string | undefined, date: string): DayWeather | undefined {
  const c = city ? ctx.weather.cities[city] : undefined;
  if (!c) return undefined;
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  const i = Math.round(day(date) - day(ctx.weather.first_day));
  const hi = c.tmax_f[i];
  const lo = c.tmin_f[i];
  return i >= 0 && hi != null && lo != null ? { city: city!, hi, lo } : undefined;
}

// ------------------------------------------------------------ fleet vs revenue
export interface FleetRevenuePoint { month: string; revenue: number; fleetMw: number }

/** Join monthly revenue ($/kW, keyed "YYYY-MM") to the fleet's installed MW in the same month. Months without a fleet point are dropped. */
export function joinFleetRevenue(revenue: Record<string, number>, fleet: FleetPoint[]): FleetRevenuePoint[] {
  const mw = new Map(fleet.map((f) => [f.month, f.mw]));
  return Object.keys(revenue).sort().filter((m) => mw.has(m)).map((m) => ({ month: m, revenue: revenue[m], fleetMw: mw.get(m)! }));
}

const word = (from: number, to: number, flat = 0.05) => {
  const r = to / from - 1;
  return Math.abs(r) < flat ? 'stayed about the same' : r > 0 ? 'rose' : 'fell';
};

/** One descriptive sentence comparing the first and last quarter of the span. Associations only. */
export function describeFleetRevenue(points: FleetRevenuePoint[]): string | undefined {
  if (points.length < 6) return undefined;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const q = Math.max(3, Math.floor(points.length / 4));
  const head = points.slice(0, q);
  const tail = points.slice(-q);
  const [r0, r1] = [avg(head.map((p) => p.revenue)), avg(tail.map((p) => p.revenue))];
  const [f0, f1] = [avg(head.map((p) => p.fleetMw)), avg(tail.map((p) => p.fleetMw))];
  const span = `${head[0].month} to ${tail[tail.length - 1].month}`;
  if (r0 <= 0 || f0 <= 0) return undefined;
  const rv = word(r0, r1);
  const fl = word(f0, f1);
  const joiner = rv === 'stayed about the same' || fl === 'stayed about the same' ? 'and' : (rv === 'fell') === (fl === 'fell') ? 'and' : 'while';
  return `From ${span}, monthly revenue per kW ${rv} ${joiner} fleet capacity ${fl} (first ${q} months against last ${q}). This is a description of two series, not evidence that one caused the other.`;
}

// ------------------------------------------------------------ solar and wind share
/** Average share (%) by hour over the given months, skipping months with no data. */
export function avgShareByHour(grid: (number | null)[][], months: number[]): (number | null)[] {
  return Array.from({ length: 24 }, (_, h) => {
    const v = months.map((m) => grid[m - 1]?.[h]).filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  });
}

// ------------------------------------------------------------ interconnection queue
/** Match key for county names: us-atlas writes "McLennan", the ERCOT report "Mclennan". */
export const countyKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export function queueByKey(counties: Record<string, QueueCounty>): Map<string, QueueCounty & { name: string }> {
  return new Map(Object.entries(counties).map(([name, c]) => [countyKey(name), { ...c, name }]));
}
