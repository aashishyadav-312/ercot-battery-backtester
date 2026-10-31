"""Single-day battery dispatch LP (PuLP + HiGHS).

For one operating day with known prices (perfect foresight), choose charge and
discharge power in each interval to maximize arbitrage revenue:

    max  sum_t price_t * (d_t - c_t) * dt  -  deg_cost * sum_t d_t * dt

    s.t. 0 <= c_t, d_t <= P
         0 <= soc_t <= E
         soc_{t+1} = soc_t + c_t * eta * dt - d_t / eta * dt,   eta = sqrt(rte)
         soc_0 = soc_T = soc0_frac * E

Round-trip efficiency is split evenly between charging and discharging.
Degradation is charged per MWh discharged, so one full cycle costs deg_cost * E.

Charge plus discharge in one interval is also capped at P (one shared inverter).

With zero or negative prices the pure LP can charge and discharge in the same
interval to burn energy through conversion losses, which a real battery can't
do. When that happens the day is re-solved as a MILP with a charge-or-discharge
binary for each interval priced at or below zero. Overlap can't pay at positive
prices, so those intervals need no binary, and days without such prices stay a
fast LP. The MILP stops at a 0.01% optimality gap or a time limit, whichever
comes first, and keeps the best schedule found.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pulp

_TOL = 1e-6
_MILP_GAP = 1e-4
_MILP_TIME_LIMIT_S = 10.0


def _solve(prices, dt, power_mw, energy_mwh, eta, deg_cost, soc0, exclusive):
    n = len(prices)
    prob = pulp.LpProblem("battery_day", pulp.LpMaximize)
    c = [prob.add_variable(f"c_{t}", 0, power_mw) for t in range(n)]
    d = [prob.add_variable(f"d_{t}", 0, power_mw) for t in range(n)]
    soc = [prob.add_variable(f"soc_{t}", 0, energy_mwh) for t in range(n + 1)]

    prob += pulp.lpSum(
        float(prices[t]) * (d[t] - c[t]) * dt - deg_cost * d[t] * dt for t in range(n)
    )
    prob += soc[0] == soc0
    prob += soc[n] == soc0
    for t in range(n):
        prob += soc[t + 1] == soc[t] + c[t] * eta * dt - d[t] * (dt / eta)
        prob += c[t] + d[t] <= power_mw

    if exclusive:
        for t in np.flatnonzero(np.asarray(prices) <= 0):
            mode = prob.add_variable(f"m_{t}", cat="Binary")
            prob += c[t] <= power_mw * mode
            prob += d[t] <= power_mw * (1 - mode)
        solver = pulp.HiGHS(msg=False, gapRel=_MILP_GAP, timeLimit=_MILP_TIME_LIMIT_S)
    else:
        solver = pulp.HiGHS(msg=False)

    result = prob.solve(solver)
    if hasattr(result, "status"):  # PuLP >= 4 (Python >= 3.12) returns a stats object
        ok = result.status == pulp.LpSolveStatus.Optimal or (exclusive and result.has_solution)
        status_name = result.status.name
    else:  # PuLP 3.x (Python 3.11) returns an int status
        ok = result == pulp.LpStatusOptimal or (
            exclusive and prob.sol_status in (pulp.LpSolutionOptimal, pulp.LpSolutionIntegerFeasible)
        )
        status_name = pulp.LpStatus.get(result, str(result))
    if not ok:
        raise RuntimeError(f"Dispatch solve failed: {status_name}")

    def values(xs):
        return np.array([x.value() or 0.0 for x in xs])

    return values(c), values(d), values(soc)


def optimize_day(
    prices: np.ndarray,
    dt_hours: float,
    power_mw: float,
    energy_mwh: float,
    rte: float = 0.85,
    deg_cost_per_mwh: float = 0.0,
    soc0_frac: float = 0.5,
) -> dict:
    """Optimal perfect-foresight dispatch for one day.

    Args:
        prices: $/MWh for each interval of the day (any length, so DST days work).
        dt_hours: interval length in hours (0.25 for real-time, 1.0 for day-ahead).
        power_mw: charge and discharge limit.
        energy_mwh: usable energy capacity.
        rte: round-trip efficiency, 0 < rte <= 1.
        deg_cost_per_mwh: cost per MWh discharged.
        soc0_frac: state of charge at the start and end of the day, as a fraction of energy_mwh.

    Returns:
        dict with "schedule" (DataFrame per interval), "revenue" (net of degradation, $),
        "gross_revenue", "degradation_cost", "energy_charged_mwh",
        "energy_discharged_mwh", "cycles", "used_milp".
    """
    prices = np.asarray(prices, dtype=float)
    if prices.ndim != 1 or len(prices) == 0:
        raise ValueError("prices must be a non-empty 1-D array")
    if not np.isfinite(prices).all():
        raise ValueError("prices contain NaN or inf; fill or skip this day first")
    if not 0 < rte <= 1:
        raise ValueError("rte must be in (0, 1]")
    if power_mw <= 0 or energy_mwh <= 0 or dt_hours <= 0:
        raise ValueError("power_mw, energy_mwh and dt_hours must be positive")
    if not 0 <= soc0_frac <= 1:
        raise ValueError("soc0_frac must be in [0, 1]")

    eta = math.sqrt(rte)
    soc0 = soc0_frac * energy_mwh
    args = (prices, dt_hours, power_mw, energy_mwh, eta, deg_cost_per_mwh, soc0)

    charge, discharge, soc = _solve(*args, exclusive=False)
    used_milp = bool(((charge > _TOL) & (discharge > _TOL)).any())
    if used_milp:
        charge, discharge, soc = _solve(*args, exclusive=True)

    # Clean solver noise so tiny values don't show up as dispatch.
    charge[charge < _TOL] = 0.0
    discharge[discharge < _TOL] = 0.0

    net_mw = discharge - charge
    interval_revenue = prices * net_mw * dt_hours
    gross = float(interval_revenue.sum())
    discharged = float(discharge.sum() * dt_hours)
    charged = float(charge.sum() * dt_hours)
    deg = deg_cost_per_mwh * discharged

    schedule = pd.DataFrame(
        {
            "price": prices,
            "charge_mw": charge,
            "discharge_mw": discharge,
            "net_mw": net_mw,
            "soc_mwh": soc[1:],  # state of charge at the end of each interval
            "revenue": interval_revenue,
        }
    )
    return {
        "schedule": schedule,
        "revenue": gross - deg,
        "gross_revenue": gross,
        "degradation_cost": deg,
        "energy_charged_mwh": charged,
        "energy_discharged_mwh": discharged,
        "cycles": discharged / energy_mwh,
        "used_milp": used_milp,
    }
