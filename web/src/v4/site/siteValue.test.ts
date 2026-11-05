import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IndexRun, NodesFile } from '../../data/types';
import { SITE_DEG } from '../config';
import type { StackFile } from '../stack';
import { parseStackIndex } from './stackIndex';
import {
  CSV_HEADERS, EMPTY_DATA, energyOf, medianOf, pointFor, rangeOf, readSiteFromHash, resolveSettings, siteCsv, stripFor, studioHash, studioLocation, writeSiteToHash, yearLabel, yearsFor,
  type Settings, type SiteData,
} from './siteValue';

const root = (f: string) => resolve(process.cwd(), '..', f);
const N25: NodesFile = JSON.parse(readFileSync(root('results/nodes_2025_2h.json'), 'utf8'));
const N24: NodesFile = JSON.parse(readFileSync(root('results/nodes_2024_2h.json'), 'utf8'));
const RUNS: IndexRun[] = JSON.parse(readFileSync(root('results/index.json'), 'utf8')).runs;
const MANIFEST = [{ year: 2024, durationH: 2, file: 'nodes_2024_2h.json' }, { year: 2025, durationH: 2, file: 'nodes_2025_2h.json' }];
const top = N25.nodes.slice(0, 5);
const near = top.map((n, i) => ({ code: n.code, km: 10 * (i + 1) }));
const data = (extra: Partial<SiteData> = {}): SiteData => ({ ...EMPTY_DATA, manifest: MANIFEST, runs: RUNS, nodeFiles: new Map([[2024, N24], [2025, N25]]), ...extra });
const S: Settings = { year: 2025, durationH: 2, mode: 'foresight', basis: 'energy' };

describe('range math', () => {
  it('median of odd and even counts, min and max', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    const r = rangeOf([{ code: 'A', km: 1, value: 30 }, { code: 'B', km: 2, value: 10 }, { code: 'C', km: 3, value: 20 }], 5)!;
    expect([r.min, r.median, r.max, r.n, r.of]).toEqual([10, 20, 30, 3, 5]);
    expect(rangeOf([], 3)).toBeNull();
  });
  it('energy range over the nearest nodes equals the file rows, per mode', () => {
    const p = pointFor(2025, S, near, 'HB_NORTH', data());
    const v = top.map((n) => n.rev);
    expect([p.range!.min, p.range!.max, p.range!.median]).toEqual([Math.min(...v), Math.max(...v), medianOf(v)]);
    const d = pointFor(2025, { ...S, mode: 'realistic' }, near, 'HB_NORTH', data());
    expect(d.range!.max).toBe(Math.max(...top.map((n) => n.da_rev)));
    expect(energyOf(top[0], 'realistic')).toBe(top[0].da_rev);
  });
  it('a node with no row is left out and counted in "of", never filled in', () => {
    const p = pointFor(2025, S, [...near, { code: 'NOT_A_NODE', km: 99 }], null, data());
    expect(p.range!.n).toBe(5);
    expect(p.range!.of).toBe(6);
    expect(p.hub).toBeNull();
  });
  it('hub value comes from the same file as the nodes', () => {
    const p = pointFor(2025, S, near, 'HB_NORTH', data());
    expect(p.hub).toBe(N25.hubs.find((h) => h.code === 'HB_NORTH')!.rev);
  });
});

describe('years and the partial-year label', () => {
  it('lists the years with a result: all-node files plus hub-only years from the runs', () => {
    expect(yearsFor(data(), 'energy', 2, 'realistic')).toEqual([2024, 2025, 2026]);
    expect(yearsFor(data(), 'energy', 4, 'realistic')).toEqual([2024, 2025, 2026]);
  });
  it('a year with only a hub run has no range, a hub value, and the YTD label when the run is annualized', () => {
    const p = pointFor(2026, S, near, 'HB_NORTH', data());
    const run = RUNS.find((r) => r.location === 'HB_NORTH' && r.year === 2026 && r.duration_h === 2 && r.deg_cost_per_mwh === SITE_DEG)!;
    expect(p.range).toBeNull();
    expect(p.hub).toBe(run.revenue_per_kw_year);
    expect(p.partial).toBe(run.annualized);
    expect(p.label).toBe(run.annualized ? '2026 YTD, annualized' : '2026');
    expect(yearLabel(2026, true)).toBe('2026 YTD, annualized');
    expect(yearLabel(2025, false)).toBe('2025');
  });
  it('the strip has one point per year, oldest first', () => {
    expect(stripFor(S, near, 'HB_NORTH', data()).map((p) => p.year)).toEqual([2024, 2025, 2026]);
  });
  it('the cost used for hub runs is the one in the all-node files', () => {
    expect(SITE_DEG).toBe(N25.meta.deg_cost_per_mwh);
    expect(SITE_DEG).toBe(N24.meta.deg_cost_per_mwh);
  });
});

describe('Full stack only when the index lists the file', () => {
  const file = (partial: boolean): StackFile => ({
    meta: { year: 2026, durationH: 2, mode: 'realistic', products: [], partialYear: partial, monthsCovered: 10, rtcb: 'post', assumptions: [], sources: [], generated: 't' },
    nodes: { [near[0].code]: { energy: 10, regup: 1, regdn: 1, rrs: 1, ecrs: 1, nsrs: 1, total: 15 }, HB_NORTH: { energy: 8, regup: 1, regdn: 1, rrs: 1, ecrs: 1, nsrs: 1, total: 13 } },
  });
  it('without a listing the setting snaps back to Energy', () => {
    expect(resolveSettings({ ...S, basis: 'stack' }, data()).basis).toBe('energy');
  });
  it('with a listing it is kept, and the years come from the listing alone', () => {
    const d = data({ stackKeys: parseStackIndex(['2026_2h_realistic.json']) });
    const s = resolveSettings({ ...S, basis: 'stack', mode: 'foresight' }, d);
    expect(s).toMatchObject({ basis: 'stack', mode: 'realistic', durationH: 2, year: 2026 }); // the only listed mode
    expect(yearsFor(d, 'stack', 2, 'realistic')).toEqual([2026]);
    const p = pointFor(2026, s, near, 'HB_NORTH', { ...d, stackFiles: new Map([[2026, file(true)]]) });
    expect(p.range).toMatchObject({ min: 15, max: 15, n: 1, of: 5 });
    expect(p.hub).toBe(13);
    expect(p.label).toBe('2026 YTD, annualized');
  });
  it('keeps a wanted hub-only year', () => {
    expect(resolveSettings({ ...S, year: 2026 }, data()).year).toBe(2026);
  });
  it('snaps a size or year with no data to one that has it', () => {
    expect(resolveSettings({ year: 2019, durationH: 3, mode: 'realistic', basis: 'energy' }, data())).toMatchObject({ durationH: 2, year: 2025 });
  });
});

describe('shareable URL', () => {
  it('round-trips the site and settings and keeps other parameters', () => {
    const h = writeSiteToHash('#/atlas?v4=1&loc=HB_WEST', { lat: 33.2, lon: -98.2 }, { year: 2025, durationH: 4, mode: 'realistic', basis: 'stack' });
    expect(h).toBe('#/atlas?v4=1&loc=HB_WEST&lat=33.2000&lon=-98.2000&dur=4&year=2025&mode=realistic&basis=stack');
    expect(readSiteFromHash(h)).toEqual({ lat: 33.2, lon: -98.2, durationH: 4, year: 2025, mode: 'realistic', basis: 'stack' });
    expect(writeSiteToHash(h, null, null)).toBe('#/atlas?v4=1&loc=HB_WEST');
  });
  it('Energy is the default and is not written; old URLs with no site read as none', () => {
    expect(writeSiteToHash('#/atlas', { lat: 31, lon: -99 }, S)).not.toContain('basis');
    for (const h of ['', '#/atlas', '#/atlas?loc=HB_WEST&dur=2&year=2025&deg=10', '#/atlas?lat=x&lon=-98', '#/atlas?lat=33&lon=']) expect(readSiteFromHash(h)).toBeNull();
  });
  it('ignores odd settings', () => {
    expect(readSiteFromHash('#/atlas?lat=33&lon=-98&mode=fast&dur=-1&year=abc')).toEqual({ lat: 33, lon: -98 });
  });
});

describe('Studio link and CSV', () => {
  it('Studio gets a location with price files: the nearest such node, else the hub', () => {
    expect(studioLocation(near, 'HB_NORTH', new Set([near[2].code, 'HB_NORTH']))).toBe(near[2].code);
    expect(studioLocation(near, 'HB_NORTH', new Set(['HB_NORTH']))).toBe('HB_NORTH');
    expect(studioLocation(near, 'HB_NORTH', new Set())).toBeNull();
    expect(studioHash('HB_NORTH', S)).toBe('#/studio?loc=HB_NORTH&dur=2&year=2025&strat=pf');
    expect(studioHash('HB_NORTH', { ...S, mode: 'realistic' })).toContain('strat=da');
  });
  it('CSV has the nodes, the range and the hub for every year, with the same numbers as the card', () => {
    const strip = stripFor(S, near, 'HB_NORTH', data());
    const { headers, rows } = siteCsv({ name: 'Jack County', lat: 33.2, lon: -98.2 }, S, strip);
    expect(headers).toEqual(CSV_HEADERS);
    const y25 = rows.filter((r) => r[3] === '2025');
    expect(y25.filter((r) => r[7] === 'Node')).toHaveLength(5);
    const p = strip.find((x) => x.year === 2025)!;
    expect(y25.find((r) => r[7] === 'Median')![10]).toBe(p.range!.median);
    expect(y25.find((r) => r[7] === 'Nearest hub')![10]).toBe(p.hub);
    expect(rows.find((r) => r[3] === '2026' || String(r[3]).startsWith('2026'))![7]).toBe('Nearest hub'); // hub-only year
    expect(rows.every((r) => r.length === headers.length && r[0] === 'Jack County' && r[5] === 'Perfect foresight')).toBe(true);
  });
});
