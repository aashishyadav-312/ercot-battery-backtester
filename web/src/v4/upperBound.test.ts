import { describe, expect, it } from 'vitest';
import { AS_UPPER_BOUND_NOTE, AS_UPPER_BOUND_YEARS } from './config';
import { fixtureFile } from './fixture';
import { isUpperBoundYear, yearTag } from './stack';
import { upperBoundCaveat, yearLabel as siteYearLabel } from './site/siteValue';
import { yearLabel as dcYearLabel } from './dc/dcForm';

const YEAR = AS_UPPER_BOUND_YEARS[0];

describe('upper-bound years are labelled wherever a full-stack value appears', () => {
  it('knows the years', () => {
    expect(isUpperBoundYear(YEAR)).toBe(true);
    expect(isUpperBoundYear(YEAR + 1)).toBe(false);
  });

  it('stack year tag (chart title, Atlas note, CSV basis)', () => {
    const meta = { ...fixtureFile(2025, 2, 'realistic').meta, year: YEAR };
    expect(yearTag(meta)).toBe(`${YEAR} (upper bound)`);
    expect(yearTag({ ...meta, year: YEAR + 1 })).toBe(String(YEAR + 1));
    expect(yearTag({ ...meta, year: YEAR + 1, partialYear: true, monthsCovered: 10 })).toBe(`${YEAR + 1} YTD (10 months)`);
  });

  it('Site Value card year strip and CSV label', () => {
    expect(siteYearLabel(YEAR, false, true)).toBe(`${YEAR} (upper bound)`);
    expect(siteYearLabel(YEAR, false)).toBe(String(YEAR));
    expect(siteYearLabel(2026, true, false)).toBe('2026 YTD, annualized');
  });

  it('Data Center headline and CSV label, only when the stack was used', () => {
    expect(dcYearLabel(undefined, YEAR, true)).toBe(`${YEAR} (upper bound)`);
    expect(dcYearLabel(undefined, YEAR, false)).toBe(String(YEAR));
  });
});

describe('Site Value card upper-bound note', () => {
  const pt = (year: number, range: unknown, hub: number | null) => ({ year, range: range as never, hub });
  it('appears only for Full stack and only when the upper-bound year has a value', () => {
    expect(upperBoundCaveat('stack', [pt(YEAR, { min: 1, median: 2, max: 3, n: 3 }, null), pt(YEAR + 2, null, null)])).toBe(AS_UPPER_BOUND_NOTE);
    expect(upperBoundCaveat('stack', [pt(YEAR, null, 5)])).toBe(AS_UPPER_BOUND_NOTE);
    expect(upperBoundCaveat('stack', [pt(YEAR, null, null), pt(YEAR + 2, { min: 1, median: 2, max: 3, n: 3 }, null)])).toBeNull();
    expect(upperBoundCaveat('stack', [pt(YEAR + 2, { min: 1, median: 2, max: 3, n: 3 }, null)])).toBeNull();
    expect(upperBoundCaveat('energy', [pt(YEAR, { min: 1, median: 2, max: 3, n: 3 }, null)])).toBeNull();
  });
});
