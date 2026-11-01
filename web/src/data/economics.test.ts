import { describe, expect, it } from 'vitest';
import { DEFAULTS, annuityFactor, cashFlows, compute, irr, npv, simplePayback, tornado, type Assumptions, type Resource } from './economics';

/*
 * Hand-checked examples.
 *
 * A. Pay 1000, receive 300 a year for 5 years, discount 10%.
 *    Annuity factor a(5, 10%) = (1 - 1.1^-5) / 0.1 = 3.790787
 *    NPV = 300 x 3.790787 - 1000 = +137.236
 *    IRR solves 300 x a(5, r) = 1000, i.e. a(5, r) = 3.3333. a(5, 15%) = 3.35216 and a(5, 16%) = 3.27429, so
 *    r is 24% of the way from 15% to 16%, about 15.24% (precisely 15.2382%).
 *    Payback = 1000 / 300 = 3.333 years.
 *
 * B. Pay 100, receive 110 one year later: IRR is exactly 10%, NPV at 10% is exactly 0.
 *
 * C. A whole project, 1 kW, 2-hour battery, no tax credit, no haircut, no decline, no augmentation:
 *    installed cost $250/kWh x 2 h = $500/kW. Revenue $100/kW-yr, O&M $10/kW-yr, so $90/yr for 10 years at 8%.
 *    a(10, 8%) = 6.710081
 *    NPV      = 90 x 6.710081 - 500 = +103.907
 *    Payback  = 500 / 90 = 5.556 years
 *    Breakeven capex: the PV of the net inflows, 603.907, is the most we could pay per kW, / 2 h = $301.95/kWh
 *    LCOS: 300 cycles x 2 h = 600 kWh/yr discharged. PV costs = 500 + 10 x 6.710081 = 567.101;
 *          PV energy = 600 x 6.710081 = 4026.049 kWh; 567.101 / 4026.049 = $0.14086/kWh = $140.86/MWh
 */

const close = (a: number | null, b: number, d = 3) => {
  expect(a).not.toBeNull();
  expect(a as number).toBeCloseTo(b, d);
};

describe('npv / irr / payback primitives', () => {
  const flowsA = [-1000, 300, 300, 300, 300, 300];
  it('annuity factor', () => close(annuityFactor(0.1, 5), 3.790787, 5));
  it('NPV matches example A', () => close(npv(0.1, flowsA), 137.236, 2));
  it('IRR matches example A', () => close(irr(flowsA), 0.152382, 5));
  it('NPV at the IRR is zero', () => expect(npv(irr(flowsA)!, flowsA)).toBeCloseTo(0, 6));
  it('payback matches example A', () => close(simplePayback(flowsA), 1000 / 300, 6));
  it('IRR of -100 then +110 is exactly 10%', () => close(irr([-100, 110]), 0.1, 9));
  it('IRR is negative when only part is recovered, and null with no sign change', () => {
    const neg = irr([-100, 10, 10])!; // recovers 20 of 100: a real but deeply negative rate
    expect(neg).toBeLessThan(0);
    expect(npv(neg, [-100, 10, 10])).toBeCloseTo(0, 6);
    expect(irr([-100, -10])).toBeNull();
    expect(irr([100, 10])).toBeNull();
  });
  it('payback is null when never recovered, 0 with no outlay', () => {
    expect(simplePayback([-100, 10, 10])).toBeNull();
    expect(simplePayback([0, 10])).toBe(0);
  });
});

describe('project model (example C)', () => {
  const a: Assumptions = { costPerKwh: 250, omPerKwYr: 10, augCostPerKwh: 0, augYear: 0, lifeYears: 10, discountRate: 0.08, itc: 0, haircut: 0, decline: 0 };
  const r: Resource = { durationH: 2, revenuePerKwYr: 100, cyclesPerYear: 300 };
  const o = compute(a, r);
  it('cash flows', () => expect(o.cashFlows).toEqual([-500, ...Array(10).fill(90)]));
  it('NPV', () => close(o.npv, 103.907, 2));
  it('payback', () => close(o.paybackYears, 5.5556, 3));
  it('breakeven capex', () => close(o.breakevenCapexPerKwh, 301.954, 2));
  it('NPV is zero at the breakeven capex', () => expect(compute({ ...a, costPerKwh: o.breakevenCapexPerKwh! }, r).npv).toBeCloseTo(0, 6));
  it('LCOS', () => close(o.lcosPerMwh, 140.858, 2));
  it('IRR sits above the 8% discount rate when NPV is positive', () => {
    expect(o.irr!).toBeGreaterThan(0.08);
    expect(npv(o.irr!, o.cashFlows)).toBeCloseTo(0, 6);
  });
});

describe('inputs', () => {
  const r: Resource = { durationH: 4, revenuePerKwYr: 80, cyclesPerYear: 250 };
  it('haircut and decline scale revenue as stated', () => {
    // year 1: 80 x 0.7 = 56; year 3: 56 x 0.97^2 = 52.6904; O&M 10 comes off each
    const f = cashFlows({ ...DEFAULTS, haircut: 0.3, decline: 0.03, augYear: 0 }, r);
    expect(f[1]).toBeCloseTo(56 - 10, 9);
    expect(f[3]).toBeCloseTo(52.6904 - 10, 4);
  });
  it('tax credit cuts only the year-0 outlay', () => {
    const f = cashFlows({ ...DEFAULTS, costPerKwh: 200, itc: 0.3 }, r);
    expect(f[0]).toBeCloseTo(-200 * 4 * 0.7, 9);
  });
  it('augmentation lands in its year only (scaled by duration), and is ignored beyond the life', () => {
    const f = cashFlows({ ...DEFAULTS, augCostPerKwh: 25, augYear: 6, lifeYears: 10 }, r);
    const g = cashFlows({ ...DEFAULTS, augCostPerKwh: 0, augYear: 6, lifeYears: 10 }, r);
    expect(g[6] - f[6]).toBeCloseTo(100, 9);
    expect(g[5] - f[5]).toBe(0);
    expect(cashFlows({ ...DEFAULTS, augYear: 11, lifeYears: 10 }, r)).toHaveLength(11);
    expect(compute({ ...DEFAULTS, lifeYears: 10, augYear: 11, augCostPerKwh: 999 }, r).npv).toBeCloseTo(compute({ ...DEFAULTS, lifeYears: 10, augYear: 0, augCostPerKwh: 0 }, r).npv, 9);
  });
  it('out-of-range inputs are clamped, not propagated as NaN', () => {
    const o = compute({ ...DEFAULTS, lifeYears: -3, discountRate: NaN, itc: 5 }, r);
    expect(Number.isFinite(o.npv)).toBe(true);
    expect(o.cashFlows).toHaveLength(2); // life clamped to 1 year
  });
  it('zero discount rate: NPV is the plain sum', () => {
    const o = compute({ ...DEFAULTS, discountRate: 0 }, r);
    expect(o.npv).toBeCloseTo(o.cashFlows.reduce((s, v) => s + v, 0), 9);
  });
});

describe('tornado', () => {
  const r: Resource = { durationH: 2, revenuePerKwYr: 100, cyclesPerYear: 300 };
  const rows = tornado(DEFAULTS, r);
  const base = compute(DEFAULTS, r).npv;
  it('is sorted by swing, largest first', () => {
    const swings = rows.map((x) => Math.abs(x.npvHigh - x.npvLow));
    expect([...swings].sort((x, y) => y - x)).toEqual(swings);
  });
  it('moves NPV in the expected direction', () => {
    const by = Object.fromEntries(rows.map((x) => [x.key, x]));
    expect(by.cost.npvLow).toBeGreaterThan(base); // cheaper => better
    expect(by.cost.npvHigh).toBeLessThan(base);
    expect(by.revenue.npvHigh).toBeGreaterThan(base);
    expect(by.discount.npvLow).toBeGreaterThan(base);
    expect(by.haircut.npvLow).toBeGreaterThan(base);
    expect(by.itc.npvHigh).toBeGreaterThan(base);
  });
  it('revenue row matches a direct recomputation', () => {
    const row = rows.find((x) => x.key === 'revenue')!;
    expect(row.npvHigh).toBeCloseTo(compute(DEFAULTS, { ...r, revenuePerKwYr: 120 }).npv, 9);
  });
});
