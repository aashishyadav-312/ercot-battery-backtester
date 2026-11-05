"""v4 revenue stack engine: co-optimized energy and ancillary service capacity.

One LP per block of operating days, built directly as a sparse matrix for HiGHS
(no PuLP model objects), so a node-year solves in about a second. The state of
charge is pinned to the same start/end level at every day boundary, so a block
of days gives exactly the same schedule as solving each day on its own (the
daily problem used by model/dispatch.py and model/run_year.py).

Per interval t (length dt hours) the variables are charge c, discharge d (MW),
the state of charge at each interval edge, and an award r_k for each product
k in model.stack.PRODUCTS. Awards can be held fixed over an award group (one
physical hour for day-ahead awards). Constraints:

    c + d <= P                                  one shared inverter
    d + sum(up awards) <= P                     upward headroom   (two_sided)
    c + regdn <= P                              downward headroom (two_sided)
    c + d + sum(all awards) <= P                (headroom="shared", the v2 rule)
    soc_end = soc_start + eta*c*dt - d*dt/eta - f*regup*dt/eta + f*regdn*dt*eta
    soc_start >= sum(up_k * dur_k)/eta + (d + f*regup)*dt/eta
    soc_end   >= sum(up_k * dur_k)/eta
    E - soc_start >= regdn*dur*eta + (c + f*regdn)*dt*eta
    E - soc_end   >= regdn*dur*eta

eta = sqrt(round-trip efficiency); f is the regulation deployment factor (share
of the award deployed as energy on average). The start-of-interval rows are
the valid strengthening used in model/ancillary.py: they also cover the start
edge. Objective: energy margin (including regulation deployment energy) minus
degradation per MWh discharged, plus sum_k MCPC_k * r_k * dt.

As in model/dispatch.py, a pure LP may charge and discharge in one interval to
burn energy at negative prices. Days where that happens are re-solved one at a
time as a MILP with a charge-or-discharge binary for each interval priced at or
below zero (every interval if the overlap is at a positive price).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import highspy
import numpy as np

PRODUCTS = ("regup", "regdn", "rrs", "ecrs", "nsrs")
UP = (0, 2, 3, 4)  # indices of upward products
REGUP, REGDN = 0, 1
RULES_PATH = Path(__file__).resolve().parent / "config" / "as_rules.json"
_TOL = 1e-6


def load_rules(path: Path = RULES_PATH) -> dict:
    return json.loads(Path(path).read_text())


def durations(rules: dict, post_rtcb: bool) -> np.ndarray:
    """Reserve duration (hours) for each product, in PRODUCTS order."""
    key = "post_rtcb" if post_rtcb else "pre_rtcb"
    return np.array([rules["products"][k]["duration_h"][key]["value"] for k in PRODUCTS], dtype=float)


@dataclass
class Battery:
    power_mw: float = 100.0
    energy_mwh: float = 200.0
    rte: float = 0.85
    deg_cost: float = 10.0  # $/MWh discharged
    soc0_frac: float = 0.0  # state of charge at every day boundary


@dataclass
class Options:
    as_enabled: bool = True
    reg_deploy: float = 0.0  # regulation deployment factor f
    headroom: str = "two_sided"  # or "shared"
    max_as_share: float = 1.0  # cap on total awards as a share of P
    mip_gap: float = 1e-4
    mip_time_limit_s: float = 10.0
    threads: int = 1
    extra: dict = field(default_factory=dict)


def _validate(p, a, dur, avail, day, group, dt, bat: Battery, opt: Options):
    n = len(p)
    if n == 0 or p.ndim != 1:
        raise ValueError("energy prices must be a non-empty 1-D array")
    if a.shape != (n, 5) or dur.shape != (n, 5) or avail.shape != (n, 5):
        raise ValueError("AS prices, durations and availability must have shape (n, 5)")
    if day.shape != (n,) or group.shape != (n,):
        raise ValueError("day and group ids must have one entry per interval")
    if not np.isfinite(p).all():
        raise ValueError("energy prices contain NaN or inf")
    if not np.isfinite(np.where(avail, a, 0.0)).all():
        raise ValueError("AS prices contain NaN or inf where the product is available")
    if (np.diff(day) < 0).any():
        raise ValueError("intervals must be sorted by day")
    if dt <= 0 or bat.power_mw <= 0 or bat.energy_mwh <= 0 or not 0 < bat.rte <= 1 or bat.deg_cost < 0:
        raise ValueError("invalid battery parameters")
    if not 0 <= bat.soc0_frac <= 1 or not 0 <= opt.max_as_share <= 1 or not 0 <= opt.reg_deploy <= 1:
        raise ValueError("soc0_frac, max_as_share and reg_deploy must be in [0, 1]")
    if opt.headroom not in ("two_sided", "shared"):
        raise ValueError("headroom must be 'two_sided' or 'shared'")
    if (dur <= 0).any():
        raise ValueError("reserve durations must be positive")
    # An award group must stay inside one day (awards are physical hours).
    first_day = {}
    for g, d in zip(group.tolist(), day.tolist()):
        if first_day.setdefault(g, d) != d:
            raise ValueError("an award group spans two days")


class _Builder:
    """Sparse LP in column-wise triplets."""

    def __init__(self):
        self.lo, self.hi, self.cost, self.integer = [], [], [], []
        self.rows, self.cols, self.vals = [], [], []
        self.rlo, self.rhi = [], []
        self.n_col = 0
        self.n_row = 0

    def cols_block(self, k, lo, hi, cost=0.0, integer=False):
        idx = np.arange(self.n_col, self.n_col + k)
        self.lo.append(np.broadcast_to(np.asarray(lo, float), (k,)).copy())
        self.hi.append(np.broadcast_to(np.asarray(hi, float), (k,)).copy())
        self.cost.append(np.broadcast_to(np.asarray(cost, float), (k,)).copy())
        self.integer.append(np.full(k, integer))
        self.n_col += k
        return idx

    def rows_block(self, k, lo, hi, terms):
        """terms: list of (col_index_array(k), coef_array(k) or scalar)."""
        r = np.arange(self.n_row, self.n_row + k)
        for cols, coef in terms:
            coef = np.broadcast_to(np.asarray(coef, float), (k,))
            nz = coef != 0
            self.rows.append(r[nz])
            self.cols.append(np.asarray(cols)[nz])
            self.vals.append(coef[nz])
        self.rlo.append(np.broadcast_to(np.asarray(lo, float), (k,)).copy())
        self.rhi.append(np.broadcast_to(np.asarray(hi, float), (k,)).copy())
        self.n_row += k

    def solve(self, gap, time_limit, threads):
        inf = highspy.kHighsInf
        lp = highspy.HighsLp()
        lp.num_col_, lp.num_row_ = self.n_col, self.n_row
        lp.col_cost_ = np.concatenate(self.cost)
        lp.col_lower_ = np.concatenate(self.lo)
        lp.col_upper_ = np.concatenate(self.hi)
        lp.row_lower_ = np.where(np.isinf(c := np.concatenate(self.rlo)), -inf, c)
        lp.row_upper_ = np.where(np.isinf(c := np.concatenate(self.rhi)), inf, c)
        rows, cols, vals = (np.concatenate(x) for x in (self.rows, self.cols, self.vals))
        order = np.lexsort((rows, cols))
        rows, cols, vals = rows[order], cols[order], vals[order]
        # Merge repeated (row, col) terms: HiGHS needs one entry per coefficient.
        key = cols.astype(np.int64) * (self.n_row + 1) + rows
        new = np.r_[True, key[1:] != key[:-1]]
        if not new.all():
            vals = np.add.reduceat(vals, np.flatnonzero(new))
            rows, cols = rows[new], cols[new]
        start = np.searchsorted(cols, np.arange(self.n_col + 1))
        lp.a_matrix_.format_ = highspy.MatrixFormat.kColwise
        lp.a_matrix_.start_ = start.astype(np.int32)
        lp.a_matrix_.index_ = rows.astype(np.int32)
        lp.a_matrix_.value_ = vals
        integer = np.concatenate(self.integer)
        if integer.any():
            lp.integrality_ = [highspy.HighsVarType.kInteger if i else highspy.HighsVarType.kContinuous for i in integer]
        h = highspy.Highs()
        h.silent()
        h.setOptionValue("threads", int(threads))
        if integer.any():
            h.setOptionValue("mip_rel_gap", float(gap))
            h.setOptionValue("time_limit", float(time_limit))
        h.passModel(lp)
        h.run()
        status = h.getModelStatus()
        sol = h.getSolution()
        ok = status == highspy.HighsModelStatus.kOptimal or (
            integer.any() and sol.value_valid and h.getInfo().primal_solution_status == 2
        )
        if not ok:
            raise RuntimeError(f"stack solve failed: {h.modelStatusToString(status)}")
        gap_out = float(h.getInfo().mip_gap) if integer.any() else 0.0
        return np.asarray(sol.col_value), gap_out


def _solve_block(p, a, dur, avail, day, group, dt, bat: Battery, opt: Options, binary=None):
    """Solve one block. Returns c, d, soc_end, awards per interval (n, 5), solver gap."""
    n = len(p)
    P, E = bat.power_mw, bat.energy_mwh
    eta = math.sqrt(bat.rte)
    f = opt.reg_deploy if opt.as_enabled else 0.0
    soc0 = bat.soc0_frac * E

    # Day positions: edge index of interval t's start is t + k(t), end is +1.
    _, day_pos = np.unique(day, return_inverse=True)
    n_days = int(day_pos.max()) + 1
    s_start = np.arange(n) + day_pos
    s_end = s_start + 1

    # Award groups -> compact ids.
    _, gid = np.unique(group, return_inverse=True)
    n_groups = int(gid.max()) + 1
    g_avail = np.ones((n_groups, 5), bool)
    np.logical_and.at(g_avail, gid, avail)
    as_cap = P * opt.max_as_share if opt.as_enabled else 0.0

    b = _Builder()
    # HiGHS minimizes: costs are the negated objective.
    c = b.cols_block(n, 0, P, cost=p * dt)
    d = b.cols_block(n, 0, P, cost=-(p - bat.deg_cost) * dt)
    edges_lo = np.zeros(n + n_days)
    edges_hi = np.full(n + n_days, E)
    first_edges = np.r_[0, np.flatnonzero(np.diff(day_pos)) + 1] + np.arange(n_days)
    last_edges = np.r_[first_edges[1:] - 1, n + n_days - 1]
    edges_lo[first_edges] = edges_hi[first_edges] = soc0
    edges_lo[last_edges] = edges_hi[last_edges] = soc0
    s = b.cols_block(n + n_days, edges_lo, edges_hi)

    # Award cost per group: sum over its intervals of MCPC * dt (+ deployment energy for Reg).
    rcost = np.zeros((n_groups, 5))
    np.add.at(rcost, gid, np.where(avail, a, 0.0) * dt)
    dep = np.zeros((n_groups, 2))
    np.add.at(dep, gid, np.c_[f * (p - bat.deg_cost) * dt, -f * p * dt])
    rcost[:, REGUP] += dep[:, 0]
    rcost[:, REGDN] += dep[:, 1]
    r = [b.cols_block(n_groups, 0, np.where(g_avail[:, k], as_cap, 0.0), cost=-rcost[:, k]) for k in range(5)]
    rt = [ri[gid] for ri in r]  # award column for each interval

    # Dynamics.
    b.rows_block(n, 0, 0, [(s[s_end], 1), (s[s_start], -1), (c, -eta * dt), (d, dt / eta),
                           (rt[REGUP], f * dt / eta), (rt[REGDN], -f * dt * eta)])
    inf = np.inf
    b.rows_block(n, -inf, P, [(c, 1), (d, 1)] + ([(x, 1) for x in rt] if opt.headroom == "shared" else []))
    if opt.as_enabled:
        if opt.headroom == "two_sided":
            b.rows_block(n, -inf, P, [(d, 1)] + [(rt[k], 1) for k in UP])
            b.rows_block(n, -inf, P, [(c, 1), (rt[REGDN], 1)])
        if opt.max_as_share < 1:
            b.rows_block(n_groups, -inf, as_cap, [(x, 1) for x in r])
        up_terms = [(rt[k], -dur[:, k] / eta) for k in UP]
        b.rows_block(n, 0, inf, [(s[s_start], 1), (d, -dt / eta), (rt[REGUP], -f * dt / eta)] + up_terms)
        b.rows_block(n, 0, inf, [(s[s_end], 1)] + up_terms)
        dn = (rt[REGDN], -dur[:, REGDN] * eta)
        b.rows_block(n, -E, inf, [(s[s_start], -1), (c, -dt * eta), (rt[REGDN], -f * dt * eta), dn])
        b.rows_block(n, -E, inf, [(s[s_end], -1), dn])
    else:
        # Same strengthening as model/ancillary.py; with no awards it only cuts overlap.
        b.rows_block(n, 0, inf, [(s[s_start], 1), (d, -dt / eta)])
        b.rows_block(n, -E, inf, [(s[s_start], -1), (c, -dt * eta)])

    if binary is not None and binary.any():
        t = np.flatnonzero(binary)
        m = b.cols_block(len(t), 0, 1, integer=True)
        b.rows_block(len(t), -inf, 0, [(c[t], 1), (m, -P)])
        b.rows_block(len(t), -inf, P, [(d[t], 1), (m, P)])

    x, gap = b.solve(opt.mip_gap, opt.mip_time_limit_s, opt.threads)
    cv, dv = x[c], x[d]
    cv[cv < _TOL] = 0.0
    dv[dv < _TOL] = 0.0
    awards = np.column_stack([x[ri][gid] for ri in r])
    awards[awards < _TOL] = 0.0
    return cv, dv, x[s][s_end], awards, gap


def optimize(
    energy_prices,
    as_prices,
    dt_hours: float,
    day_ids,
    durations_h,
    available=None,
    award_groups=None,
    battery: Battery | None = None,
    options: Options | None = None,
    block_days: int = 31,
) -> dict:
    """Co-optimize energy and AS capacity over many days (SOC reset each day).

    Args:
        energy_prices: $/MWh per interval, shape (n,).
        as_prices: $/MW-h per interval and product, shape (n, 5), PRODUCTS order.
        dt_hours: interval length.
        day_ids: operating day of each interval (sorted, any integer or string key).
        durations_h: reserve duration per interval and product, shape (n, 5) or (5,).
        available: bool (n, 5), False where a product can't be awarded (default all True).
        award_groups: awards are equal within a group (default: one per interval).

    Returns dict with per-interval arrays "charge", "discharge", "soc", "awards" (n, 5)
    and "days": list of {day, energy, regup, regdn, rrs, ecrs, nsrs, used_milp, gap} in $.
    """
    bat = battery or Battery()
    opt = options or Options()
    p = np.asarray(energy_prices, float)
    n = len(p)
    a = np.asarray(as_prices, float).reshape(n, 5) if n else np.zeros((0, 5))
    dur = np.broadcast_to(np.asarray(durations_h, float), (n, 5)).copy()
    avail = np.ones((n, 5), bool) if available is None else np.asarray(available, bool).copy()
    avail &= np.isfinite(a)
    day_keys, day = np.unique(np.asarray(day_ids), return_inverse=True)
    day = day.reshape(-1)
    group = np.arange(n) if award_groups is None else np.unique(np.asarray(award_groups), return_inverse=True)[1].reshape(-1)
    _validate(p, a, dur, avail, day, group, dt_hours, bat, opt)
    if not opt.as_enabled:
        avail[:] = False
    a = np.where(avail, a, 0.0)

    c = np.zeros(n)
    d = np.zeros(n)
    soc = np.zeros(n)
    awards = np.zeros((n, 5))
    gaps = np.zeros(len(day_keys))
    milp = np.zeros(len(day_keys), bool)

    bounds = np.searchsorted(day, np.arange(len(day_keys) + 1))
    for b0 in range(0, len(day_keys), block_days):
        b1 = min(b0 + block_days, len(day_keys))
        sl = slice(bounds[b0], bounds[b1])
        out = _solve_block(p[sl], a[sl], dur[sl], avail[sl], day[sl], group[sl], dt_hours, bat, opt)
        c[sl], d[sl], soc[sl], awards[sl], _ = out

    overlap_days = np.unique(day[(c > _TOL) & (d > _TOL)])
    for k in overlap_days:
        sl = slice(bounds[k], bounds[k + 1])
        pk = p[sl]
        args = (pk, a[sl], dur[sl], avail[sl], day[sl], group[sl], dt_hours, bat, opt)
        ov = (c[sl] > _TOL) & (d[sl] > _TOL)
        binary = pk <= 0 if not (ov & (pk > 0)).any() else np.ones(len(pk), bool)
        out = _solve_block(*args, binary=binary)
        if ((out[0] > _TOL) & (out[1] > _TOL)).any():
            out = _solve_block(*args, binary=np.ones(len(pk), bool))
        if ((out[0] > _TOL) & (out[1] > _TOL)).any():
            raise RuntimeError("charge/discharge overlap remains after the binary re-solve")
        c[sl], d[sl], soc[sl], awards[sl], gaps[k] = out
        milp[k] = True

    f = opt.reg_deploy if opt.as_enabled else 0.0
    comp = revenue_components(p, a, dt_hours, c, d, awards, bat.deg_cost, f)
    days = []
    for k, key in enumerate(day_keys):
        sl = slice(bounds[k], bounds[k + 1])
        row = {"day": key.item() if hasattr(key, "item") else key}
        row.update({name: float(v[sl].sum()) for name, v in comp.items()})
        row.update({"used_milp": bool(milp[k]), "gap": float(gaps[k])})
        days.append(row)
    return {"charge": c, "discharge": d, "soc": soc, "awards": awards, "days": days}


def revenue_components(energy_prices, as_prices, dt, c, d, awards, deg_cost, reg_deploy):
    """Per-interval $ by component. Energy includes regulation deployment energy at the energy price."""
    p = np.asarray(energy_prices, float)
    awards = np.asarray(awards, float)
    dep_up, dep_dn = reg_deploy * awards[:, REGUP], reg_deploy * awards[:, REGDN]
    energy = (p * (d - c + dep_up - dep_dn) - deg_cost * (d + dep_up)) * dt
    out = {"energy": energy}
    for k, name in enumerate(PRODUCTS):
        out[name] = np.asarray(as_prices, float)[:, k] * awards[:, k] * dt
    return out
