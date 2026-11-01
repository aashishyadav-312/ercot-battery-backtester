import highsLoader, { type Highs } from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { TOL, optimizeDay } from './dispatch';
import { centralMidnight, expectedIntervals, filledDay, splitDays } from './prices';

let highs: Highs;
beforeAll(async () => {
  highs = await highsLoader();
});

describe('optimizeDay (highs-js)', () => {
  it('does nothing on flat prices', () => {
    const r = optimizeDay(highs, new Array(96).fill(30), 0.25, 100, 200, 0.85, 0, 0);
    expect(r.energyDischargedMwh).toBeCloseTo(0, 6);
    expect(r.revenue).toBeCloseTo(0, 6);
  });

  it('charges at the low price and discharges at the high price', () => {
    const prices = [...new Array(48).fill(10), ...new Array(48).fill(100)];
    const r = optimizeDay(highs, prices, 0.25, 100, 200, 0.85, 0, 0);
    expect(r.charge.slice(0, 48).some((c) => c > 0)).toBe(true);
    expect(r.discharge.slice(0, 48).every((d) => d === 0)).toBe(true);
    expect(r.charge.slice(48).every((c) => c === 0)).toBe(true);
    // Same as Python: optimize_day(prices, 0.25, 100, 200, 0.85, 0, 0)["revenue"]
    expect(r.revenue).toBeCloseTo(16269.784336399216, 6);
    expect(r.usedMilp).toBe(false);
  });

  it('falls back to a MILP at negative prices and never charges and discharges at once', () => {
    const prices = Array.from({ length: 96 }, (_, t) => (t < 40 ? -60 + 1.5 * t : 20 + 0.7 * (t - 40)));
    const r = optimizeDay(highs, prices.map((p) => Math.round(p * 100) / 100), 0.25, 100, 100, 0.85, 0, 0);
    expect(r.usedMilp).toBe(true);
    expect(r.revenue).toBeCloseTo(12762.127080851218, 4); // Python optimize_day on the same prices
    for (let t = 0; t < 96; t++) expect(r.charge[t] > TOL && r.discharge[t] > TOL).toBe(false);
    for (const s of r.soc) expect(s).toBeGreaterThanOrEqual(-1e-6);
    expect(r.soc[95]).toBeCloseTo(0, 6);
  });

  it('respects power and energy limits', () => {
    const prices = Array.from({ length: 96 }, (_, t) => 50 + 40 * Math.sin((t / 96) * 4 * Math.PI));
    const r = optimizeDay(highs, prices, 0.25, 50, 100, 0.9, 5, 0);
    for (let t = 0; t < 96; t++) {
      expect(r.charge[t] + r.discharge[t]).toBeLessThanOrEqual(50 + 1e-6);
      expect(r.soc[t]).toBeLessThanOrEqual(100 + 1e-6);
    }
    expect(r.revenue).toBeGreaterThanOrEqual(0);
  });
});

describe('US/Central days', () => {
  it('has 92 and 100 intervals on the 2025 DST days', () => {
    expect(expectedIntervals('2025-03-09', 900_000)).toBe(92);
    expect(expectedIntervals('2025-11-02', 900_000)).toBe(100);
    expect(expectedIntervals('2025-07-01', 900_000)).toBe(96);
    expect(expectedIntervals('2025-11-02', 3_600_000)).toBe(25);
  });

  it('splits a UTC grid into local days', () => {
    const startMs = centralMidnight('2025-11-01');
    const s = { startMs, stepMs: 900_000, price: new Float64Array(96 + 100 + 4) };
    expect(splitDays(s).map((d) => [d.date, d.count])).toEqual([
      ['2025-11-01', 96],
      ['2025-11-02', 100],
      ['2025-11-03', 4],
    ]);
  });

  it('fills gaps forward then backward within a day', () => {
    const s = { startMs: 0, stepMs: 900_000, price: Float64Array.from([NaN, 1, NaN, 3, NaN]) };
    expect(Array.from(filledDay(s, { date: 'x', start: 0, count: 5 })!)).toEqual([1, 1, 1, 3, 3]);
  });
});
