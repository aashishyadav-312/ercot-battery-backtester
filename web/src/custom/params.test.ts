import { describe, expect, it } from 'vitest';
import { FORM_DEFAULTS, fitRange, formQuery, parseForm, precomputedKey, toParams, type Coverage } from './params';

const coverage: Coverage[] = [2024, 2025, 2026].flatMap((year) =>
  ['HB_HOUSTON', 'RUSSEKST_RN'].map((location) => ({
    location, year, first: `${year}-01-01`, last: year === 2026 ? '2026-10-31' : `${year}-12-31`,
  })),
);

describe('custom-run URL parameters', () => {
  it('round-trips every input through the URL', () => {
    const f = { location: 'RUSSEKST_RN', powerMw: 50, durationH: 1.5, rtePct: 88.5, degCost: 7.25, startDate: '2024-06-01', endDate: '2024-08-31', strategy: 'da' as const };
    expect(parseForm(formQuery(f), coverage)).toEqual(f);
  });

  it('falls back to defaults for an empty or unreadable query', () => {
    expect(parseForm('', coverage)).toEqual(FORM_DEFAULTS);
    expect(parseForm('loc=NOWHERE&mw=abc&dur=&strat=zzz', coverage)).toEqual(FORM_DEFAULTS);
  });

  it('clamps out-of-range numbers', () => {
    const f = parseForm('mw=0&dur=20&rte=120&deg=-5', coverage);
    expect([f.powerMw, f.durationH, f.rtePct, f.degCost]).toEqual([1, 8, 100, 0]);
  });

  it('opens the full year when a top-bar link carries only `year`', () => {
    const f = parseForm('loc=HB_HOUSTON&dur=4&year=2024&deg=0', coverage);
    expect([f.startDate, f.endDate, f.durationH, f.degCost]).toEqual(['2024-01-01', '2024-12-31', 4, 0]);
  });

  it('keeps the range inside one year with prices', () => {
    expect(fitRange('HB_HOUSTON', '2026-03-01', '2026-12-31', coverage)).toEqual({ startDate: '2026-03-01', endDate: '2026-10-31' });
    expect(fitRange('HB_HOUSTON', '2025-11-01', '2026-02-01', coverage)).toEqual({ startDate: '2025-11-01', endDate: '2025-12-31' });
    expect(fitRange('HB_HOUSTON', '2025-05-01', '2025-04-01', coverage)).toEqual({ startDate: '2025-05-01', endDate: '2025-05-01' });
    expect(fitRange('HB_HOUSTON', '2019-01-01', '2019-12-31', coverage)).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
  });

  it('converts percent to a fraction for the solver', () => {
    expect(toParams({ ...FORM_DEFAULTS, rtePct: 90 }).rte).toBeCloseTo(0.9, 12);
  });

  it('recognizes inputs that match a precomputed result', () => {
    expect(precomputedKey(FORM_DEFAULTS)).toMatchObject({ location: 'HB_HOUSTON', year: 2025, duration: 2, deg: 10 });
    expect(precomputedKey({ ...FORM_DEFAULTS, durationH: 1.5 })).toBeNull();
    expect(precomputedKey({ ...FORM_DEFAULTS, startDate: '2025-02-01' })).toBeNull();
  });
});
