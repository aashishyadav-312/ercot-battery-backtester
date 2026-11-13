/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import highsLoader, { type Highs } from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { DC_RULES, runDataCenterCase, type DataCenterInputs, type FourCpYear } from './datacenter';
import { centralHour, centralMidnight, parsePriceFile, type PriceFile } from './prices';
import { TWELVECP_RULES, defaultTwelveCpRate, holdWindows, runTwelveCpCase, toPeakFile, type TwelveCpYear } from './twelvecp';

const RESULTS = fileURLToPath(new URL('../../../results/', import.meta.url));
const readJson = <T>(...p: string[]): T => JSON.parse(readFileSync(join(RESULTS, ...p), 'utf8'));
const twelve = (y: number) => readJson<TwelveCpYear>('v5', 'twelvecp', `${y}.json`);
const four = (y: number) => readJson<FourCpYear>('v4', 'fourcp', `${y}.json`);

let highs: Highs;
beforeAll(async () => {
  highs = await highsLoader();
});

// --- fixtures ------------------------------------------------------------------------------------

/** Synthetic prices, the same shape as the datacenter.test.ts fixture. */
function fixturePrices(first: string, days: number, year = Number(first.slice(0, 4))): PriceFile {
  const startMs = centralMidnight(first);
  const rt = new Float64Array(days * 96);
  const da = new Float64Array(days * 24);
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const base = 25 + 45 * Math.exp(-((h - 17) ** 2) / 6) + 8 * Math.sin(d + h);
      da[d * 24 + h] = Math.round(base * 100) / 100;
      for (let q = 0; q < 4; q++) rt[d * 96 + h * 4 + q] = Math.round(base * (1 + 0.15 * Math.cos(3 * d + q + h)) * 100) / 100;
    }
  }
  const meta = (count: number, step: number) => ({ start_utc: new Date(startMs).toISOString(), step_minutes: step, count });
  return {
    header: { format: 'EBP1', location: 'FIXTURE', year, rt: meta(rt.length, 15), da: meta(da.length, 60), sources: {} },
    rt: { startMs, stepMs: 900_000, price: rt },
    da: { startMs, stepMs: 3_600_000, price: da },
  };
}

const JAN = '2025-01-01';
const DAYS = 6;
const janPeaks: [string, number][] = [
  ['2025-01-01', 60000],
  ['2025-01-02', 50000],
  ['2025-01-03', 59000], // the month's 12CP day, alert (>= 95% of 60,000)
  ['2025-01-04', 40000],
  ['2025-01-05', 58000], // alert, not the peak
  ['2025-01-06', 30000],
];

/** A 12CP file whose only interval is the peak hour 07:00 to 08:00 CST on January 3, 2025. */
function fixtureTwelveCp(): TwelveCpYear {
  return {
    year: 2025,
    status: 'computed',
    complete: false,
    source: 'https://www.ercot.com/gridinfo/load/load_hist',
    asOf: '2026-11-13',
    intervals: [
      {
        month: 1,
        interval_ending_local: '2025-01-03T08:00',
        start_utc: '2025-01-03T13:00:00Z',
        end_utc: '2025-01-03T14:00:00Z',
        resolution_minutes: 60,
        ercot_peak_mw: 59000,
        twelvecp_year: 2025,
      },
    ],
    daily_peaks: janPeaks.map(([date, peak_mw]) => ({ date, peak_mw, hour_ending: 8 })),
  };
}

/** A 4CP file for 2025 with its real July interval, outside the January test range. */
function julyFourCp(): FourCpYear {
  const f = four(2025);
  return { ...f, intervals: f.intervals.filter((i) => i.month === 7), daily_peaks: f.daily_peaks.filter((p) => p.date.startsWith('2025-07')), complete: false };
}

function base(over: Partial<DataCenterInputs> = {}): DataCenterInputs {
  return {
    highs,
    prices: fixturePrices(JAN, DAYS),
    fourCp: julyFourCp(),
    node: 'FIXTURE',
    year: 2025,
    siteLoadMw: 50,
    batteryMw: 10,
    batteryMwh: 20,
    rte: 0.85,
    degCost: 0,
    exportAllowed: true,
    fourCpStrategy: 'foresight',
    startDate: JAN,
    endDate: '2025-01-06',
    ...over,
  };
}

// --- config --------------------------------------------------------------------------------------

describe('12CP rules config', () => {
  it('gives every rule a source and an as-of date, and says the rule is proposed', () => {
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
    walk(TWELVECP_RULES, 'rules');
    expect(missing).toEqual([]);
    expect(TWELVECP_RULES.status.value).toBe('proposed, not adopted');
    expect(TWELVECP_RULES.interval.minutes).toBe(30);
    const ids = TWELVECP_RULES.notModelled.map((n) => n.id);
    expect(ids).toContain('minimumBillingDemand');
    expect(ids).toContain('rateRebasing');
  });

  it('derives the default rate from the 4CP postage stamp rate, not a typed number', () => {
    expect('value' in TWELVECP_RULES.defaultRatePerKwPerPeak).toBe(false);
    expect(TWELVECP_RULES.defaultRatePerKwPerPeak.assumption).toBe(true);
    const annual = DC_RULES.fourCp.postageStampRate.value;
    expect(defaultTwelveCpRate()).toBe(Math.round((annual / 12) * 100) / 100);
    // An entered 4CP rate keeps the same annual amount.
    expect(defaultTwelveCpRate(17.14) * 12).toBeCloseTo(17.14 * 4, 9);
  });

  it('puts every month in exactly one hold window', () => {
    const months = TWELVECP_RULES.realisticStrategy.windows.flatMap((w) => w.months).sort((a, b) => a - b);
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('hold windows cover every monthly peak hour of the years they were derived from', () => {
    const windows = holdWindows();
    const missed: string[] = [];
    for (const y of TWELVECP_RULES.realisticStrategy.derivedFromYears) {
      for (const iv of twelve(y).intervals) {
        const w = windows.find((x) => x.months.includes(iv.month))!;
        // Every 15-minute slice of the peak hour must sit inside one block.
        for (let ms = Date.parse(iv.start_utc); ms < Date.parse(iv.end_utc); ms += 900_000) {
          const h = centralHour(ms).hour;
          if (!w.hours.some(([s, e]) => h >= s && h < e)) missed.push(`${iv.interval_ending_local}`);
        }
      }
    }
    expect(missed).toEqual([]);
  });

  it('summer window is the 4CP window', () => {
    const summer = TWELVECP_RULES.realisticStrategy.windows.find((w) => w.season === 'summer')!;
    const r = DC_RULES.fourCp.realisticStrategy;
    expect(summer.hours).toEqual([[Number(r.windowStartLocal.slice(0, 2)), Number(r.windowEndLocal.slice(0, 2))]]);
  });
});

// --- data ----------------------------------------------------------------------------------------

describe('12CP data files', () => {
  it('has 12 monthly peaks for each complete year, one per month, in the contract shape', () => {
    for (const y of [2023, 2024, 2025]) {
      const f = twelve(y);
      expect(f.year).toBe(y);
      expect(f.complete).toBe(true);
      expect(f.status).toBe('computed');
      expect(f.source).toMatch(/^https:\/\//);
      expect(f.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.intervals.map((i) => i.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      for (const iv of f.intervals) {
        expect(iv.resolution_minutes).toBe(60);
        expect(Date.parse(iv.end_utc) - Date.parse(iv.start_utc)).toBe(3_600_000);
        expect(iv.ercot_peak_mw).toBeGreaterThan(30000);
        expect(Number(iv.interval_ending_local.slice(5, 7))).toBe(iv.month);
        expect(iv.twelvecp_year).toBe(iv.month >= 10 ? y + 1 : y);
        // The interval's peak is the highest daily peak of its month.
        const month = f.daily_peaks.filter((p) => Number(p.date.slice(5, 7)) === iv.month);
        expect(Math.max(...month.map((p) => p.peak_mw))).toBe(iv.ercot_peak_mw);
      }
      expect(f.daily_peaks.length).toBeGreaterThanOrEqual(365);
    }
  });

  it('marks 2026 incomplete with only finished months', () => {
    const f = twelve(2026);
    expect(f.complete).toBe(false);
    expect(f.intervals.length).toBeLessThan(12);
    expect(f.intervals.map((i) => i.month)).toEqual(f.months_finished);
    for (const iv of f.intervals) expect(Date.parse(iv.end_utc)).toBeLessThan(Date.parse(f.asOf));
  });
});

// --- engine --------------------------------------------------------------------------------------

describe('12CP engine', () => {
  it('leaves the 4CP result identical to runDataCenterCase', () => {
    for (const fourCpStrategy of ['foresight', 'realistic'] as const) {
      const input = base({ fourCpStrategy, startDate: '2025-07-01', endDate: '2025-07-04', prices: fixturePrices('2025-07-01', 4), fourCp: julyFourCp() });
      const today = runDataCenterCase(input);
      const c = runTwelveCpCase(input, TWELVECP_RULES, { ...fixtureTwelveCp(), intervals: [] });
      expect(c.fourCp.result).toEqual(today);
      expect(c.fourCp.avoidedUsd).toBe(today.breakdown.fourCp);
    }
  });

  it('the hold-window option is off by default and matches the 4CP window when set to it', () => {
    const input = base({ fourCpStrategy: 'realistic', fourCp: toPeakFile(fixtureTwelveCp()), fourCpRatePerKw: 5 });
    const plain = runDataCenterCase(input);
    const same = runDataCenterCase({ ...input, holdWindows: [{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], hours: [[15, 18]] }] });
    const { dispatchSample: a, ...ra } = plain;
    const { dispatchSample: b, ...rb } = same;
    expect(rb).toEqual(ra);
    expect(b?.window).toEqual(a?.window);
  });

  it('hand-checked case, foresight: a full 10 MW cut through the peak hour at the postage stamp rate / 12', () => {
    const c = runTwelveCpCase(base(), TWELVECP_RULES, fixtureTwelveCp());
    // 68.547301 / 12 = 5.7123 -> 5.71 $/kW per peak; 10 MW = 10,000 kW held for the whole hour.
    expect(c.twelveCp.ratePerKw).toBe(5.71);
    expect(c.twelveCp.detail[0].covered).toBe(true);
    expect(c.twelveCp.detail[0].cutMw).toBeCloseTo(10, 6);
    expect(c.twelveCp.avoidedUsd).toBeCloseTo(57_100, 3);
    expect(c.twelveCp.avoidedPerKwYr).toBeCloseTo(5.71, 9);
    expect(c.twelveCp.alertDays).toBe(0);
    expect(c.twelveCp.peaksValued).toBe(1);
    expect(c.twelveCp.peaksInYear).toBe(12);
    // No 4CP interval in January: nothing avoided, nothing given up.
    expect(c.fourCp.avoidedUsd).toBe(0);
    expect(c.fourCp.energyGivenUpUsd).toBeCloseTo(0, 6);
    // Holding the cut costs some energy revenue, never more than the cut is worth here.
    expect(c.twelveCp.energyGivenUpUsd).toBeGreaterThan(0);
    expect(c.twelveCp.netUsd).toBeCloseTo(c.twelveCp.avoidedUsd - c.twelveCp.energyGivenUpUsd, 6);
    expect(c.baseline.energyUsd - c.twelveCp.result.breakdown.energy).toBeCloseTo(c.twelveCp.energyGivenUpUsd, 9);
  });

  it('hand-checked case, foresight: energy limits the cut held for an hour', () => {
    const c = runTwelveCpCase(base({ batteryMwh: 5 }), TWELVECP_RULES, fixtureTwelveCp());
    // 5 MWh at 0.85 round trip delivers 5 * sqrt(0.85) = 4.6098 MW for one hour.
    const cut = 5 * Math.sqrt(0.85);
    expect(c.twelveCp.detail[0].cutMw).toBeCloseTo(cut, 4);
    expect(c.twelveCp.avoidedUsd).toBeCloseTo(cut * 1000 * 5.71, 0);
  });

  it('hand-checked case, realistic: three alert days, an even cut across the two winter blocks', () => {
    const c = runTwelveCpCase(base({ fourCpStrategy: 'realistic' }), TWELVECP_RULES, fixtureTwelveCp());
    // Alert days: Jan 1 (first of month), Jan 3 (59,000 >= 0.95 x 60,000), Jan 5 (58,000 >= 57,000).
    expect(c.twelveCp.alertDays).toBe(3);
    // Winter blocks 06:00-08:00 and 17:00-19:00: 4 hours a day held on 3 days.
    expect(c.twelveCp.reservedHours).toBe(12);
    // 20 MWh x sqrt(0.85) delivered evenly over 4 hours = 4.6098 MW, below 10 MW and the 50 MW load.
    const cut = (20 * Math.sqrt(0.85)) / 4;
    expect(c.twelveCp.detail[0].alertDay).toBe(true);
    expect(c.twelveCp.detail[0].covered).toBe(true);
    expect(c.twelveCp.detail[0].cutMw).toBeCloseTo(cut, 3);
    expect(c.twelveCp.avoidedUsd).toBeCloseTo(cut * 1000 * 5.71, -1);
    expect(c.fourCp.alertDays).toBe(0);
    const s = c.twelveCp.result.dispatchSample!;
    expect(s.windows).toHaveLength(2);
    expect(s.windows!.map(([a, b]) => [s.times[a], s.times[b - 1]])).toEqual([
      ['06:00', '07:45'],
      ['17:00', '18:45'],
    ]);
  });

  it('realistic misses a peak outside its window', () => {
    const f = fixtureTwelveCp();
    // Move the peak to 12:00 to 13:00 CST, outside both winter blocks.
    f.intervals[0] = { ...f.intervals[0], interval_ending_local: '2025-01-03T13:00', start_utc: '2025-01-03T18:00:00Z', end_utc: '2025-01-03T19:00:00Z' };
    const c = runTwelveCpCase(base({ fourCpStrategy: 'realistic' }), TWELVECP_RULES, f);
    expect(c.twelveCp.detail[0].covered).toBe(false);
    expect(c.twelveCp.avoidedUsd).toBe(0);
  });

  it('uses the entered 4CP rate for the same annual amount, or an entered 12CP rate', () => {
    const a = runTwelveCpCase(base({ fourCpRatePerKw: 12 }), TWELVECP_RULES, fixtureTwelveCp());
    expect(a.twelveCp.ratePerKw).toBeCloseTo(4, 9);
    expect(a.fourCp.ratePerKw).toBe(12);
    expect(a.twelveCp.avoidedUsd).toBeCloseTo(10 * 1000 * 4, 3);
    const b = runTwelveCpCase(base(), TWELVECP_RULES, fixtureTwelveCp(), { twelveCpRatePerKw: 0 });
    expect(b.twelveCp.avoidedUsd).toBe(0);
    expect(b.twelveCp.energyGivenUpUsd).toBeCloseTo(0, 6);
  });

  it('values only the finished months of an incomplete year, and says so', () => {
    const peaks = twelve(2026);
    const oct = peaks.intervals.find((i) => i.month === 10)!;
    const day = oct.interval_ending_local.slice(0, 10);
    const input = base({ year: 2026, prices: fixturePrices(day, 1), fourCp: four(2026), startDate: day, endDate: day });
    const c = runTwelveCpCase(input, TWELVECP_RULES, peaks);
    expect(c.twelveCp.peaksValued).toBe(peaks.intervals.length);
    expect(c.twelveCp.peaksValued).toBeLessThan(12);
    expect(c.twelveCp.peaksCovered).toBe(1);
    expect(c.twelveCp.detail.find((d) => d.month === 10)!.covered).toBe(true);
    expect(c.notes.join(' ')).toMatch(new RegExp(`${peaks.intervals.length} of 12 months`));
    expect(c.status).toBe('proposed, not adopted');
  });

  it('rejects a 12CP file for another year', () => {
    expect(() => runTwelveCpCase(base(), TWELVECP_RULES, twelve(2024))).toThrow(/2024/);
  });

  it('runs 4CP and 12CP on a real node-year, both strategies', async () => {
    const prices = await parsePriceFile(readFileSync(join(RESULTS, 'prices', 'HB_WEST_2025.ebp')));
    for (const fourCpStrategy of ['foresight', 'realistic'] as const) {
      const c = runTwelveCpCase(
        { highs, prices, fourCp: four(2025), node: 'HB_WEST', year: 2025, siteLoadMw: 120, batteryMw: 100, batteryMwh: 200, exportAllowed: false, fourCpStrategy },
        TWELVECP_RULES,
        twelve(2025),
      );
      expect(c.twelveCp.peaksValued).toBe(12);
      expect(c.fourCp.peaksValued).toBe(4);
      for (const o of [c.fourCp, c.twelveCp]) {
        expect(o.avoidedPerKwYr).toBeGreaterThanOrEqual(0);
        // Annual rate: 4 x 17.14 or 12 x 5.71 $/kW-yr at most.
        expect(o.avoidedPerKwYr).toBeLessThanOrEqual(o.ratePerKw * o.peaksInYear + 1e-9);
        expect(o.energyGivenUpUsd).toBeGreaterThan(-1e-6 * Math.abs(c.baseline.energyUsd));
      }
      if (fourCpStrategy === 'foresight') {
        expect(c.twelveCp.peaksCovered).toBe(12);
        expect(c.fourCp.peaksCovered).toBe(4);
      } else {
        expect(c.twelveCp.alertDays).toBeGreaterThan(c.fourCp.alertDays);
      }
    }
  }, 120_000);
});
