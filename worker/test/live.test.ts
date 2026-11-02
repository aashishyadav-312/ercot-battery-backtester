import { describe, expect, it } from 'vitest';
import type { Api, Row } from '../src/ercot';
import { HUBS, NODES, complete, daSeries, refresh, rtSeries, type LiveState } from '../src/live';
import { centralParts, hourIndex, intervalIndex, operatingDay } from '../src/time';

describe('operating days', () => {
  it('has 24, 25 and 23 hours on normal, fall-back and spring-forward days', () => {
    expect(operatingDay('2026-10-31').hours).toBe(24);
    expect(operatingDay('2026-11-01').hours).toBe(25);
    expect(operatingDay('2026-03-08').hours).toBe(23);
    expect(new Date(operatingDay('2026-11-01').startUtc).toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(new Date(operatingDay('2026-11-02').startUtc).toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  it('places the repeated fall-back hour after the first one', () => {
    const day = operatingDay('2026-11-01');
    expect(intervalIndex(day, 2, 1, false)).toBe(4);
    expect(intervalIndex(day, 2, 1, true)).toBe(8);
    expect(intervalIndex(day, 3, 1, false)).toBe(12);
    expect(intervalIndex(day, 24, 4, false)).toBe(99);
    // Each index maps back to the right wall-clock time.
    const at = (i: number) => centralParts(day.startUtc + i * 15 * 60_000).minute;
    expect([at(4), at(8), at(12)]).toEqual([60, 60, 120]);
  });

  it('skips hour ending 03 on the spring-forward day', () => {
    const day = operatingDay('2026-03-08');
    expect(hourIndex(day, 3, false)).toBeNull();
    expect(hourIndex(day, 4, false)).toBe(2);
    expect(hourIndex(day, 24, false)).toBe(22);
    expect(hourIndex(day, 2, true)).toBeNull();
  });
});

const rtRow = (date: string, loc: string, h: number, i: number, price: number, dst = false): Row => ({
  deliveryDate: date, deliveryHour: h, deliveryInterval: i, settlementPoint: loc, settlementPointType: 'HU', settlementPointPrice: price, DSTFlag: dst,
});
const daRow = (date: string, loc: string, he: number, price: number): Row => ({
  deliveryDate: date, hourEnding: `${String(he).padStart(2, '0')}:00`, settlementPoint: loc, settlementPointPrice: price, DSTFlag: false,
});

describe('series', () => {
  it('leaves missing intervals null and ignores other dates and locations', () => {
    const day = operatingDay('2026-11-01');
    const s = rtSeries(day, [
      rtRow('2026-11-01', 'HB_WEST', 2, 1, 44.33, true),
      rtRow('2026-11-01', 'HB_WEST', 2, 1, 59.22, false),
      rtRow('2026-10-31', 'HB_WEST', 1, 1, 999),
      rtRow('2026-11-01', 'HB_BUSAVG', 1, 1, 999),
    ], ['HB_WEST']);
    expect(s.HB_WEST).toHaveLength(100);
    expect(s.HB_WEST[4]).toBe(59.22);
    expect(s.HB_WEST[8]).toBe(44.33);
    expect(s.HB_WEST[0]).toBeNull();
    expect(Object.keys(s)).toEqual(['HB_WEST']);
  });

  it('reads day-ahead hour-ending labels', () => {
    const day = operatingDay('2026-11-03');
    const s = daSeries(day, [daRow('2026-11-03', 'HB_NORTH', 1, 30), daRow('2026-11-03', 'HB_NORTH', 24, 40)], ['HB_NORTH']);
    expect(s.HB_NORTH[0]).toBe(30);
    expect(s.HB_NORTH[23]).toBe(40);
  });
});

/** Fake ERCOT: a full day of prices for every location and date it knows, plus a call log. */
function fakeApi(opts: { daDates: string[]; rtDate: string; rtUpTo: number; fail?: (params: Record<string, string>) => boolean }) {
  const calls: Record<string, string>[] = [];
  const api: Api = {
    async rows(path, params) {
      calls.push({ path, ...params });
      if (opts.fail?.(params)) throw new Error('HTTP 500');
      const date = params.deliveryDateFrom;
      if (path.startsWith('np6-905-cd')) {
        if (date !== opts.rtDate) return [];
        const locs = params.settlementPointType === 'HU' ? HUBS : [params.settlementPoint];
        const out: Row[] = [];
        for (const loc of locs) for (let k = 0; k < opts.rtUpTo; k++) out.push(rtRow(date, loc, Math.floor(k / 4) + 1, (k % 4) + 1, 20 + k));
        return out;
      }
      if (!opts.daDates.includes(date)) return [];
      return Array.from({ length: 24 }, (_, h) => daRow(date, params.settlementPoint, h + 1, 25 + h));
    },
  };
  return { api, calls };
}

// 2026-11-03 is a normal 24-hour day; times below are Central (UTC-6).
const at = (hhmm: string, date = '2026-11-03') => Date.parse(`${date}T${hhmm}:00-06:00`);

describe('refresh', () => {
  it('fetches everything on a cold start, but not tomorrow before the day-ahead market closes', async () => {
    const { api, calls } = fakeApi({ daDates: ['2026-11-03'], rtDate: '2026-11-03', rtUpTo: 40 });
    const s = await refresh(null, at('09:30'), api);
    expect(s.errors).toEqual([]);
    expect(s.today.rt.HB_HOUSTON.slice(0, 40).every((v) => v !== null)).toBe(true);
    expect(s.today.rt.HB_HOUSTON[40]).toBeNull();
    expect(s.today.rt.WIPOPA_3_4[39]).toBe(59);
    expect(complete(s.today.da, 24)).toBe(true);
    expect(s.tomorrow.da).toBeNull();
    expect(calls.filter((c) => c.deliveryDateFrom === '2026-11-04')).toHaveLength(0);
    expect(calls).toHaveLength(1 + NODES.length + HUBS.length + NODES.length);
  });

  it('probes one hub for tomorrow and records when day-ahead prices first appear', async () => {
    const before = await refresh(null, at('12:00'), fakeApi({ daDates: ['2026-11-03'], rtDate: '2026-11-03', rtUpTo: 48 }).api);
    expect(before.tomorrow.da).toBeNull();

    const { api, calls } = fakeApi({ daDates: ['2026-11-03', '2026-11-04'], rtDate: '2026-11-03', rtUpTo: 50 });
    const after = await refresh(before, at('12:35'), api);
    expect(complete(after.tomorrow.da, 24)).toBe(true);
    expect(after.tomorrow.daFirstSeenAt).toBe(new Date(at('12:35')).toISOString());
    // Today's day-ahead prices came from the previous snapshot.
    expect(calls.filter((c) => c.deliveryDateFrom === '2026-11-03' && c.path.startsWith('np4'))).toHaveLength(0);

    const later = await refresh(after, at('12:40'), api);
    expect(later.tomorrow.daFirstSeenAt).toBe(after.tomorrow.daFirstSeenAt);
  });

  it("uses yesterday's snapshot of tomorrow as today's day-ahead prices after midnight", async () => {
    const prev = await refresh(null, at('23:50'), fakeApi({ daDates: ['2026-11-03', '2026-11-04'], rtDate: '2026-11-03', rtUpTo: 96 }).api);
    const { api, calls } = fakeApi({ daDates: [], rtDate: '2026-11-04', rtUpTo: 0 });
    const s = await refresh(prev, at('00:05', '2026-11-04'), api);
    expect(s.today.date).toBe('2026-11-04');
    expect(s.today.da).toEqual(prev.tomorrow.da);
    expect(s.today.rt.HB_HOUSTON.every((v) => v === null)).toBe(true);
    expect(calls.every((c) => c.path.startsWith('np6'))).toBe(true);
  });

  it('keeps the last good prices and reports the error when ERCOT fails', async () => {
    const good = await refresh(null, at('15:00'), fakeApi({ daDates: ['2026-11-03'], rtDate: '2026-11-03', rtUpTo: 60 }).api);
    const { api } = fakeApi({ daDates: ['2026-11-03'], rtDate: '2026-11-03', rtUpTo: 61, fail: (p) => p.settlementPointType === 'HU' });
    const s = await refresh(structuredClone(good) as LiveState, at('15:05'), api);
    expect(s.errors).toEqual(['real-time hubs: HTTP 500']);
    expect(s.today.rt.HB_HOUSTON).toEqual(good.today.rt.HB_HOUSTON);
    expect(s.today.rt.RUSSEKST_RN[60]).toBe(80);
  });
});
