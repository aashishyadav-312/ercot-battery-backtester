// ERCOT operating days in US Central time, without a date library.
//
// ERCOT labels prices by delivery date, hour ending (1-24) and, for real time,
// a 15-minute interval (1-4) within the hour. On the fall-back day the repeated
// hour ending 02 appears twice; the second copy has DSTFlag = true (the same
// rule data/fetch_all_nodes.py uses via gridstatus). On the spring-forward day
// hour ending 03 does not exist. US clocks always change at 2:00 local, so a
// day's length is enough to place every label.

const TZ = 'America/Chicago';
const MIN = 60_000;

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

/** Local date (YYYY-MM-DD) and minutes after local midnight for a UTC instant. */
export function centralParts(utcMs: number): { date: string; minute: number } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** UTC instant of local midnight starting `date`. Midnight is never skipped or repeated in Central time. */
export function midnightUtc(date: string): number {
  const base = Date.parse(`${date}T00:00:00Z`);
  for (const offsetH of [5, 6]) {
    const t = base + offsetH * 60 * MIN;
    const p = centralParts(t);
    if (p.date === date && p.minute === 0) return t;
  }
  throw new Error(`no local midnight for ${date}`);
}

export interface OperatingDay {
  date: string;
  startUtc: number;
  /** 23, 24 or 25. */
  hours: number;
}

export function operatingDay(date: string): OperatingDay {
  const startUtc = midnightUtc(date);
  return { date, startUtc, hours: Math.round((midnightUtc(addDays(date, 1)) - startUtc) / (60 * MIN)) };
}

/** Elapsed hour index (0-based, from local midnight) for an hour ending label; null if the label can't exist. */
export function hourIndex(day: OperatingDay, hourEnding: number, dstFlag: boolean): number | null {
  const h = hourEnding - 1; // hour beginning
  if (h < 0 || h > 23) return null;
  if (day.hours === 25) {
    if (h === 1) return dstFlag ? 2 : 1;
    return h < 1 ? h : h + 1;
  }
  if (dstFlag) return null;
  if (day.hours === 23) {
    if (h === 2) return null;
    return h < 2 ? h : h - 1;
  }
  return h;
}

/** Elapsed 15-minute interval index (0-based) for a real-time label; null if the label can't exist. */
export function intervalIndex(day: OperatingDay, hourEnding: number, interval: number, dstFlag: boolean): number | null {
  if (interval < 1 || interval > 4) return null;
  const h = hourIndex(day, hourEnding, dstFlag);
  return h === null ? null : h * 4 + interval - 1;
}
