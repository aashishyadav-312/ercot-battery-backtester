import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteCsv, type Point, type Settings } from '../../v4/site/siteValue';
import { nearbyBatteries, type BatteriesFile } from '../nearby';
import { onlineLabel, parseBatteries, readReport, releaseLabel, reportCsv, siteReportHash, storageLines, storageSheet } from './report';

const FILE: BatteriesFile = JSON.parse(readFileSync(resolve(process.cwd(), '../results/v5/batteries/tx_batteries.json'), 'utf8'));
const S: Settings = { year: 2025, durationH: 2, mode: 'realistic', basis: 'energy' };
const STRIP: Point[] = [{ year: 2025, label: '2025', partial: false, range: { min: 1, max: 3, median: 2, n: 2, of: 2, nodes: [{ code: 'A', km: 3.04, value: 1 }, { code: 'B', km: 9, value: 3 }] }, hubCode: 'HB_X', hub: 2.5 }];

describe('siteReportHash', () => {
  it('writes lat, lon, dur and year; Energy and the day-ahead plan are the defaults and are not written', () => {
    expect(siteReportHash({ lat: 31.5, lon: -97.123456 }, S)).toBe('#/site?lat=31.5000&lon=-97.1235&dur=2&year=2025');
  });
  it('writes basis=stack, and the strategy only when it is not the default', () => {
    expect(siteReportHash({ lat: 31, lon: -97 }, { ...S, basis: 'stack' })).toBe('#/site?lat=31.0000&lon=-97.0000&dur=2&year=2025&basis=stack');
    expect(siteReportHash({ lat: 31, lon: -97 }, { ...S, mode: 'foresight' })).toContain('mode=foresight');
  });
  it('keeps other parameters of the current address and replaces the site keys', () => {
    const h = siteReportHash({ lat: 31, lon: -97 }, S, '#/atlas?lat=1&lon=2&dur=4&basis=stack&v5=1&adv=1');
    expect(h).toBe('#/site?lat=31.0000&lon=-97.0000&dur=2&year=2025&v5=1&adv=1');
  });
  it('is read back by readReport', () => {
    expect(readReport(siteReportHash({ lat: 31, lon: -97 }, { ...S, basis: 'stack' }))).toEqual({ lat: 31, lon: -97, durationH: 2, year: 2025, basis: 'stack' });
    expect(readReport('#/site?lat=abc&lon=-97')).toBeNull();
    expect(readReport('#/site')).toBeNull();
  });
});

describe('storage wording', () => {
  it('names the release month and the online month', () => {
    expect(releaseLabel('2026-09')).toBe('September 2026');
    expect(releaseLabel('later')).toBe('later');
    expect(onlineLabel('2026-03')).toBe('Mar 2026');
    expect(onlineLabel(null)).toBe('no date');
  });
  it('rejects a batteries file that does not look right', () => {
    expect(parseBatteries(FILE)).not.toBeNull();
    expect(parseBatteries(null)).toBeNull();
    expect(parseBatteries('<html>')).toBeNull();
    expect(parseBatteries({ ...FILE, units: [{ ...FILE.units[0], lat: 'x' }] })).toBeNull();
  });
  it('the summary line states the same totals as nearbyBatteries', () => {
    const near = nearbyBatteries(FILE.units, 31.8, -102, 40);
    const line = storageLines(near, 40)[0];
    expect(line).toContain(`${Math.round(near.operatingMw).toLocaleString('en-US')} MW operating in ${near.operatingCount}`);
    expect(line).toContain(`${Math.round(near.plannedMw).toLocaleString('en-US')} MW planned in ${near.plannedCount}`);
  });
});

describe('CSV', () => {
  it('without storage it is the V4 site CSV', () => {
    expect(reportCsv({ name: 'X', lat: 31, lon: -97 }, S, STRIP, null)).toEqual(siteCsv({ name: 'X', lat: 31, lon: -97 }, S, STRIP));
  });
  it('with storage the V4 rows come first, then the Storage nearby block with the release and the nearest units', () => {
    const near = nearbyBatteries(FILE.units, 31.8, -102, 40);
    const base = siteCsv({ name: 'X', lat: 31.8, lon: -102 }, S, STRIP);
    const { rows } = reportCsv({ name: 'X', lat: 31.8, lon: -102 }, S, STRIP, { file: FILE, near, radiusKm: 40 });
    expect(rows.slice(0, base.rows.length)).toEqual(base.rows);
    const rest = rows.slice(base.rows.length);
    expect(rest[0]).toEqual([]);
    expect(rest[1]).toEqual(['Storage nearby']);
    expect(rest[3]).toEqual([40, Math.round(near.operatingMw * 10) / 10, near.operatingCount, Math.round(near.plannedMw * 10) / 10, near.plannedCount, FILE.release, FILE.sourceUrl]);
    expect(rest.length).toBe(4 + 2 + near.nearest.length);
  });
  it('the print block lists the same units', () => {
    const near = nearbyBatteries(FILE.units, 31.8, -102, 40);
    const sheet = storageSheet(FILE, near, 40);
    expect(sheet.rows.map((r) => r.name)).toEqual(near.nearest.map((u) => u.name));
    expect(sheet.source).toContain(FILE.sourceUrl);
  });
});
