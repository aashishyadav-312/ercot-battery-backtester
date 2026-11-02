// Live page data: the snapshot the Cloudflare Worker (worker/) serves, a copy
// kept in this browser for when the Worker can't be reached, and the small
// transforms the page needs. Keep LiveState in step with worker/src/live.ts.

export type Series = Record<string, (number | null)[]>;

export interface LiveDay {
  date: string;
  startUtc: string;
  hours: number;
}

export interface LiveState {
  version: 1;
  checkedAt: string;
  errors: string[];
  hubs: string[];
  nodes: string[];
  today: LiveDay & { rt: Series; da: Series | null };
  tomorrow: LiveDay & { da: Series | null; daFirstSeenAt: string | null };
}

const WORKER_URL = 'https://ercot-live.aashishyadav312.workers.dev/live.json';
/** The Worker only answers the GitHub Pages origin; local dev and preview go through Vite's proxy (vite.config.ts). */
export function liveUrl(host = window.location.hostname) {
  const local = host === 'localhost' || host === '127.0.0.1';
  return import.meta.env.VITE_LIVE_URL ?? (local ? '/live-api/live.json' : WORKER_URL);
}

export const RT_MIN = 15;
/** Real-time price at or above this ($/MWh) shows the spike banner. */
export const SPIKE_THRESHOLD = 1000;
/** Prices older than this (minutes after the interval ended) are flagged as delayed. */
export const STALE_MIN = 45;

const CACHE_KEY = 'ebb-live-snapshot';

export type LiveLoad =
  | { source: 'worker'; state: LiveState }
  | { source: 'cache'; state: LiveState; reason: string }
  | { source: 'none'; reason: string };

function isState(x: unknown): x is LiveState {
  const s = x as LiveState;
  return !!s && s.version === 1 && typeof s.checkedAt === 'string' && !!s.today?.rt;
}

/** Fetch the snapshot; on any failure fall back to the copy saved by the last successful load. */
export async function loadLive(fetcher: typeof fetch = fetch, url = liveUrl()): Promise<LiveLoad> {
  let reason: string;
  try {
    const r = await fetcher(url, { cache: 'no-store' });
    const body: unknown = await r.json().catch(() => null);
    if (r.ok && isState(body)) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(body)); } catch { /* storage unavailable */ }
      return { source: 'worker', state: body };
    }
    reason = (body as { error?: string } | null)?.error ?? `the live service answered HTTP ${r.status}`;
  } catch {
    reason = 'the live service could not be reached';
  }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (isState(saved)) return { source: 'cache', state: saved, reason };
  } catch { /* storage unavailable or corrupt */ }
  return { source: 'none', reason };
}

/** Index of the last interval with a price, or -1. */
export function lastIndex(v: (number | null)[]): number {
  for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null) return i;
  return -1;
}

/** Latest price and the change from the interval before it (null if that one is missing). */
export function latest(v: (number | null)[]) {
  const i = lastIndex(v);
  if (i < 0) return null;
  const prev = i > 0 ? v[i - 1] : null;
  return { index: i, price: v[i]!, change: prev === null ? null : v[i]! - prev };
}

/** Start time (ms) of interval i of a day split into `minutes`-long steps. */
export function intervalStart(day: LiveDay, i: number, minutes = RT_MIN): number {
  return Date.parse(day.startUtc) + i * minutes * 60_000;
}

/** End of the newest real-time interval any location has, or null before the first one posts. */
export function pricesThrough(s: LiveState): number | null {
  const i = Math.max(-1, ...Object.values(s.today.rt).map(lastIndex));
  return i < 0 ? null : intervalStart(s.today, i + 1);
}

/**
 * Prices from the start of the day through the last posted interval, with gaps
 * filled by the previous price (or the next one, for gaps at the start), the
 * way the backtester fills single missing intervals. `filled` counts them.
 */
export function filledSoFar(v: (number | null)[]): { prices: number[]; filled: number } {
  const end = lastIndex(v);
  const prices: number[] = [];
  let filled = 0;
  let prev: number | null = v.slice(0, end + 1).find((x) => x !== null) ?? null;
  for (let i = 0; i <= end; i++) {
    if (v[i] === null) filled++;
    else prev = v[i];
    prices.push(prev!);
  }
  return { prices, filled };
}

/** Locations whose latest real-time price is at or above the spike threshold, highest first. */
export function spikes(s: LiveState, threshold = SPIKE_THRESHOLD) {
  return [...s.hubs, ...s.nodes]
    .map((loc) => ({ loc, last: latest(s.today.rt[loc] ?? []) }))
    .filter((x): x is { loc: string; last: NonNullable<ReturnType<typeof latest>> } => !!x.last && x.last.price >= threshold)
    .sort((a, b) => b.last.price - a.last.price);
}

export function isComplete(v: (number | null)[] | undefined, n: number): v is number[] {
  return !!v && v.length === n && v.every((x) => x !== null);
}

/** "4:15 PM" in Central time. */
export function ctTime(ms: number | string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

/** "Sun, Nov 1" for an operating date. */
export function ctDay(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
}

/** "12 min ago", "3 h ago". */
export function ago(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return 'just now';
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
