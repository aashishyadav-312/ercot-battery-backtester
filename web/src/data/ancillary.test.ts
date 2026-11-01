import { describe, it, expect } from 'vitest';
import { pairedStack, sumStack, stackBounds, type StackDay } from './ancillary';
const day = (date: string, energy = 1): StackDay => ({date, energy, energy_only: 2,
  REGUP: 1, REGDN: 1, RRS: 1, ECRS: 1, NSPIN: 1, market: 'DA'});
describe('ancillary comparison accounting', () => {
  it('propagates each daily solver gap into monetary uncertainty', () => {
    const r = stackBounds([{...day('2025-01-01'),solver_gap:.01},{...day('2025-01-02'),solver_gap:0}]);
    expect(r.lower).toBe(12);
    expect(r.upper).toBeCloseTo(12.06);
    expect(stackBounds([day('2025-01-01')]).upper).toBeNull();
  });
  it('retains rounding uncertainty when a tiny primal rounds to zero', () => {
    const r = {...day('2025-01-01'),energy:0,REGUP:0,REGDN:0,RRS:0,ECRS:0,NSPIN:0,energy_only:0,solver_gap:1e6};
    expect(stackBounds([r]).lower).toBe(0);
    expect(stackBounds([r]).upper).toBeGreaterThanOrEqual(3);
  });
  it('uses the energy-only re-solve rather than the displaced energy component', () => {
    expect(sumStack([day('2025-01-01')], false)).toEqual([2,0,0,0,0,0]);
    expect(sumStack([day('2025-01-01')], true).reduce((a,b) => a+b,0)).toBe(6);
  });
  it('compares only pairs inside the specified windows', () => {
    const p = pairedStack([day('2024-12-04'),day('2024-12-05'),day('2025-10-24'),day('2025-10-25')],
      [day('2025-12-04'),day('2025-12-05'),day('2026-10-25')]);
    expect(p.before.map(d => d.date)).toEqual(['2024-12-05']);
    expect(p.after.map(d => d.date)).toEqual(['2025-12-05']);
  });
});
