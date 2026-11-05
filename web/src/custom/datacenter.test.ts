/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import highsLoader, { type Highs } from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DC_RULES,
  alertDays,
  countedSpan,
  parseLoadCsv,
  runDataCenterCase,
  validateDataCenterInputs,
  type DataCenterInputs,
  type FourCpYear,
} from './datacenter';
import { centralMidnight, parsePriceFile, type PriceFile } from './prices';

const RESULTS = fileURLToPath(new URL('../../../results/', import.meta.url));

let highs: Highs;
beforeAll(async () => {
  highs = await highsLoader();
});

// --- fixtures ------------------------------------------------------------------------------------

/** Days of synthetic prices from `first`: cheap overnight, a peak in the late afternoon, a little noise. */
function fixturePrices(first: string, days: number, year = Number(first.slice(0, 4))): PriceFile {
  const startMs = centralMidnight(first);
  const rt = new Float64Array(days * 96);
  const da = new Float64Array(days * 24);
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const base = 25 + 45 * Math.exp(-((h - 17) ** 2) / 6) + 8 * Math.sin(d + h);
      da[d * 24 + h] = Math.round(base * 100) / 100;
      for (let q = 0; q < 4; q++) {
        const spike = h === 16 && q === 3 && d % 3 === 0 ? 400 : 0;
        rt[d * 96 + h * 4 + q] = Math.round((base * (1 + 0.15 * Math.cos(3 * d + q + h)) + spike) * 100) / 100;
      }
    }
  }
  const meta = (count: number, step: number) => ({ start_utc: new Date(startMs).toISOString(), step_minutes: step, count });
  return {
    header: { format: 'EBP1', location: 'FIXTURE', year, rt: meta(rt.length, 15), da: meta(da.length, 60), sources: {} },
    rt: { startMs, stepMs: 900_000, price: rt },
    da: { startMs, stepMs: 3_600_000, price: da },
  };
}

/** A 4CP file whose only interval is `endingLocal` (YYYY-MM-DDTHH:MM, Central daylight time). */
function fixtureFourCp(endingLocal: string, peaks: [string, number][], resolution = 15): FourCpYear {
  const endMs = Date.parse(`${endingLocal}:00-05:00`);
  const startMs = endMs - resolution * 60_000;
  return {
    year: Number(endingLocal.slice(0, 4)),
    status: resolution === 15 ? 'official' : 'computed',
    complete: false,
    intervals: [
      {
        month: Number(endingLocal.slice(5, 7)),
        label: endingLocal,
        interval_ending_local: endingLocal,
        start_utc: new Date(startMs).toISOString(),
        end_utc: new Date(endMs).toISOString(),
        resolution_minutes: resolution,
      },
    ],
    daily_peaks: peaks.map(([date, peak_mw]) => ({ date, peak_mw, hour_ending: 17 })),
    sources: {},
    notes: [],
  };
}

const JULY = '2025-07-01';
const DAYS = 6;
const peaks: [string, number][] = [
  ['2025-07-01', 80000],
  ['2025-07-02', 70000],
  ['2025-07-03', 79000], // 4CP day, alert (>= 95% of 80,000)
  ['2025-07-04', 60000],
  ['2025-07-05', 78000], // alert, not the 4CP
  ['2025-07-06', 50000],
];

function base(over: Partial<DataCenterInputs> = {}): DataCenterInputs {
  return {
    highs,
    prices: fixturePrices(JULY, DAYS),
    fourCp: fixtureFourCp('2025-07-03T17:00', peaks),
    node: 'FIXTURE',
    year: 2025,
    siteLoadMw: 50,
    batteryMw: 10,
    batteryMwh: 20,
    rte: 0.85,
    degCost: 0,
    exportAllowed: true,
    fourCpStrategy: 'foresight',
    startDate: JULY,
    endDate: '2025-07-06',
    ...over,
  };
}

// --- tests ---------------------------------------------------------------------------------------

describe('datacenter rules config', () => {
  it('gives every rule and default a source and an as-of date', () => {
    const missing: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if ('text' in o || 'value' in o) {
        const src = o.source ?? o.sources;
        const urls = Array.isArray(src) ? src : [src];
        if (!urls.length || !urls.every((u) => typeof u === 'string' && /^https:\/\//.test(u))) missing.push(`${path}: source`);
        if (typeof o.asOf !== 'string') missing.push(`${path}: asOf`);
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    walk(DC_RULES.fourCp, 'fourCp');
    walk(DC_RULES.sb6, 'sb6');
    walk(DC_RULES.defaults, 'defaults');
    expect(missing).toEqual([]);
    expect(DC_RULES.sb6.ruleStatusSource).toMatch(/^https:\/\//);
    for (const r of DC_RULES.sb6.ruleStatus) expect(r.asOf).toBeTruthy();
  });

  it('derives the default 4CP rate from the postage stamp rate', () => {
    const r = DC_RULES.fourCp;
    expect(r.defaultRatePerKwPer4cp.value).toBe(Math.round((r.postageStampRate.value / 4) * 100) / 100);
    expect(r.defaultRatePerKwPer4cp.assumption).toBe(true);
    expect(r.review.text).toMatch(/12CP/);
  });

  it('ships 4CP data for 2023 to 2026 with four intervals each', () => {
    for (const y of [2023, 2024, 2025, 2026]) {
      const f: FourCpYear = JSON.parse(readFileSync(join(RESULTS, 'v4', 'fourcp', `${y}.json`), 'utf8'));
      expect(f.year).toBe(y);
      expect(f.intervals.map((i) => i.month)).toEqual([6, 7, 8, 9]);
      expect(f.daily_peaks).toHaveLength(122);
      expect(f.sources.intervals).toMatch(/^https:\/\//);
    }
  });
});

describe('4CP math', () => {
  it('counts the 30 minutes around an official label and the whole hour of a computed one', () => {
    const f = fixtureFourCp('2025-07-03T17:00', peaks);
    const [s, e] = countedSpan(f.intervals[0]);
    expect(e - s).toBe(30 * 60_000);
    expect(new Date(s).toISOString()).toBe('2025-07-03T21:45:00.000Z');
    const h = fixtureFourCp('2025-07-03T17:00', peaks, 60);
    const [hs, he] = countedSpan(h.intervals[0]);
    expect(he - hs).toBe(3_600_000);
  });

  it('values a full cut at the 4CP interval at rate x kW (foresight, export allowed)', () => {
    const r = runDataCenterCase(base({ fourCpRatePerKw: 17.14 }));
    const d = r.fourCpDetail[0];
    expect(d.covered).toBe(true);
    expect(d.cutMw).toBeCloseTo(10, 6);
    expect(r.breakdown.fourCp).toBeCloseTo(10 * 1000 * 17.14, 3);
    const s = r.dispatchSample!;
    expect(s.date).toBe('2025-07-03');
    const [i0, i1] = s.fourCp!;
    expect(i1 - i0).toBe(2);
    expect(s.times[i0]).toBe('16:45');
    for (let t = i0; t < i1; t++) expect(s.dischargeMw[t] - s.chargeMw[t]).toBeGreaterThanOrEqual(10 - 1e-6);
  });

  it('caps the 4CP cut at the site load', () => {
    const r = runDataCenterCase(base({ siteLoadMw: 5, exportAllowed: true, fourCpRatePerKw: 10 }));
    expect(r.fourCpDetail[0].cutMw).toBeCloseTo(5, 6);
    expect(r.breakdown.fourCp).toBeCloseTo(5 * 1000 * 10, 3);
  });

  it('holds the cut for the whole hour of a computed interval', () => {
    const r = runDataCenterCase(base({ fourCp: fixtureFourCp('2025-07-03T17:00', peaks, 60), batteryMwh: 5 }));
    // 5 MWh over one hour at 0.85 RTE: at most 5 * sqrt(0.85) MW held for 60 minutes.
    expect(r.fourCpDetail[0].cutMw).toBeCloseTo(Math.min(10, 5 * Math.sqrt(0.85)), 4);
    expect(r.dispatchSample!.fourCp![1] - r.dispatchSample!.fourCp![0]).toBe(4);
  });

  it('flags alert days against the month-to-date peak', () => {
    expect([...alertDays(peaks.map(([date, peak_mw]) => ({ date, peak_mw, hour_ending: 17 })), 95)]).toEqual([
      '2025-07-01',
      '2025-07-03',
      '2025-07-05',
    ]);
  });
});

describe('strategies and limits', () => {
  for (const exportAllowed of [true, false]) {
    it(`realistic never beats foresight (export ${exportAllowed ? 'on' : 'off'})`, () => {
      for (const siteLoadMw of [50, 6]) {
        const f = runDataCenterCase(base({ exportAllowed, siteLoadMw, degCost: 5 }));
        const r = runDataCenterCase(base({ exportAllowed, siteLoadMw, degCost: 5, fourCpStrategy: 'realistic' }));
        expect(r.alertDays).toBe(3);
        expect(r.totalUsd).toBeLessThanOrEqual(f.totalUsd + 1e-6 * Math.abs(f.totalUsd));
        expect(r.breakdown.energy + r.breakdown.fourCp).toBeLessThanOrEqual(f.breakdown.energy + f.breakdown.fourCp + 1e-3);
      }
    });
  }

  it('realistic counts the 4CP only when its window covered it', () => {
    const r = runDataCenterCase(base({ fourCpStrategy: 'realistic' }));
    expect(r.fourCpDetail[0].alertDay).toBe(true);
    expect(r.fourCpDetail[0].covered).toBe(true);
    // 20 MWh over a 3-hour window: an even cut of at most 20 * sqrt(0.85) / 3 MW.
    expect(r.fourCpDetail[0].cutMw).toBeGreaterThanOrEqual((20 * Math.sqrt(0.85)) / 3 - 1e-3);
    const missed = runDataCenterCase(base({ fourCpStrategy: 'realistic', windowStartHour: 10, windowEndHour: 12 }));
    expect(missed.fourCpDetail[0].cutMw).toBeLessThan(r.fourCpDetail[0].cutMw);
  });

  it('never discharges above the site load without export', () => {
    // Load varies by hour, dipping below the battery's power.
    const profile = Array.from({ length: 8760 }, (_, h) => 4 + 8 * ((h * 7) % 5) / 4);
    for (const fourCpStrategy of ['foresight', 'realistic'] as const) {
      let checked = 0;
      runDataCenterCase(
        base({
          exportAllowed: false,
          loadProfileMw: profile,
          fourCpStrategy,
          onDay: (_d, sch, load) => {
            for (let t = 0; t < load.length; t++) {
              expect(sch.discharge[t]).toBeLessThanOrEqual(load[t] + 1e-6);
              checked++;
            }
          },
        }),
      );
      expect(checked).toBe(DAYS * 96);
    }
  });

  it('breakdown sums to the total, with ancillary services and reliability on', () => {
    const asStack = { energy: 60, regup: 5, regdn: 4, rrs: 10, ecrs: 6, nsrs: 2 };
    const r = runDataCenterCase(
      base({ asEnabled: true, asStack, curtailmentHoursPerYear: 3, curtailmentEvents: 1, valueOfLostLoad: 10000 }),
    );
    const b = r.breakdown;
    expect(b.energy + b.as + b.fourCp + b.reliability).toBeCloseTo(r.totalUsd, 6);
    expect(r.perKwYr).toBeCloseTo(r.totalUsd / 10000, 9);
    const pk = r.breakdownPerKwYr;
    expect(pk.energy + pk.as + pk.fourCp + pk.reliability).toBeCloseTo(r.perKwYr, 9);
    // AS: 27 $/kW-yr less the share of hours held for the 4CP (30 minutes of 6 days).
    expect(b.as).toBeCloseTo(27 * 10000 * (1 - 0.5 / (DAYS * 24)), 3);
    // Reliability: 10 MW covers 20 * sqrt(0.85) / 10 hours of a 3-hour event.
    expect(b.reliability).toBeCloseTo(20 * Math.sqrt(0.85) * 10000, 3);
    expect(r.standalone.as).toBeCloseTo(27 * 10000, 6);
  });

  it('falls back to energy only, with a note, when no stack exists', () => {
    const r = runDataCenterCase(base({ asEnabled: true, asStack: null }));
    expect(r.breakdown.as).toBe(0);
    expect(r.notes.join(' ')).toMatch(/energy only/);
  });

  it('runs one node-year in under 2 s', () => {
    const prices = parsePriceFileSync('HB_WEST_2025.ebp');
    const fourCp: FourCpYear = JSON.parse(readFileSync(join(RESULTS, 'v4', 'fourcp', '2025.json'), 'utf8'));
    return prices.then((p) => {
      for (const fourCpStrategy of ['foresight', 'realistic'] as const) {
        const t0 = performance.now();
        const r = runDataCenterCase({
          highs,
          prices: p,
          fourCp,
          node: 'HB_WEST',
          year: 2025,
          siteLoadMw: 60,
          loadFactor: 0.9,
          batteryMw: 100,
          batteryMwh: 200,
          exportAllowed: false,
          fourCpStrategy,
        });
        const ms = performance.now() - t0;
        expect(ms).toBeLessThan(2000);
        expect(r.daysSolved).toBeGreaterThan(360);
        expect(r.fourCpDetail).toHaveLength(4);
        expect(r.annualized).toBe(false);
      }
    });
  }, 10_000);
});

describe('energy-only parity with the published results', () => {
  // With no 4CP rate, export allowed and a load above the battery's power, the site case is the
  // standalone battery, so both must match results/<LOC>_<YEAR>_<H>h_0.85_<DEG>.json within 0.5%.
  for (const [loc, year, hours, deg] of [
    ['HB_WEST', 2025, 2, 10],
    ['HB_HOUSTON', 2024, 4, 0],
  ] as const) {
    it(`${loc} ${year} ${hours}h deg ${deg}`, async () => {
      const published = JSON.parse(readFileSync(join(RESULTS, `${loc}_${year}_${hours}h_0.85_${deg}.json`), 'utf8')).metrics;
      const prices = await parsePriceFileSync(`${loc}_${year}.ebp`);
      const fourCp: FourCpYear = JSON.parse(readFileSync(join(RESULTS, 'v4', 'fourcp', `${year}.json`), 'utf8'));
      for (const [fourCpStrategy, key] of [
        ['foresight', 'revenue_per_kw_year'],
        ['realistic', 'da_rt_revenue_per_kw_year'],
      ] as const) {
        const r = runDataCenterCase({
          highs, prices, fourCp, node: loc, year, siteLoadMw: 500, batteryMw: 100, batteryMwh: 100 * hours,
          rte: 0.85, degCost: deg, exportAllowed: true, fourCpStrategy, fourCpRatePerKw: 0,
        });
        const want = published[key] as number;
        expect(Math.abs(r.standalone.perKwYr - want) / want).toBeLessThan(0.005);
        expect(Math.abs(r.breakdownPerKwYr.energy - want) / want).toBeLessThan(0.005);
      }
    }, 20_000);
  }
});

describe('inputs', () => {
  it('reports invalid inputs in plain words', () => {
    expect(validateDataCenterInputs(base())).toEqual([]);
    const errs = validateDataCenterInputs({ ...base(), siteLoadMw: -1, batteryMw: Number.NaN, loadProfileMw: [1, 2, 3] });
    expect(errs).toContain('Site load (MW) must be between 1 and 10000.');
    expect(errs).toContain('Battery power (MW) must be a number.');
    expect(errs.some((e) => e.includes('8760'))).toBe(true);
    expect(() => runDataCenterCase(base({ batteryMwh: 0 }))).toThrow(/Battery energy/);
  });

  it('parses an 8760 CSV with a header and a timestamp column', () => {
    const rows = ['hour,mw', ...Array.from({ length: 8760 }, (_, i) => `${i},${100 + (i % 3)}`)];
    const v = parseLoadCsv(rows.join('\n'));
    expect(v).toHaveLength(8760);
    expect(v.slice(0, 3)).toEqual([100, 101, 102]);
    expect(() => parseLoadCsv('mw\n1\n2')).toThrow(/8760/);
    expect(() => parseLoadCsv(['mw', '1', 'x'].join('\n'))).toThrow(/Row 3/);
  });
});

function parsePriceFileSync(name: string) {
  return parsePriceFile(readFileSync(join(RESULTS, 'prices', name)));
}
