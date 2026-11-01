"""Price-taking energy + AS capacity screening model (not an ERCOT dispatch replica).

Capacity revenue excludes deployment energy, mileage, penalties and qualification.
All upward reserves share both inverter capacity and stored energy; regulation
down shares capacity and charging headroom. Backing is checked at both ends of
each interval, and DA capacity awards are held for the entire physical hour.
"""
from __future__ import annotations

import math
import numpy as np
import pandas as pd
import pulp

PRODUCTS = ("REGUP", "REGDN", "RRS", "ECRS", "NSPIN")
UP = ("REGUP", "RRS", "ECRS", "NSPIN")
RTC_DATE = "2025-12-05"
# Pre-RTC regulation/RRS: conservative full-hour capacity backing, not the
# declining remaining-hour SOC rule. ECRS/Non-Spin: sustained 2h/4h.
PRE_DURATIONS = dict(zip(PRODUCTS, (1.0, 1.0, 1.0, 2.0, 4.0)))
POST_DURATIONS = dict(zip(PRODUCTS, (0.5, 0.5, 0.5, 1.0, 4.0)))


def optimize_stack(prices, as_prices, dt_hours, power_mw, energy_mwh,
                   rte=0.85, deg_cost=0.0, soc0_frac=0.0, durations=None,
                   award_groups=None, max_as_share=1.0, mip_gap=1e-3, mip_time_limit_s=2.0):
    """Optimize a single day. AS prices are $/MW-hour, shape (n, 5).

    ``award_groups`` identifies physical hours (UTC, including DST repeats).
    Defaults to independent interval awards; pass groups for day-ahead AS.
    Duration parameters are hours of deliverable reserve at the grid connection.
    Conservative shared-inverter constraint sums both reserve directions.
    """
    p, a = np.asarray(prices, dtype=float), np.asarray(as_prices, dtype=float)
    n = len(p)
    durations = POST_DURATIONS if durations is None else durations
    if (n == 0 or a.shape != (n, 5) or not np.isfinite(p).all()
            or not all(math.isfinite(v) for v in (dt_hours, power_mw, energy_mwh, deg_cost))
            or not np.isfinite(a).all() or dt_hours <= 0 or power_mw <= 0
            or energy_mwh <= 0 or not 0 < rte <= 1 or deg_cost < 0
            or not 0 <= soc0_frac <= 1 or not 0 <= max_as_share <= 1
            or not 0 <= mip_gap <= .01
            or not math.isfinite(mip_time_limit_s) or mip_time_limit_s <= 0
            or set(durations) != set(PRODUCTS)
            or any(not math.isfinite(v) or v <= 0 for v in durations.values())):
        raise ValueError("Invalid battery, prices, reserve durations or capacity share")
    groups = list(range(n)) if award_groups is None else list(award_groups)
    if len(groups) != n:
        raise ValueError("award_groups must match the price intervals")
    eta = math.sqrt(rte)

    def solve(exclusive):
        lp = pulp.LpProblem("energy_ancillary", pulp.LpMaximize)
        c = [lp.add_variable(f"c_{t}", 0, power_mw) for t in range(n)]
        d = [lp.add_variable(f"d_{t}", 0, power_mw) for t in range(n)]
        soc = [lp.add_variable(f"soc_{t}", 0, energy_mwh) for t in range(n + 1)]
        reserves = {k: [lp.add_variable(f"{k}_{t}", 0, power_mw * max_as_share)
                        for t in range(n)] for k in PRODUCTS}
        lp += pulp.lpSum((float(p[t]) * (d[t] - c[t]) - deg_cost * d[t]
                         + pulp.lpSum(float(a[t, j]) * reserves[k][t]
                                      for j, k in enumerate(PRODUCTS))) * dt_hours
                        for t in range(n))
        lp += soc[0] == energy_mwh * soc0_frac
        lp += soc[n] == energy_mwh * soc0_frac
        first = {}
        for t, group in enumerate(groups):
            lp += soc[t+1] == soc[t] + eta*c[t]*dt_hours - d[t]*dt_hours/eta
            lp += c[t] + d[t] + pulp.lpSum(reserves[k][t] for k in PRODUCTS) <= power_mw
            lp += pulp.lpSum(reserves[k][t] for k in PRODUCTS) <= power_mw*max_as_share
            up_energy = pulp.lpSum(reserves[k][t]*durations[k]/eta for k in UP)
            down_energy = reserves["REGDN"][t]*durations["REGDN"]*eta
            # Valid strengthening of the binary model: scheduled discharge
            # cannot spend reserve backing, and charging cannot consume reserved
            # down headroom. With exclusive modes these follow from the end-SOC
            # constraints, but adding them tightens the continuous relaxation.
            lp += soc[t] >= up_energy + d[t]*dt_hours/eta
            lp += energy_mwh - soc[t] >= down_energy + c[t]*eta*dt_hours
            for edge in (t, t+1):
                lp += soc[edge] >= up_energy
                lp += energy_mwh - soc[edge] >= down_energy
            if group in first:
                for k in PRODUCTS:
                    lp += reserves[k][t] == reserves[k][first[group]]
            else:
                first[group] = t
            if t in exclusive:
                mode = lp.add_variable(f"mode_{t}", cat="Binary")
                lp += c[t] <= power_mw*mode
                lp += d[t] <= power_mw*(1-mode)
        status = lp.solve(pulp.HiGHS(msg=False, gapRel=mip_gap, timeLimit=mip_time_limit_s if exclusive else 10, threads=1))
        # Match the existing energy solver's PuLP 3.x / 4.x result handling.
        if hasattr(status, 'status'):
            optimal = status.status == pulp.LpSolveStatus.Optimal
            feasible = optimal or (bool(exclusive) and status.has_solution)
        else:
            optimal = status == pulp.LpStatusOptimal
            feasible = optimal or lp.sol_status in (pulp.LpSolutionOptimal, pulp.LpSolutionIntegerFeasible)
        if not exclusive and not optimal:
            raise RuntimeError('Ancillary LP did not reach an optimal solution')
        if not feasible:
            raise RuntimeError("Ancillary dispatch has no feasible solution")
        gap = lp.solverModel.getInfo().mip_gap if exclusive else 0.0
        val = lambda xs: np.array([x.value() or 0.0 for x in xs])
        return val(c), val(d), val(soc), {k: val(v) for k, v in reserves.items()}, gap

    c, d, soc, reserves, gap = solve(set())
    used_milp = bool(((c > 1e-6) & (d > 1e-6)).any())
    if used_milp:
        # Preserve the energy-only negative-price fallback. If capacity prices
        # create overlap at positive energy prices too, cover every interval.
        binary = set(np.flatnonzero(p <= 0))
        if ((c > 1e-6) & (d > 1e-6) & (p > 0)).any():
            binary = set(range(n))
        c, d, soc, reserves, gap = solve(binary)
        if ((c > 1e-6) & (d > 1e-6)).any():
            c, d, soc, reserves, gap = solve(set(range(n)))
        if ((c > 1e-6) & (d > 1e-6)).any():
            raise RuntimeError('Solver returned charge/discharge overlap despite binary constraints')
    energy = float(np.dot(p, d-c)*dt_hours - deg_cost*d.sum()*dt_hours)
    components = {"energy": energy, **{k: float(np.dot(a[:, j], reserves[k])*dt_hours)
                  for j, k in enumerate(PRODUCTS)}}
    schedule = pd.DataFrame({"price": p, "charge_mw": c, "discharge_mw": d,
                             "net_mw": d-c, "soc_start_mwh": soc[:-1],
                             "soc_mwh": soc[1:], **reserves})
    return {"schedule": schedule, "components": components,
            "revenue": sum(components.values()), "used_milp": used_milp,
            "solver_gap": float(gap) if np.isfinite(gap) else None,
            "solver_time_limit_s": mip_time_limit_s,
            "cycles": float(d.sum()*dt_hours/energy_mwh)}
