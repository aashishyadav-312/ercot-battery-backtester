import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RTCB_GO_LIVE } from './config';
import { FIXTURE_DIR, fixtureFile } from './fixture';
import {
  PRODUCTS, eraLabel, eraOfYear, isFixture, stackAdds, stackCsv, stackPath, sumProducts, totalRange, withStackRevenue, yearStacks, yearTag,
} from './stack';
import type { NodeRec } from '../data/types';

const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));

describe('fixture files follow the Stack results schema', () => {
  it.each(files)('%s', (f) => {
    const d = JSON.parse(readFileSync(resolve(FIXTURE_DIR, f), 'utf8'));
    expect(Object.keys(d).sort()).toEqual(['meta', 'nodes']);
    expect(Object.keys(d.meta).sort()).toEqual(['assumptions', 'durationH', 'generated', 'mode', 'monthsCovered', 'partialYear', 'products', 'rtcb', 'sources', 'year']);
    expect(f).toBe(stackPath(d.meta.year, d.meta.durationH, d.meta.mode).replace('v4/stack/', ''));
    expect(d.meta.products).toEqual([...PRODUCTS]);
    expect(isFixture(d)).toBe(true);
    expect(d.meta.assumptions.join(' ')).toMatch(/FIXTURE/);
    expect(Object.keys(d.nodes)).toHaveLength(6);
    for (const row of Object.values(d.nodes) as Record<string, number>[]) {
      expect(Object.keys(row).sort()).toEqual([...PRODUCTS, 'total'].sort());
      expect(stackAdds(row as never)).toBe(true);
    }
  });
  it('covers 3 hubs, 3 nodes and 2 years', () => {
    const f = fixtureFile(2025, 2, 'realistic');
    expect(Object.keys(f.nodes).filter((c) => c.startsWith('HB_'))).toHaveLength(3);
    expect(Object.keys(f.nodes).filter((c) => !c.startsWith('HB_'))).toHaveLength(3);
    expect(new Set(files.map((n) => n.slice(0, 4))).size).toBe(2);
  });
  it('realistic never beats foresight', () => {
    for (const [y, d] of [[2025, 2], [2025, 4], [2026, 2], [2026, 4]] as const) {
      const r = fixtureFile(y, d, 'realistic');
      const f = fixtureFile(y, d, 'foresight');
      for (const c of Object.keys(r.nodes)) expect(r.nodes[c].total).toBeLessThanOrEqual(f.nodes[c].total);
    }
  });
});

describe('stack sums', () => {
  it('total equals the six products', () => {
    const row = fixtureFile(2025, 2, 'realistic').nodes.HB_WEST;
    expect(sumProducts(row)).toBeCloseTo(row.total, 1);
  });
  it('a row that does not add up is caught', () => {
    expect(stackAdds({ energy: 10, regup: 1, regdn: 1, rrs: 1, ecrs: 1, nsrs: 1, total: 20 })).toBe(false);
  });
});

describe('pre/post RTC+B marker', () => {
  it('go-live date is the one in the repository study results/rtcb.json', () => {
    const rtcb = JSON.parse(readFileSync(resolve(process.cwd(), '../results/rtcb.json'), 'utf8'));
    expect(RTCB_GO_LIVE).toBe(rtcb.meta.after.start);
  });
  it('years are pre, mixed or post around that date', () => {
    expect(eraOfYear(2024)).toBe('pre');
    expect(eraOfYear(2025)).toBe('mixed');
    expect(eraOfYear(2026)).toBe('post');
  });
  it('the fixture files agree with the date', () => {
    for (const y of [2025, 2026]) expect(fixtureFile(y, 2, 'realistic').meta.rtcb).toBe(eraOfYear(y));
  });
  it('labels', () => {
    expect([eraLabel('pre'), eraLabel('post'), eraLabel('mixed')]).toEqual(['Before RTC+B', 'After RTC+B', 'Spans RTC+B go-live']);
  });
});

describe('years and ranges', () => {
  const set = {
    realistic: new Map([[2025, fixtureFile(2025, 2, 'realistic')], [2026, fixtureFile(2026, 2, 'realistic')]]),
    foresight: new Map([[2025, fixtureFile(2025, 2, 'foresight')]]),
  };
  it('one entry per year with a row, oldest first; the upper bound can be missing', () => {
    const ys = yearStacks('HB_HOUSTON', set);
    expect(ys.map((y) => y.year)).toEqual([2025, 2026]);
    expect(ys[1].foresight).toBeNull();
    expect(totalRange(ys[0].realistic, ys[0].foresight)).toEqual({ low: ys[0].realistic!.total, high: ys[0].foresight!.total });
    expect(totalRange(ys[1].realistic, ys[1].foresight).high).toBeNull();
  });
  it('a location with no row gives nothing', () => {
    expect(yearStacks('NO_SUCH_NODE', set)).toEqual([]);
  });
  it('partial years say so', () => {
    expect(yearTag(fixtureFile(2026, 2, 'realistic').meta)).toBe('2026 YTD (10 months)');
    expect(yearTag(fixtureFile(2025, 2, 'realistic').meta)).toBe('2025');
  });
  it('csv has one row per year and mode', () => {
    const { headers, rows } = stackCsv(yearStacks('HB_HOUSTON', set));
    expect(rows).toHaveLength(3);
    expect(headers).toHaveLength(rows[0].length);
    expect(rows[0].slice(3, 9)).toEqual(PRODUCTS.map((p) => fixtureFile(2025, 2, 'realistic').nodes.HB_HOUSTON[p]));
  });
});

describe('Atlas metric swap', () => {
  const rec = (code: string, rev: number) => ({ code, rev } as unknown as NodeRec);
  it('replaces revenue by the stack total, and drops nodes with no row', () => {
    const f = fixtureFile(2025, 2, 'realistic');
    const { nodes, missing } = withStackRevenue([rec('RUSSEKST_RN', 176), rec('OTHER_RN', 50)], f);
    expect(nodes[0].rev).toBe(f.nodes.RUSSEKST_RN.total);
    expect(nodes[1].rev).toBeNull();
    expect(missing).toBe(1);
  });
  it('can show the energy part', () => {
    const f = fixtureFile(2025, 2, 'realistic');
    expect(withStackRevenue([rec('HB_WEST', 1)], f, 'energy').nodes[0].rev).toBe(f.nodes.HB_WEST.energy);
  });
});
