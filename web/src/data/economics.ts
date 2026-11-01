/**
 * Project economics (Phase 13). Every formula for the Economics page lives here, with no React and no
 * data loading, so it can be unit-tested (economics.test.ts) and read in one sitting.
 *
 * Basis: ONE kW of power capacity, in constant (real) dollars, annual end-of-year cash flows.
 *   year 0      : -installed cost x (1 - ITC)
 *   year t=1..N : revenue_t - fixed O&M, and in the augmentation year also - augmentation cost
 *   revenue_t   = base revenue x (1 - haircut) x (1 - decline)^(t-1)
 * No debt, no income tax, no depreciation, no inflation, no salvage value, no charging-cost line (the energy
 * revenue is already net of charging). The tax credit is a plain percentage of installed cost, taken in year 0.
 * It is a screening model: good for "which knob matters", not for a financing decision.
 */

export interface Assumptions {
  /** Installed (turnkey) cost, $ per kWh of energy capacity. */
  costPerKwh: number;
  /** Fixed operations and maintenance, $ per kW of power per year. */
  omPerKwYr: number;
  /** One-time augmentation (adding cells to offset capacity fade), $ per kWh of energy capacity. */
  augCostPerKwh: number;
  /** Year (1..life) at the end of which augmentation is paid; 0 or beyond the life means none. */
  augYear: number;
  /** Project life in whole years. */
  lifeYears: number;
  /** Discount rate as a fraction (0.08 = 8%). */
  discountRate: number;
  /** Investment tax credit as a fraction of installed cost (user input; no tax law is built in). */
  itc: number;
  /** Share of the modeled revenue that is NOT earned in practice (0.3 = keep 70%). */
  haircut: number;
  /** Revenue decline per year as a fraction (0.03 = revenue shrinks 3% each year). */
  decline: number;
}

/** What the selected backtest run supplies. */
export interface Resource {
  durationH: number;
  /** Modeled revenue in the first year, $ per kW-yr (before haircut). */
  revenuePerKwYr: number;
  /** Full-capacity cycles per year; with the duration this sets the energy discharged for LCOS. */
  cyclesPerYear: number;
}

export interface Outputs {
  /** Year-0 outlay after the tax credit, $/kW (positive number). */
  netCapex: number;
  /** Cash flows, index 0 = year 0. */
  cashFlows: number[];
  /** Net present value, $/kW. */
  npv: number;
  /** Internal rate of return as a fraction, or null when no rate makes NPV zero (never pays back). */
  irr: number | null;
  /** Simple (undiscounted) payback in years, or null if not recovered within the life. */
  paybackYears: number | null;
  /** Levelized cost of storage, $/MWh discharged (capex + O&M + augmentation, charging excluded). */
  lcosPerMwh: number | null;
  /** Installed cost, $/kWh, at which NPV is exactly zero (null if undefined). */
  breakevenCapexPerKwh: number | null;
}

export const DEFAULTS: Assumptions = {
  costPerKwh: 300,
  omPerKwYr: 10,
  augCostPerKwh: 30,
  augYear: 10,
  lifeYears: 20,
  discountRate: 0.08,
  itc: 0,
  haircut: 0.3,
  decline: 0.03,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** Force inputs into a range the maths is defined on (whole-year life, fractions in [0,1), non-negative costs). */
export function sanitize(a: Assumptions): Assumptions {
  return {
    costPerKwh: clamp(a.costPerKwh, 0, 5000),
    omPerKwYr: clamp(a.omPerKwYr, 0, 500),
    augCostPerKwh: clamp(a.augCostPerKwh, 0, 5000),
    augYear: Math.round(clamp(a.augYear, 0, 60)),
    lifeYears: Math.round(clamp(a.lifeYears, 1, 40)),
    discountRate: clamp(a.discountRate, 0, 0.5),
    itc: clamp(a.itc, 0, 0.9),
    haircut: clamp(a.haircut, 0, 1),
    decline: clamp(a.decline, 0, 0.5),
  };
}

/** Annual revenue in year t (t >= 1), $/kW. */
export function revenueInYear(a: Assumptions, baseRevenue: number, t: number) {
  return baseRevenue * (1 - a.haircut) * Math.pow(1 - a.decline, t - 1);
}

/** Cash flows for one kW; index 0 is the (negative) year-0 outlay after the tax credit. */
export function cashFlows(a: Assumptions, r: Resource): number[] {
  const flows = [-a.costPerKwh * r.durationH * (1 - a.itc)];
  for (let t = 1; t <= a.lifeYears; t++) {
    let cf = revenueInYear(a, r.revenuePerKwYr, t) - a.omPerKwYr;
    if (t === a.augYear) cf -= a.augCostPerKwh * r.durationH;
    flows.push(cf);
  }
  return flows;
}

/** Present value of flows at `rate`, year 0 undiscounted. */
export function npv(rate: number, flows: number[]) {
  let v = 0;
  for (let t = 0; t < flows.length; t++) v += flows[t] / Math.pow(1 + rate, t);
  return v;
}

/**
 * Internal rate of return by bisection on NPV(rate) = 0. Returns null unless the flows change sign and a root
 * exists between -90% and +1000%. (Conventional flows, one outlay then inflows, have a single root; with the
 * mid-life augmentation outlay there can be more than one, and this returns the one bisection finds.)
 */
export function irr(flows: number[]): number | null {
  let lo = -0.9;
  let hi = 10;
  let fLo = npv(lo, flows);
  const fHi = npv(hi, flows);
  if (!(flows.some((f) => f < 0) && flows.some((f) => f > 0))) return null;
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-10 || hi - lo < 1e-12) return mid;
    if (fLo * fMid < 0) hi = mid;
    else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

/** Years until cumulative undiscounted cash turns non-negative (linear within the year); null if never. */
export function simplePayback(flows: number[]): number | null {
  let cum = flows[0];
  if (cum >= 0) return 0;
  for (let t = 1; t < flows.length; t++) {
    const next = cum + flows[t];
    if (next >= 0) return t - 1 + -cum / flows[t];
    cum = next;
  }
  return null;
}

/** Present value of $1 received at the end of each year 1..n. */
export function annuityFactor(rate: number, n: number) {
  if (rate === 0) return n;
  return (1 - Math.pow(1 + rate, -n)) / rate;
}

export function compute(input: Assumptions, r: Resource): Outputs {
  const a = sanitize(input);
  const flows = cashFlows(a, r);
  const netCapex = -flows[0];

  // PV of everything after year 0 (revenue less O&M less augmentation).
  const pvAfter = npv(a.discountRate, flows) - flows[0];

  // LCOS: PV of costs / PV of energy discharged. Throughput is held flat; the revenue decline input is about
  // price spreads, not about the battery delivering less energy.
  const augPv = a.augYear >= 1 && a.augYear <= a.lifeYears ? (a.augCostPerKwh * r.durationH) / Math.pow(1 + a.discountRate, a.augYear) : 0;
  const pvCosts = netCapex + a.omPerKwYr * annuityFactor(a.discountRate, a.lifeYears) + augPv;
  const dischargedKwhPerYr = r.cyclesPerYear * r.durationH;
  const pvDischargedKwh = dischargedKwhPerYr * annuityFactor(a.discountRate, a.lifeYears);

  // NPV is linear in installed cost: NPV = -c*d*(1-itc) + pvAfter, so the zero is exact.
  const denom = r.durationH * (1 - a.itc);

  return {
    netCapex,
    cashFlows: flows,
    npv: npv(a.discountRate, flows),
    irr: irr(flows),
    paybackYears: simplePayback(flows),
    lcosPerMwh: pvDischargedKwh > 0 ? (pvCosts / pvDischargedKwh) * 1000 : null,
    breakevenCapexPerKwh: denom > 0 ? pvAfter / denom : null,
  };
}

// ------------------------------------------------------------------ sensitivity (tornado)

export interface TornadoRow {
  key: string;
  label: string;
  /** Text for the decreased / increased input value, shown in the tooltip. */
  lowText: string;
  highText: string;
  /** NPV with the input moved down / up, $/kW. */
  npvLow: number;
  npvHigh: number;
}

const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const points = (v: number) => `${(v * 100).toFixed(v * 100 % 1 ? 1 : 0)}%`;

/**
 * One-at-a-time sensitivity of NPV. Each input is moved down and up by a fixed, stated step (relative for
 * dollar inputs, percentage points for rates, years for life) while the others stay put. Rows come back sorted
 * by NPV swing, largest first. `step` is the same size for every dollar input so the bars are comparable.
 */
export function tornado(input: Assumptions, r: Resource, step = 0.2): TornadoRow[] {
  const base = sanitize(input);
  const pctLabel = Math.round(step * 100);
  const run = (patch: Partial<Assumptions>, res: Resource = r) => compute({ ...base, ...patch }, res).npv;
  const rel = (v: number) => [v * (1 - step), v * (1 + step)] as const;

  const rows: TornadoRow[] = [];
  const add = (key: string, label: string, lo: number, hi: number, patch: (v: number) => Partial<Assumptions>, fmt: (v: number) => string, res?: (v: number) => Resource) => {
    rows.push({
      key, label, lowText: fmt(lo), highText: fmt(hi),
      npvLow: run(patch(lo), res?.(lo)), npvHigh: run(patch(hi), res?.(hi)),
    });
  };

  add('cost', `Installed cost ±${pctLabel}%`, ...rel(base.costPerKwh), (v) => ({ costPerKwh: v }), (v) => `${money(v)}/kWh`);
  add('revenue', `Modeled revenue ±${pctLabel}%`, ...rel(r.revenuePerKwYr), () => ({}), (v) => `${money(v)}/kW-yr`, (v) => ({ ...r, revenuePerKwYr: v }));
  add('om', `Fixed O&M ±${pctLabel}%`, ...rel(base.omPerKwYr), (v) => ({ omPerKwYr: v }), (v) => `${money(v)}/kW-yr`);
  if (base.augCostPerKwh > 0 && base.augYear >= 1 && base.augYear <= base.lifeYears) {
    add('aug', `Augmentation cost ±${pctLabel}%`, ...rel(base.augCostPerKwh), (v) => ({ augCostPerKwh: v }), (v) => `${money(v)}/kWh`);
  }
  add('haircut', 'Revenue haircut ±10 pts', Math.max(0, base.haircut - 0.1), Math.min(1, base.haircut + 0.1), (v) => ({ haircut: v }), points);
  add('decline', 'Revenue decline ±2 pts/yr', Math.max(0, base.decline - 0.02), base.decline + 0.02, (v) => ({ decline: v }), points);
  add('discount', 'Discount rate ±2 pts', Math.max(0, base.discountRate - 0.02), base.discountRate + 0.02, (v) => ({ discountRate: v }), points);
  add('life', 'Project life ±5 years', Math.max(1, base.lifeYears - 5), base.lifeYears + 5, (v) => ({ lifeYears: v }), (v) => `${v} yr`);
  add('itc', 'Tax credit ±10 pts', Math.max(0, base.itc - 0.1), Math.min(0.9, base.itc + 0.1), (v) => ({ itc: v }), points);

  return rows.sort((x, y) => Math.abs(y.npvHigh - y.npvLow) - Math.abs(x.npvHigh - x.npvLow));
}
