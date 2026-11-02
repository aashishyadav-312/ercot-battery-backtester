import { afterEach, describe, expect, it, vi } from 'vitest';
import { filledSoFar, intervalStart, latest, liveUrl, loadLive, pricesThrough, spikes, type LiveState } from './live';

function state(rt: Record<string, (number | null)[]>): LiveState {
  return {
    version: 1,
    checkedAt: '2026-11-03T18:05:00.000Z',
    errors: [],
    hubs: ['HB_HOUSTON', 'HB_WEST'],
    nodes: ['RUSSEKST_RN'],
    today: { date: '2026-11-03', startUtc: '2026-11-03T06:00:00.000Z', hours: 24, rt, da: null },
    tomorrow: { date: '2026-11-04', startUtc: '2026-11-04T06:00:00.000Z', hours: 24, da: null, daFirstSeenAt: null },
  };
}

describe('live helpers', () => {
  it('reads the latest price and its change', () => {
    expect(latest([10, 12, null, null])).toEqual({ index: 1, price: 12, change: 2 });
    expect(latest([null, 5])).toEqual({ index: 1, price: 5, change: null });
    expect(latest([null, null])).toBeNull();
  });

  it('fills gaps up to the last posted interval and counts them', () => {
    expect(filledSoFar([null, 3, null, 5, null, null])).toEqual({ prices: [3, 3, 3, 5], filled: 2 });
    expect(filledSoFar([null, null])).toEqual({ prices: [], filled: 0 });
  });

  it('times intervals from local midnight', () => {
    const s = state({ HB_HOUSTON: [1, 2, null], HB_WEST: [1, null, null], RUSSEKST_RN: [] });
    expect(new Date(intervalStart(s.today, 4)).toISOString()).toBe('2026-11-03T07:00:00.000Z');
    expect(new Date(pricesThrough(s)!).toISOString()).toBe('2026-11-03T06:30:00.000Z');
    expect(pricesThrough(state({ HB_HOUSTON: [null], HB_WEST: [], RUSSEKST_RN: [] }))).toBeNull();
  });

  it('flags locations at or above the spike threshold', () => {
    const s = state({ HB_HOUSTON: [900, 1000], HB_WEST: [5000, 40], RUSSEKST_RN: [20, 2500] });
    expect(spikes(s).map((x) => x.loc)).toEqual(['RUSSEKST_RN', 'HB_HOUSTON']);
  });

  it('calls the Worker directly except on localhost', () => {
    expect(liveUrl('aashishyadav-312.github.io')).toMatch(/^https:\/\/ercot-live\..*\/live\.json$/);
    expect(liveUrl('localhost')).toBe('/live-api/live.json');
  });
});

describe('loadLive', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  afterEach(() => store.clear());
  const ok = state({ HB_HOUSTON: [1], HB_WEST: [2], RUSSEKST_RN: [3] });
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

  it('saves a good snapshot and falls back to it when the Worker is down', async () => {
    expect(await loadLive(respond(200, ok), '/x')).toEqual({ source: 'worker', state: ok });
    const down = (async () => { throw new TypeError('network'); }) as typeof fetch;
    expect(await loadLive(down, '/x')).toEqual({ source: 'cache', state: ok, reason: 'the live service could not be reached' });
  });

  it("reports the Worker's error when there is nothing saved", async () => {
    expect(await loadLive(respond(503, { error: 'No snapshot yet' }), '/x')).toEqual({ source: 'none', reason: 'No snapshot yet' });
  });
});
