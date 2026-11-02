import { describe, expect, it } from 'vitest';
import { STALE_MIN, intervalStart, pricesThrough, type LiveLoad, type LiveState } from '../live/live';
import { tickerModel } from './ticker';

/** A snapshot like the Worker serves: four 15-minute prices so far today at two hubs, one with a missing last interval. */
const RT: Record<string, (number | null)[]> = {
  HB_HOUSTON: [30.1, 30.9, 31.2, 31.4],
  HB_WEST: [25.0, 24.8, 24.9, 24.7],
  HB_PAN: [26.2, 26.2, null, null],
  RUSSEKST_RN: [40, 41, 42, 43],
};
const STATE: LiveState = {
  version: 1,
  checkedAt: '2026-11-03T18:05:00.000Z',
  errors: [],
  hubs: ['HB_HOUSTON', 'HB_WEST', 'HB_PAN', 'HB_NORTH'],
  nodes: ['RUSSEKST_RN'],
  today: { date: '2026-11-03', startUtc: '2026-11-03T06:00:00.000Z', hours: 24, rt: RT, da: null },
  tomorrow: { date: '2026-11-04', startUtc: '2026-11-04T06:00:00.000Z', hours: 24, da: null, daFirstSeenAt: null },
};
const through = pricesThrough(STATE)!;
const fresh = through + 5 * 60_000;

const worker: LiveLoad = { source: 'worker', state: STATE };

describe('ticker model', () => {
  it('shows each hub\'s latest price and change, exactly as in the snapshot', () => {
    const m = tickerModel(worker, fresh);
    const last = (loc: string) => RT[loc].filter((v) => v !== null).at(-1)!;
    const prev = (loc: string) => RT[loc].filter((v) => v !== null).at(-2)!;
    for (const loc of ['HB_HOUSTON', 'HB_WEST']) {
      const item = m.items.find((i) => i.loc === loc)!;
      expect(item.price).toBe(last(loc).toFixed(2));
      const delta = last(loc) - prev(loc);
      expect(item.change).toBe(`${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(2)}`);
      expect(item.dir).toBe(delta > 0 ? 'up' : 'down');
    }
  });

  it('lists hubs only: nodes are not in the strip, and a hub with no price yet is left out, not invented', () => {
    const m = tickerModel(worker, fresh);
    expect(m.items.map((i) => i.loc)).toEqual(['HB_HOUSTON', 'HB_WEST', 'HB_PAN']);
    expect(m.items.find((i) => i.loc === 'HB_NORTH')).toBeUndefined();
  });

  it('shows no change when the interval before is missing, and flat when it did not move', () => {
    const lone: LiveLoad = { source: 'worker', state: { ...STATE, today: { ...STATE.today, rt: { HB_HOUSTON: [null, 12.5], HB_WEST: [7, 7] } } } };
    const m = tickerModel(lone, intervalStart(STATE.today, 3));
    expect(m.items[0]).toMatchObject({ loc: 'HB_HOUSTON', price: '12.50', change: null, dir: 'flat' });
    expect(m.items[1]).toMatchObject({ loc: 'HB_WEST', price: '7.00', change: '0.00', dir: 'flat' });
  });

  it('is live while prices are recent', () => {
    const m = tickerModel(worker, fresh);
    expect(m.status).toBe('live');
    expect(m.badge).toBeNull();
    expect(m.summary).toMatch(/through .* Central/);
  });

  it('flags prices older than the stale limit as delayed', () => {
    const m = tickerModel(worker, through + (STALE_MIN + 1) * 60_000);
    expect(m.status).toBe('delayed');
    expect(m.badge).toBe('Delayed');
    expect(m.items.length).toBeGreaterThan(0);
  });

  it('labels a saved copy as saved, with its age, never as live', () => {
    const cached: LiveLoad = { source: 'cache', state: STATE, reason: 'the live service could not be reached' };
    const m = tickerModel(cached, Date.parse(STATE.checkedAt) + 3 * 60 * 60_000);
    expect(m.status).toBe('cached');
    expect(m.badge).toBe('Saved 3 h ago');
    expect(m.items.length).toBe(3);
  });

  it('says "Live prices unavailable" with no items when there is neither a feed nor a saved copy', () => {
    const m = tickerModel({ source: 'none', reason: 'the live service could not be reached' }, fresh);
    expect(m.status).toBe('unavailable');
    expect(m.summary).toBe('Live prices unavailable');
    expect(m.items).toEqual([]);
  });

  it('says nothing is posted yet when a snapshot has no hub price', () => {
    const empty: LiveLoad = { source: 'worker', state: { ...STATE, today: { ...STATE.today, rt: { HB_HOUSTON: [null], HB_WEST: [] } } } };
    const m = tickerModel(empty, fresh);
    expect(m.status).toBe('empty');
    expect(m.items).toEqual([]);
  });

  it('shows a loading note, not numbers, before the first answer', () => {
    const m = tickerModel(null, fresh);
    expect(m.status).toBe('loading');
    expect(m.items).toEqual([]);
  });
});
