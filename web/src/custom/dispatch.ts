// Single-day battery dispatch LP, a port of model/dispatch.py to highs-js.
//
//   max  sum_t price_t * (d_t - c_t) * dt  -  deg_cost * sum_t d_t * dt
//   s.t. 0 <= c_t, d_t <= P,  c_t + d_t <= P,  0 <= soc_t <= E
//        soc_{t+1} = soc_t + c_t * eta * dt - d_t / eta * dt,   eta = sqrt(rte)
//        soc_0 = soc_T = soc0_frac * E
//
// When the LP charges and discharges in the same interval (possible only at
// prices at or below zero), the day is re-solved as a MILP with a
// charge-or-discharge binary on each interval priced at or below zero, stopping
// at a 0.01% gap or 10 s, and keeping the best schedule found.
//
// The model is built exactly as PuLP hands it to HiGHS: columns sorted by name
// (c_*, d_*, m_*, soc_*, as strings), rows in the order Python adds them, and
// the maximization passed as minimizing the negated objective. Python's highspy
// and this package both run HiGHS 1.15.1, so the same model gives the same
// vertex, which keeps results equal even on days with tied optima.
import type { Highs } from 'highs';

export const TOL = 1e-6;
export const MILP_GAP = 1e-4;
export const MILP_TIME_LIMIT_S = 10;

const MODEL_OPTIMAL = 7;
const SOLUTION_FEASIBLE = 2;

export interface DayResult {
  charge: Float64Array;
  discharge: Float64Array;
  /** State of charge at the end of each interval. */
  soc: Float64Array;
  revenue: number;
  grossRevenue: number;
  degradationCost: number;
  energyChargedMwh: number;
  energyDischargedMwh: number;
  cycles: number;
  usedMilp: boolean;
}

interface Battery {
  dt: number;
  powerMw: number;
  energyMwh: number;
  eta: number;
  degCost: number;
  soc0: number;
}

function solve(highs: Highs, prices: ArrayLike<number>, b: Battery, exclusive: boolean) {
  const n = prices.length;
  const { dt, powerMw: P, energyMwh: E, eta, degCost, soc0 } = b;
  const binaries: number[] = [];
  if (exclusive) for (let t = 0; t < n; t++) if (prices[t] <= 0) binaries.push(t);

  // Column order: PuLP sorts variables by name.
  const names: string[] = [];
  for (let t = 0; t < n; t++) names.push(`c_${t}`, `d_${t}`);
  for (const t of binaries) names.push(`m_${t}`);
  for (let t = 0; t <= n; t++) names.push(`soc_${t}`);
  names.sort();
  const col = new Map(names.map((name, i) => [name, i]));
  const ci = (t: number) => col.get(`c_${t}`)!;
  const di = (t: number) => col.get(`d_${t}`)!;
  const si = (t: number) => col.get(`soc_${t}`)!;
  const mi = (t: number) => col.get(`m_${t}`)!;

  const numCols = names.length;
  const colCost = new Float64Array(numCols);
  const colLower = new Float64Array(numCols);
  const colUpper = new Float64Array(numCols);
  const integrality = new Int32Array(numCols);
  for (let t = 0; t < n; t++) {
    const p = Number(prices[t]);
    colCost[ci(t)] = -(-p * dt); // PuLP passes -1 * objective coefficient
    colCost[di(t)] = -(p * dt - degCost * dt);
    colUpper[ci(t)] = P;
    colUpper[di(t)] = P;
  }
  for (let t = 0; t <= n; t++) colUpper[si(t)] = E;
  for (const t of binaries) {
    colUpper[mi(t)] = 1;
    integrality[mi(t)] = highs.constants.variableType.integer;
  }

  // Rows in the order model/dispatch.py adds them.
  const starts = [0];
  const indices: number[] = [];
  const values: number[] = [];
  const rowLower: number[] = [];
  const rowUpper: number[] = [];
  const row = (entries: [number, number][], lo: number, hi: number) => {
    for (const [j, v] of entries) {
      indices.push(j);
      values.push(v);
    }
    starts.push(indices.length);
    rowLower.push(lo);
    rowUpper.push(hi);
  };
  const inf = highs.infinity;
  row([[si(0), 1]], soc0, soc0);
  row([[si(n), 1]], soc0, soc0);
  for (let t = 0; t < n; t++) {
    row([[si(t + 1), 1], [si(t), -1], [ci(t), -(eta * dt)], [di(t), dt / eta]], 0, 0);
    row([[ci(t), 1], [di(t), 1]], -inf, P);
  }
  for (const t of binaries) {
    row([[ci(t), 1], [mi(t), -P]], -inf, 0);
    row([[di(t), 1], [mi(t), P]], -inf, P);
  }

  const model = highs.createModel({
    numCols,
    numRows: rowLower.length,
    sense: highs.constants.objectiveSense.minimize,
    colCost,
    colLower,
    colUpper,
    rowLower,
    rowUpper,
    matrix: { format: 'csr', numRows: rowLower.length, numCols, starts, indices, values },
    ...(binaries.length ? { integrality } : {}),
  });
  try {
    model.options.set({ output_flag: false }); // the Wasm build is single-threaded, like threads=1 in Python
    if (exclusive) model.options.set({ mip_rel_gap: MILP_GAP, time_limit: MILP_TIME_LIMIT_S });
    const { modelStatus } = model.run();
    const ok =
      modelStatus === MODEL_OPTIMAL ||
      (exclusive && Number(model.info.get('primal_solution_status')) === SOLUTION_FEASIBLE);
    if (!ok) throw new Error(`Dispatch solve failed: model status ${modelStatus}`);
    const x = model.getSolution().colValue;
    const pick = (idx: (t: number) => number, count: number) => {
      const out = new Float64Array(count);
      for (let t = 0; t < count; t++) out[t] = x[idx(t)];
      return out;
    };
    return { charge: pick(ci, n), discharge: pick(di, n), soc: pick(si, n + 1) };
  } finally {
    model.dispose();
  }
}

/** Optimal perfect-foresight dispatch for one day; same arguments and results as optimize_day in Python. */
export function optimizeDay(
  highs: Highs,
  prices: ArrayLike<number>,
  dtHours: number,
  powerMw: number,
  energyMwh: number,
  rte = 0.85,
  degCostPerMwh = 0,
  soc0Frac = 0.5,
): DayResult {
  const n = prices.length;
  if (n === 0) throw new Error('prices must be non-empty');
  for (let t = 0; t < n; t++) if (!Number.isFinite(prices[t])) throw new Error('prices contain NaN or inf');
  if (!(rte > 0 && rte <= 1)) throw new Error('rte must be in (0, 1]');
  if (!(powerMw > 0 && energyMwh > 0 && dtHours > 0)) throw new Error('power, energy and dt must be positive');
  if (!(soc0Frac >= 0 && soc0Frac <= 1)) throw new Error('soc0Frac must be in [0, 1]');

  const battery: Battery = {
    dt: dtHours,
    powerMw,
    energyMwh,
    eta: Math.sqrt(rte),
    degCost: degCostPerMwh,
    soc0: soc0Frac * energyMwh,
  };
  let { charge, discharge, soc } = solve(highs, prices, battery, false);
  let usedMilp = false;
  for (let t = 0; t < n; t++) if (charge[t] > TOL && discharge[t] > TOL) usedMilp = true;
  if (usedMilp) ({ charge, discharge, soc } = solve(highs, prices, battery, true));

  // Clean solver noise so tiny values don't count as dispatch.
  let gross = 0;
  let charged = 0;
  let discharged = 0;
  for (let t = 0; t < n; t++) {
    if (charge[t] < TOL) charge[t] = 0;
    if (discharge[t] < TOL) discharge[t] = 0;
    gross += prices[t] * (discharge[t] - charge[t]) * dtHours;
    charged += charge[t];
    discharged += discharge[t];
  }
  charged *= dtHours;
  discharged *= dtHours;
  const deg = degCostPerMwh * discharged;
  return {
    charge,
    discharge,
    soc: soc.subarray(1),
    revenue: gross - deg,
    grossRevenue: gross,
    degradationCost: deg,
    energyChargedMwh: charged,
    energyDischargedMwh: discharged,
    cycles: discharged / energyMwh,
    usedMilp,
  };
}
