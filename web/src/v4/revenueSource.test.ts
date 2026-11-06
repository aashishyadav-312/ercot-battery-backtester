import { describe, expect, it } from 'vitest';
import { fixtureFile } from './fixture';
import { parseStackIndex } from './site/stackIndex';
import { AS_UPPER_BOUND_NOTE } from './config';
import {
  carryRevParams, economicsDuration, economicsLink, effectiveSource, offeredStack, parseRevHash, parseRevParams, revOptions, revenueOf, sourceDetail, stackModeOf, withRevParams,
  type Offered,
} from './revenueSource';
import { economicsVerdict } from '../data/notes';
import { DEFAULTS, compute } from '../data/economics';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const keys = parseStackIndex(JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/v4/stack/index.json'), 'utf8')));
const file = fixtureFile(2025, 2, 'foresight');
const stack = offeredStack(keys, file, 2025, 2, 'pf', 'HB_HOUSTON')!;
const dc = { perKwYr: 77.5, label: 'case' };
const offeredAll: Offered = { stack: stack.row, stackMeta: stack.meta, dc };
const offeredNone: Offered = { stack: null, stackMeta: null, dc: null };
const hash = '#/research/economics?loc=HB_HOUSTON&dur=2&year=2025&deg=10';

describe('stack availability', () => {
  it('maps perfect foresight to the foresight file and the day-ahead plan to the realistic one', () => {
    expect(stackModeOf('pf')).toBe('foresight');
    expect(stackModeOf('da')).toBe('realistic');
  });
  it('is offered only when the index lists it and the file has the node', () => {
    expect(stack.row.total).toBe(file.nodes.HB_HOUSTON.total);
    expect(offeredStack(keys, file, 2025, 2, 'pf', 'NOT_A_NODE')).toBeNull();
    expect(offeredStack(keys, file, 2024, 2, 'pf', 'HB_HOUSTON')).toBeNull(); // 2024 is not in the index
    expect(offeredStack(keys, file, 2025, 2, 'da', 'HB_HOUSTON')).not.toBeNull();
    expect(offeredStack(keys, null, 2025, 2, 'pf', 'HB_HOUSTON')).toBeNull();
    expect(offeredStack(null, file, 2025, 2, 'pf', 'HB_HOUSTON')).toBeNull();
    expect(offeredStack([], file, 2025, 2, 'pf', 'HB_HOUSTON')).toBeNull();
  });
  it('shows the pill only when there is something besides Energy', () => {
    expect(revOptions(offeredNone)).toEqual(['energy']);
    expect(revOptions({ stack: stack.row, dc: null })).toEqual(['energy', 'stack']);
    expect(revOptions({ stack: null, dc })).toEqual(['energy', 'dc']);
    expect(revOptions(offeredAll)).toEqual(['energy', 'stack', 'dc']);
  });
  it('falls back to Energy when the requested source has no data', () => {
    expect(effectiveSource('stack', offeredNone)).toBe('energy');
    expect(effectiveSource('dc', { stack: stack.row, dc: null })).toBe('energy');
    expect(effectiveSource('stack', offeredAll)).toBe('stack');
  });
});

describe('revenue and NPV per source', () => {
  const res = (revenuePerKwYr: number) => ({ durationH: 2, cyclesPerYear: 300, revenuePerKwYr });
  it('uses the energy figure, the stack total or the Data Center total', () => {
    expect(revenueOf('energy', 40, offeredAll)).toBe(40);
    expect(revenueOf('stack', 40, offeredAll)).toBe(stack.row.total);
    expect(revenueOf('dc', 40, offeredAll)).toBe(77.5);
    expect(revenueOf('stack', 40, offeredNone)).toBe(40);
  });
  it('recomputes NPV with each source', () => {
    const npv = (src: 'energy' | 'stack' | 'dc') => compute(DEFAULTS, res(revenueOf(src, 40, offeredAll))).npv;
    expect(npv('stack')).toBeGreaterThan(npv('energy')); // the fixture stack is worth more than its energy part
    expect(npv('dc')).toBeGreaterThan(npv('stack'));
    expect(new Set([npv('energy'), npv('stack'), npv('dc')]).size).toBe(3);
  });
  it('describes the stack split and keeps the 2023 upper-bound label', () => {
    const d = sourceDetail('stack', offeredAll, 'pf');
    expect(d.split).toEqual({ energy: stack.row.energy, ancillary: stack.row.total - stack.row.energy });
    expect(d.upperBoundNote).toBeNull();
    const meta2023 = { ...stack.meta, year: 2023 };
    const d23 = sourceDetail('stack', { ...offeredAll, stackMeta: meta2023 }, 'pf');
    expect(d23.upperBoundNote).toBe(AS_UPPER_BOUND_NOTE);
    expect(d23.yearNote).toContain('upper bound');
    const dp = sourceDetail('stack', { ...offeredAll, stackMeta: { ...stack.meta, partialYear: true, monthsCovered: 10 } }, 'pf');
    expect(dp.yearNote).toContain('annualized');
    expect(sourceDetail('energy', offeredAll, 'pf').split).toBeNull();
  });
});

describe('URL', () => {
  it('writes nothing for the defaults, so existing URLs do not change', () => {
    expect(withRevParams(hash, { rev: 'energy', plan: 'pf', dc: null, dcDur: null })).toBe(hash);
  });
  it('round-trips each source and the plan', () => {
    for (const p of [
      { rev: 'stack', plan: 'pf', dc: null, dcDur: null }, { rev: 'stack', plan: 'da', dc: null, dcDur: null },
      { rev: 'dc', plan: 'pf', dc: 61.25, dcDur: 2 }, { rev: 'dc', plan: 'pf', dc: 61.25, dcDur: 1.5 }, { rev: 'energy', plan: 'da', dc: null, dcDur: null },
    ] as const) {
      const h = withRevParams(hash, p);
      expect(parseRevHash(h)).toEqual(p);
      expect(h.startsWith(hash)).toBe(true); // the scenario part is untouched
    }
  });
  it('ignores unknown values', () => {
    expect(parseRevParams('rev=banana&src=x&dc=abc&dcd=0')).toEqual({ rev: 'energy', plan: 'pf', dc: null, dcDur: null });
    expect(parseRevParams('')).toEqual({ rev: 'energy', plan: 'pf', dc: null, dcDur: null });
  });
  it('keeps the choice when the scenario changes', () => {
    const from = withRevParams(hash, { rev: 'dc', plan: 'da', dc: 50, dcDur: 4 });
    const to = carryRevParams(from, '#/research/economics?loc=HB_WEST&dur=4&year=2025&deg=10');
    expect(to).toContain('loc=HB_WEST');
    expect(parseRevHash(to)).toEqual({ rev: 'dc', plan: 'da', dc: 50, dcDur: 4 });
    expect(carryRevParams(hash, '#/x?a=1')).toBe('#/x?a=1');
  });
  it('builds the link from a Data Center result', () => {
    const link = economicsLink(hash, 61.2549, 4);
    expect(parseRevHash(link)).toEqual({ rev: 'dc', plan: 'pf', dc: 61.25, dcDur: 4 });
  });
  it('does not write the duration unless the Data Center site is the source', () => {
    expect(withRevParams(hash, { rev: 'stack', plan: 'pf', dc: 50, dcDur: 4 })).not.toContain('dcd');
  });
});

describe('Data Center duration', () => {
  it('follows the case while Data Center site is the source, else the scenario', () => {
    const c = { perKwYr: 50, label: 'case', durationH: 4 };
    expect(economicsDuration('dc', c, 2)).toBe(4);
    expect(economicsDuration('energy', c, 2)).toBe(2);
    expect(economicsDuration('stack', c, 2)).toBe(2);
    expect(economicsDuration('dc', { perKwYr: 50, label: 'case' }, 2)).toBe(2); // a case with no duration leaves the scenario's
    expect(economicsDuration('dc', null, 2)).toBe(2);
  });
  it('says so in one line', () => {
    expect(sourceDetail('dc', { ...offeredAll, dc: { perKwYr: 50, label: 'case', durationH: 4 } }, 'pf').extra).toContain('battery duration is the case');
  });
  it('costs the case at its own duration', () => {
    const at = (h: number) => compute(DEFAULTS, { durationH: h, cyclesPerYear: 300, revenuePerKwYr: 77.5 }).netCapex;
    expect(at(4)).toBeCloseTo(2 * at(2), 6);
  });
});

describe('haircut', () => {
  // Every source goes through the same compute(): year 1 revenue = revenue x (1 - haircut), less O&M.
  it('applies the same way to Energy, Full stack and Data Center site', () => {
    for (const src of ['energy', 'stack', 'dc'] as const) {
      const revenue = revenueOf(src, 40, offeredAll);
      const flows = compute({ ...DEFAULTS, haircut: 0.25, decline: 0 }, { durationH: 2, cyclesPerYear: 300, revenuePerKwYr: revenue }).cashFlows;
      expect(flows[1] + DEFAULTS.omPerKwYr).toBeCloseTo(revenue * 0.75, 6);
    }
  });
});

describe('verdict', () => {
  const bad = compute({ ...DEFAULTS, costPerKwh: 1000 }, { durationH: 2, cyclesPerYear: 300, revenuePerKwYr: 20 });
  const good = compute({ ...DEFAULTS, costPerKwh: 1 }, { durationH: 2, cyclesPerYear: 300, revenuePerKwYr: 200 });
  it('suggests Full stack only when NPV is negative on Energy and a stack option exists', () => {
    expect(economicsVerdict(bad, { source: 'energy', stackOffered: true })).toContain('Try a lower installed cost or add a tax credit. Full stack revenue is available');
    expect(economicsVerdict(bad, { source: 'energy', stackOffered: false })).not.toContain('Full stack');
    expect(economicsVerdict(bad, { source: 'stack', stackOffered: true })).not.toContain('is available');
    expect(economicsVerdict(good, { source: 'energy', stackOffered: true })).not.toContain('Full stack');
  });
  it('names the source in the sentence', () => {
    expect(economicsVerdict(bad, { source: 'stack' })).toContain('full stack revenue does not pay back');
    expect(economicsVerdict(good, { source: 'dc' })).toContain('the Data Center site revenue pays back');
    expect(economicsVerdict(bad)).toContain('energy arbitrage alone does not pay back'); // unchanged without a context
  });
});
