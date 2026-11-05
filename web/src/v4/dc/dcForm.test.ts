/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import rules from '../../custom/config/datacenter_rules.json';
import type { DataCenterResult, FourCpYear } from '../../custom/datacenter';
import { parseStackIndex } from '../site/stackIndex';
import { FOURCP_YEARS, STACK_BATTERY } from '../config';
import {
  DC_DEFAULTS, breakdownRows, dcCsv, dcHash, dcLinkFromSite, dcQuery, dcYears, fitWindow, isDcHash, localSpan, parseDcQuery,
  stackChoice, toEngineInputs, validateDcForm, waterfall, windowMisses, yearLabel, type DcCoverage, type DcForm,
} from './dcForm';

const RESULTS = fileURLToPath(new URL('../../../../results/', import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(`${RESULTS}${p}`, 'utf8'));
const fourCp = (y: number): FourCpYear => json(`v4/fourcp/${y}.json`);
const KEYS = parseStackIndex(json('v4/stack/index.json'));

const COVERAGE: DcCoverage[] = [
  { location: 'HB_HOUSTON', year: 2024, first: '2024-01-01', last: '2024-12-31' },
  { location: 'HB_HOUSTON', year: 2025, first: '2025-01-01', last: '2025-12-31' },
  { location: 'HB_HOUSTON', year: 2026, first: '2026-01-01', last: '2026-10-31' },
  { location: 'HB_WEST', year: 2025, first: '2025-01-01', last: '2025-12-31' },
  { location: 'ANSON1_ALL', year: 2025, first: '2025-01-01', last: '2025-12-31' },
  { location: 'HB_WEST', year: 2022, first: '2022-01-01', last: '2022-12-31' },
];
const base = (): DcForm => parseDcQuery('mode=dc', COVERAGE);

describe('config pins', () => {
  it('4CP years match the files', () => {
    const years = readdirSync(`${RESULTS}v4/fourcp`).filter((f) => /^\d{4}\.json$/.test(f)).map((f) => Number(f.slice(0, 4))).sort();
    expect(years).toEqual([...FOURCP_YEARS]);
  });
  it('the stack battery matches every stack file', () => {
    for (const f of readdirSync(`${RESULTS}v4/stack`).filter((n) => n !== 'index.json')) {
      const a = json(`v4/stack/${f}`).meta.assumptions[0] as string;
      expect(a).toContain(`round-trip efficiency ${STACK_BATTERY.rte}`);
      expect(a).toContain(`degradation ${STACK_BATTERY.degCost} $/MWh`);
    }
  });
  it('defaults come from the rules config', () => {
    expect(DC_DEFAULTS.fourCpRatePerKw).toBe(rules.fourCp.defaultRatePerKwPer4cp.value);
    expect(DC_DEFAULTS.valueOfLostLoad).toBe(rules.defaults.valueOfLostLoad.value);
    expect(DC_DEFAULTS.curtailmentHoursPerYear).toBe(rules.defaults.curtailmentHoursPerYear.value);
    expect(rules.defaults.valueOfLostLoad.label).toBe('ERCOT-wide average, not data-center specific');
  });
});

describe('4CP alert window', () => {
  it('the default window holds every official 2023 to 2025 interval, so it needs no widening', () => {
    for (const y of [2023, 2024, 2025]) {
      const f = fourCp(y);
      expect(f.status).toBe('official');
      expect(windowMisses(f.intervals, DC_DEFAULTS.windowStartHour, DC_DEFAULTS.windowEndHour)).toEqual([]);
      expect(fitWindow(f.intervals, DC_DEFAULTS.windowStartHour, DC_DEFAULTS.windowEndHour)).toEqual([DC_DEFAULTS.windowStartHour, DC_DEFAULTS.windowEndHour]);
    }
  });
  it('the computed 2026 intervals also fall inside', () => {
    expect(windowMisses(fourCp(2026).intervals, DC_DEFAULTS.windowStartHour, DC_DEFAULTS.windowEndHour)).toEqual([]);
  });
  it('reads the counted span in local minutes (label 17:45 ending counts 17:30 to 18:00)', () => {
    const iv = fourCp(2024).intervals.find((i) => i.interval_ending_local.endsWith('17:45'))!;
    expect(localSpan(iv)).toMatchObject({ start: 17 * 60 + 30, end: 18 * 60 });
  });
  it('flags misses and widens a narrow window to whole hours', () => {
    const ivs = fourCp(2024).intervals;
    expect(windowMisses(ivs, 16, 17).length).toBeGreaterThan(0);
    expect(fitWindow(ivs, 16, 17)).toEqual([15, 18]);
    expect(windowMisses(ivs, ...fitWindow(ivs, 16, 17))).toEqual([]);
  });
});

describe('link', () => {
  it('round-trips every field and the site', () => {
    const f: DcForm = {
      ...base(), loc: 'HB_WEST', year: 2025, siteLoadMw: 250, loadFactor: 0.8, exportAllowed: true, batteryMw: 80, batteryMwh: 320,
      rte: 0.9, fourCpRatePerKw: 12, fourCpStrategy: 'foresight', windowStartHour: 14, windowEndHour: 19, curtailmentHoursPerYear: 6,
      valueOfLostLoad: 9000, asEnabled: false, site: { label: 'Jack County', lat: 33.2, lon: -98.2, node: 'ANSON1_ALL', km: 12.3 },
    };
    const hash = dcHash(f);
    expect(isDcHash(hash)).toBe(true);
    expect(parseDcQuery(hash.split('?')[1], COVERAGE)).toEqual(f);
  });
  it('leaves defaults out and keeps old Studio links in battery mode', () => {
    expect(dcQuery(base())).toBe('mode=dc&loc=HB_HOUSTON&year=2025');
    expect(isDcHash('#/studio?loc=HB_WEST&dur=2')).toBe(false);
    expect(isDcHash('#/atlas?mode=dc')).toBe(false);
  });
  it('falls back for unknown locations and years', () => {
    const f = parseDcQuery('mode=dc&loc=NOPE&year=1999&mw=abc', COVERAGE);
    expect(f.loc).toBe('HB_HOUSTON');
    expect(f.year).toBe(2025); // the latest full year
    expect(f.batteryMw).toBe(DC_DEFAULTS.batteryMw);
    expect(parseDcQuery('mode=dc&loc=HB_WEST&year=2022', COVERAGE).year).toBe(2025); // no 4CP file for 2022
  });
  it('from the Site Value card: site, nearest node, duration and mode', () => {
    const hash = dcLinkFromSite({ loc: 'HB_WEST', year: 2025, durationH: 4, mode: 'foresight', site: { label: 'Jack County', lat: 33.2, lon: -98.2, node: 'JACKCNTY_X', km: 4 } });
    const f = parseDcQuery(hash.split('?')[1], COVERAGE);
    expect(f).toMatchObject({ loc: 'HB_WEST', year: 2025, batteryMw: DC_DEFAULTS.batteryMw, batteryMwh: DC_DEFAULTS.batteryMw * 4, fourCpStrategy: 'foresight' });
    expect(f.site).toEqual({ label: 'Jack County', lat: 33.2, lon: -98.2, node: 'JACKCNTY_X', km: 4 });
  });
});

describe('years and validation', () => {
  it('labels a partial year', () => {
    const c = dcYears(COVERAGE, 'HB_HOUSTON');
    expect(c.map((x) => x.year)).toEqual([2024, 2025, 2026]);
    expect(yearLabel(c[2], 2026)).toBe('2026 YTD, annualized');
    expect(yearLabel(c[1], 2025)).toBe('2025');
  });
  it('accepts the defaults and reports bad inputs in plain words', () => {
    expect(validateDcForm(base(), COVERAGE, null)).toEqual([]);
    const errs = validateDcForm({ ...base(), siteLoadMw: 0, batteryMw: Number.NaN, rte: 2, windowStartHour: 18, windowEndHour: 15 }, COVERAGE, null);
    expect(errs).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Site load \(MW\) must be between/), 'Battery power (MW) must be a number.',
      expect.stringMatching(/^Round-trip efficiency must be between/), 'The 4CP window must be whole hours with start before end.',
    ]));
    expect(validateDcForm({ ...base(), year: 2023 }, COVERAGE, null)).toEqual(['No price file and 4CP data for HB_HOUSTON in 2023.']);
    expect(validateDcForm(base(), COVERAGE, [1, 2, 3])[0]).toMatch(/8760 or 8784/);
  });
});

describe('stack match', () => {
  it('uses a listed file for the same year, duration and mode', () => {
    expect(stackChoice(base(), KEYS)).toEqual({ status: 'match', key: { year: 2025, durationH: 2, mode: 'realistic' } });
    expect(stackChoice({ ...base(), fourCpStrategy: 'foresight', batteryMwh: 200 }, KEYS)).toEqual({ status: 'match', key: { year: 2025, durationH: 4, mode: 'foresight' } });
  });
  it('is energy only, with a reason, otherwise', () => {
    expect(stackChoice({ ...base(), asEnabled: false }, KEYS)).toEqual({ status: 'off' });
    const odd = stackChoice({ ...base(), batteryMwh: 150 }, KEYS);
    expect(odd.status).toBe('none');
    expect(odd.status === 'none' && odd.reason).toMatch(/3-hour battery.*Durations with a stack for 2025: 1 h, 2 h, 4 h/);
    expect(stackChoice({ ...base(), rte: 0.9 }, KEYS).status).toBe('none');
    expect(stackChoice(base(), []).status).toBe('none');
  });
  it('the engine gets ancillary services only with a stack row', () => {
    const cp = fourCp(2025);
    expect(toEngineInputs(base(), cp, null, null).asEnabled).toBe(false);
    const row = { energy: 1, regup: 2, regdn: 3, rrs: 4, ecrs: 5, nsrs: 6, total: 21 };
    expect(toEngineInputs(base(), cp, row, null)).toMatchObject({ asEnabled: true, asStack: row, degCost: STACK_BATTERY.degCost, node: 'HB_HOUSTON' });
  });
});

describe('outputs', () => {
  const result = {
    perKwYr: 100, totalUsd: 5_000_000,
    breakdown: { energy: 2_000_000, as: 1_500_000, fourCp: 1_000_000, reliability: 500_000 },
    breakdownPerKwYr: { energy: 40, as: 30, fourCp: 20, reliability: 10 },
    standalone: { totalUsd: 3_000_000, perKwYr: 60, energy: 2_000_000, as: 1_000_000 },
    fourCpDetail: [{ month: 6, intervalEndingLocal: '2025-06-19T17:00', cutMw: 50, covered: true, alertDay: true, valueUsd: 857_000 }],
    dispatchSample: null, alertDays: 3, reservedHours: 9, daysCovered: 365, daysSolved: 365, skippedDays: [], annualized: false, notes: ['A note.'],
  } as DataCenterResult;
  it('breakdown rows are the engine values and sum to the totals', () => {
    const rows = breakdownRows(result);
    expect(rows.map((r) => r.key)).toEqual(['energy', 'as', 'fourCp', 'reliability']);
    expect(rows.reduce((a, r) => a + r.usd, 0)).toBe(result.totalUsd);
    expect(rows.reduce((a, r) => a + r.perKw, 0)).toBe(result.perKwYr);
  });
  it('waterfall steps stack to the total, with a negative part going down', () => {
    const w = waterfall({ energy: 40, as: -10, fourCp: 20, reliability: 0 });
    expect(w.map((s) => [s.base, s.value, s.end])).toEqual([[0, 40, 40], [30, 10, 30], [30, 20, 50], [50, 0, 50], [0, 50, 50]]);
  });
  it('CSV holds the inputs, the outputs and the notes', () => {
    const f = { ...base(), site: { label: 'Jack County', lat: 33.2, lon: -98.2, node: 'X', km: 3 } };
    const { headers, rows } = dcCsv(f, result, { yearLabel: '2025', stackNote: 'Energy only. Reason.', profileName: null });
    expect(headers).toEqual(['Section', 'Item', 'Value', 'Unit']);
    const find = (s: string, i: string, u?: string) => rows.find((r) => r[0] === s && r[1] === i && (u == null || r[3] === u))?.[2];
    expect(find('Site', 'Name')).toBe('Jack County');
    expect(find('Input', 'Battery power')).toBe(DC_DEFAULTS.batteryMw);
    expect(find('Input', 'Value of lost load')).toBe(DC_DEFAULTS.valueOfLostLoad);
    expect(find('Output', '4CP avoided', '$/kW-yr')).toBe(20);
    expect(find('Output', 'Total', '$/yr')).toBe(5_000_000);
    expect(find('Output', 'Standalone at HB_HOUSTON', '$/kW-yr')).toBe(60);
    expect(rows.filter((r) => r[0] === 'Note').map((r) => r[2])).toEqual(['Energy only. Reason.', 'A note.']);
  });
});
