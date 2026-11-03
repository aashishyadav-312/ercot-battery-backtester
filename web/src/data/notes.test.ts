import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { degNote, economicsVerdict, topNodeLine, yearNote } from './notes';
import { mapLede, heroFor } from './hero';
import { fmtDate } from './format';
import { compute, DEFAULTS } from './economics';
import type { IndexRun, LocationsFile } from './types';

// Tests run from web/, so results/ is one level up.
const INDEX = (JSON.parse(readFileSync(resolve(process.cwd(), '../results/index.json'), 'utf8')) as { runs: IndexRun[] }).runs;
const LOCS = (JSON.parse(readFileSync(resolve(process.cwd(), '../results/locations.json'), 'utf8')) as LocationsFile).locations;
const hubOf = (c: string) => LOCS.find((l) => l.code === c)?.nearest_hub;

describe('year note', () => {
  const partial = INDEX.filter((r) => r.annualized);
  it('is built from the dates in the results for a partial year', () => {
    if (!partial.length) return;
    const y = partial[0].year;
    const rows = partial.filter((r) => r.year === y);
    const start = rows.map((r) => r.first_day).sort()[0];
    const end = rows.map((r) => r.last_day).sort().at(-1)!;
    expect(yearNote(INDEX, y)).toBe(`${y} = ${fmtDate(start)} to ${fmtDate(end)}, scaled to a full year. Updated monthly.`);
  });
  it('is null for a full year and with no index', () => {
    const full = INDEX.find((r) => !r.annualized)!.year;
    if (!INDEX.some((r) => r.year === full && r.annualized)) expect(yearNote(INDEX, full)).toBeNull();
    expect(yearNote(null, 2024)).toBeNull();
  });
});

describe('degradation note', () => {
  it('lists the precomputed costs', () => {
    expect(degNote([0, 10])).toBe('Precomputed at $0 and $10/MWh. Any other cost: set it in Studio.');
    expect(degNote([5])).toBe('Precomputed at $5/MWh. Any other cost: set it in Studio.');
  });
});

describe('economics verdict', () => {
  it('flips with the sign of NPV', () => {
    const res = { revenuePerKwYr: 50, durationH: 2, cyclesPerYear: 300 };
    const bad = compute({ ...DEFAULTS, costPerKwh: 1000 }, res);
    const good = compute({ ...DEFAULTS, costPerKwh: 1 }, res);
    expect(economicsVerdict(bad)).toContain('does not pay back');
    expect(economicsVerdict(good)).toContain('pays back');
  });
});

describe('study sites hero', () => {
  const sel = { location: 'HB_WEST', duration: 2, year: 2025, deg: 10 };
  const rows = INDEX.filter((r) => r.year === sel.year && r.duration_h === sel.duration && r.deg_cost_per_mwh === sel.deg);
  it('headline ratio is best over weakest from the index', () => {
    const rev = rows.map((r) => r.revenue_per_kw_year);
    const ratio = Math.max(...rev) / Math.min(...rev);
    const h = heroFor('map', undefined, sel, INDEX)!;
    expect(h.plain).toBe(`Same battery, ${ratio.toFixed(1)}× the revenue. Location decides.`);
  });
  it('subhead names a node and its hub, or falls back to best and weakest', () => {
    const line = mapLede(sel, INDEX, hubOf)!;
    expect(line).toMatch(/earned \$[\d,]+\/kW-yr/);
    expect(topNodeLine(rows, () => null)).toBeNull();
  });
});
