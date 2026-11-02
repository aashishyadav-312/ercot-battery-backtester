// One refresh of the live snapshot: today's real-time 15-minute prices and
// today's and tomorrow's hourly day-ahead prices for the hubs and featured
// nodes. The snapshot is stored in a single KV key; whatever ERCOT fails to
// return this run is carried over from the previous snapshot, so the page
// always has the last good data and the errors that explain it.
import type { Api, Row } from './ercot';
import { addDays, centralParts, hourIndex, intervalIndex, operatingDay, type OperatingDay } from './time';

export const HUBS = ['HB_HOUSTON', 'HB_NORTH', 'HB_SOUTH', 'HB_WEST', 'HB_PAN'];
/** The detailed resource nodes from results/index.json. */
export const NODES = ['RUSSEKST_RN', 'ANSON1_ALL', 'CAMWIND_RN', 'RHESS2_ESS1', 'WIPOPA_3_4'];
const LOCATIONS = [...HUBS, ...NODES];

const RT = 'np6-905-cd/spp_node_zone_hub';
const DA = 'np4-190-cd/dam_stlmnt_pnt_prices';
/** The day-ahead market closes at 10:00 Central; its prices can't post earlier. */
const DA_EARLIEST_MINUTE = 10 * 60;

/** Prices by location; one entry per elapsed interval of the operating day, null where ERCOT has none. */
export type Series = Record<string, (number | null)[]>;

export interface LiveDay {
  date: string;
  /** UTC instant of local midnight. */
  startUtc: string;
  hours: number;
}

export interface LiveState {
  version: 1;
  /** When this refresh ran. */
  checkedAt: string;
  errors: string[];
  hubs: string[];
  nodes: string[];
  today: LiveDay & { rt: Series; da: Series | null };
  tomorrow: LiveDay & {
    da: Series | null;
    /** First refresh that found tomorrow's day-ahead prices: they posted at or shortly before this time. */
    daFirstSeenAt: string | null;
  };
}

const flag = (v: Row[string]) => v === true || v === 'Y' || v === 'true';

function empty(n: number): (number | null)[] {
  return new Array(n).fill(null);
}

export function complete(s: Series | null | undefined, n: number): s is Series {
  return !!s && LOCATIONS.every((l) => s[l]?.length === n && s[l].every((v) => v !== null));
}

/** Place real-time rows on the operating day's 15-minute grid. */
export function rtSeries(day: OperatingDay, rows: Row[], locations: string[]): Series {
  const out: Series = Object.fromEntries(locations.map((l) => [l, empty(day.hours * 4)]));
  for (const r of rows) {
    const s = out[String(r.settlementPoint)];
    if (!s || r.deliveryDate !== day.date) continue;
    const i = intervalIndex(day, Number(r.deliveryHour), Number(r.deliveryInterval), flag(r.DSTFlag));
    if (i !== null) s[i] = Number(r.settlementPointPrice);
  }
  return out;
}

/** Place day-ahead rows (hourEnding "HH:00") on the operating day's hourly grid. */
export function daSeries(day: OperatingDay, rows: Row[], locations: string[]): Series {
  const out: Series = Object.fromEntries(locations.map((l) => [l, empty(day.hours)]));
  for (const r of rows) {
    const s = out[String(r.settlementPoint)];
    if (!s || r.deliveryDate !== day.date) continue;
    const i = hourIndex(day, parseInt(String(r.hourEnding), 10), flag(r.DSTFlag));
    if (i !== null) s[i] = Number(r.settlementPointPrice);
  }
  return out;
}

const iso = (ms: number) => new Date(ms).toISOString();
const dayInfo = (d: OperatingDay): LiveDay => ({ date: d.date, startUtc: iso(d.startUtc), hours: d.hours });

export async function refresh(prev: LiveState | null, nowMs: number, api: Api): Promise<LiveState> {
  const errors: string[] = [];
  const now = centralParts(nowMs);
  const today = operatingDay(now.date);
  const tomorrow = operatingDay(addDays(now.date, 1));
  const prevToday = prev?.today.date === today.date ? prev.today : null;
  const prevTomorrow = prev?.tomorrow.date === tomorrow.date ? prev.tomorrow : null;

  async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
  const d = (day: OperatingDay) => ({ deliveryDateFrom: day.date, deliveryDateTo: day.date });

  // Real time: one call returns every hub; resource nodes need one call each.
  const rt: Series = prevToday?.rt ?? rtSeries(today, [], LOCATIONS);
  const hubRows = await attempt('real-time hubs', () => api.rows(RT, { ...d(today), settlementPointType: 'HU', size: '1000' }));
  if (hubRows) Object.assign(rt, rtSeries(today, hubRows, HUBS));
  for (const node of NODES) {
    const rows = await attempt(`real-time ${node}`, () => api.rows(RT, { ...d(today), settlementPoint: node, size: '200' }));
    if (rows) Object.assign(rt, rtSeries(today, rows, [node]));
  }

  // Day-ahead for one operating day, one call per location.
  async function fetchDa(day: OperatingDay, locations: string[]): Promise<Series> {
    const out: Series = {};
    for (const loc of locations) {
      const rows = await attempt(`day-ahead ${day.date} ${loc}`, () => api.rows(DA, { ...d(day), settlementPoint: loc, size: '50' }));
      out[loc] = rows ? daSeries(day, rows, [loc])[loc] : empty(day.hours);
    }
    return out;
  }

  // Today's day-ahead prices were tomorrow's yesterday; fetch only if neither snapshot has them.
  let daToday: Series | null = null;
  if (complete(prevToday?.da, today.hours)) daToday = prevToday!.da;
  else if (prev?.tomorrow.date === today.date && complete(prev.tomorrow.da, today.hours)) daToday = prev.tomorrow.da;
  else daToday = await fetchDa(today, LOCATIONS);

  // Tomorrow: after the market closes, probe one hub; fetch the rest once it has posted.
  let daTomorrow = prevTomorrow?.da ?? null;
  let daFirstSeenAt = prevTomorrow?.daFirstSeenAt ?? null;
  if (!complete(daTomorrow, tomorrow.hours) && now.minute >= DA_EARLIEST_MINUTE) {
    const probe = await fetchDa(tomorrow, [HUBS[0]]);
    if (probe[HUBS[0]].some((v) => v !== null)) {
      daTomorrow = { ...probe, ...(await fetchDa(tomorrow, LOCATIONS.slice(1))) };
      daFirstSeenAt ??= iso(nowMs);
    }
  }

  return {
    version: 1,
    checkedAt: iso(nowMs),
    errors,
    hubs: HUBS,
    nodes: NODES,
    today: { ...dayInfo(today), rt, da: daToday },
    tomorrow: { ...dayInfo(tomorrow), da: daTomorrow, daFirstSeenAt },
  };
}
