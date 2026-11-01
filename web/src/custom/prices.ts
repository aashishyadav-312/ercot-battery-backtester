// Reader for the per-location-year price files written by data/price_files.py
// ("EBP1": gzip of a JSON header plus int32 RT and DA prices in cents), and
// helpers that split a UTC price grid into US/Central operating days.

export const MISSING = -2147483648;
const MAGIC = 'EBP1';

export interface SeriesMeta {
  start_utc: string;
  step_minutes: number;
  count: number;
}

export interface PriceHeader {
  format: string;
  location: string;
  year: number;
  rt: SeriesMeta;
  da: SeriesMeta;
  sources: Record<string, string>;
}

/** A regular UTC price grid; NaN marks a missing price. */
export interface Series {
  startMs: number;
  stepMs: number;
  price: Float64Array;
}

export interface PriceFile {
  header: PriceHeader;
  rt: Series;
  da: Series;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toSeries(meta: SeriesMeta, view: DataView, offset: number): Series {
  const price = new Float64Array(meta.count);
  for (let i = 0; i < meta.count; i++) {
    const v = view.getInt32(offset + 4 * i, true);
    price[i] = v === MISSING ? NaN : v / 100;
  }
  return { startMs: Date.parse(meta.start_utc), stepMs: meta.step_minutes * 60_000, price };
}

/** Parse a price file. Accepts the gzip bytes, or bytes a server already decompressed. */
export async function parsePriceFile(data: ArrayBuffer | Uint8Array): Promise<PriceFile> {
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('not an EBP1 price file');
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as PriceHeader;
  const body = 8 + headerLength;
  if (bytes.byteLength !== body + 4 * (header.rt.count + header.da.count)) throw new Error('price file is truncated');
  return {
    header,
    rt: toSeries(header.rt, view, body),
    da: toSeries(header.da, view, body + 4 * header.rt.count),
  };
}

// --- US/Central calendar -----------------------------------------------------

const HOUR_MS = 3_600_000;
const central = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
});
const localHourCache = new Map<number, { date: string; month: number; hour: number }>();

/** Local (US/Central) date, month and hour of the UTC hour containing `ms`. Central offsets are whole hours. */
export function centralHour(ms: number) {
  const key = Math.floor(ms / HOUR_MS);
  let v = localHourCache.get(key);
  if (!v) {
    const p = Object.fromEntries(central.formatToParts(new Date(key * HOUR_MS)).map((x) => [x.type, x.value]));
    v = { date: `${p.year}-${p.month}-${p.day}`, month: Number(p.month), hour: Number(p.hour) };
    localHourCache.set(key, v);
  }
  return v;
}

/** UTC ms of local midnight starting `date` (YYYY-MM-DD). */
export function centralMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  for (const offsetHours of [6, 5]) {
    const ms = Date.UTC(y, m - 1, d, offsetHours);
    const h = centralHour(ms);
    if (h.date === date && h.hour === 0) return ms;
  }
  throw new Error(`no local midnight found for ${date}`);
}

export function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Intervals in a local day: 92, 96 or 100 for 15-minute data (23, 24 or 25 for hourly). */
export function expectedIntervals(date: string, stepMs: number): number {
  return Math.round((centralMidnight(nextDate(date)) - centralMidnight(date)) / stepMs);
}

export interface Day {
  date: string;
  /** First index of this day in the series. */
  start: number;
  /** Rows present for this day (a year-to-date file may end mid-day). */
  count: number;
}

/** Split a series into local operating days, in order. */
export function splitDays(s: Series): Day[] {
  const days: Day[] = [];
  for (let i = 0; i < s.price.length; i++) {
    const date = centralHour(s.startMs + i * s.stepMs).date;
    const last = days[days.length - 1];
    if (last && last.date === date) last.count++;
    else days.push({ date, start: i, count: 1 });
  }
  return days;
}

/** A day's prices with gaps filled forward then backward (pandas ffill().bfill()); null if all missing. */
export function filledDay(s: Series, day: Day): Float64Array | null {
  const p = s.price.slice(day.start, day.start + day.count);
  let lastValid = NaN;
  for (let i = 0; i < p.length; i++) {
    if (Number.isNaN(p[i])) p[i] = lastValid;
    else lastValid = p[i];
  }
  const first = p.findIndex((v) => !Number.isNaN(v));
  if (first < 0) return null;
  for (let i = 0; i < first; i++) p[i] = p[first];
  return p;
}

export function missingCount(s: Series, day: Day): number {
  let n = 0;
  for (let i = day.start; i < day.start + day.count; i++) if (Number.isNaN(s.price[i])) n++;
  return n;
}
