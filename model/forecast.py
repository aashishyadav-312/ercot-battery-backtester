"""Schedule on day-ahead prices, settle in real time.

The perfect-foresight model (model/dispatch.py, model/run_year.py) picks each
day's schedule with the real-time prices already known. This module asks what
happens without that knowledge, using the day-ahead price as the forecast:

1. Solve the same daily LP on the DA hourly settlement point prices.
2. Hold that hourly schedule fixed. Each hourly MW applies to its four
   15-minute real-time intervals.
3. Pay it the real-time 15-minute prices (minus the same degradation cost).

The battery physics are the same as the perfect-foresight run (same power,
energy, efficiency, degradation and start/end state of charge), so the only
thing that changes is what the schedule knew when it was chosen.

This is "DA price as a forecast of RT", not a two-settlement market position.
If the battery instead sold its DA schedule in the day-ahead market and then
followed it exactly, the RT deviations would be zero and it would earn the DA
revenue; that figure is reported alongside as `da_revenue_at_da`.

The gap between perfect foresight and the DA-scheduled revenue (same days) is
the "value of perfect foresight": what knowing the RT prices in advance is
worth. capture_rate = DA-scheduled revenue at RT / perfect-foresight revenue.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from model.dispatch import optimize_day

log = logging.getLogger(__name__)

RT_DT = 0.25
DA_DT = 1.0
INTERVALS_PER_HOUR = 4
MAX_DA_GAP_HOURS = 1  # a DA day with more than one missing hour is skipped


def settle(net_mw: np.ndarray, rt_prices: np.ndarray, dt_hours: float = RT_DT, deg_cost_per_mwh: float = 0.0) -> dict:
    """Revenue of a fixed per-interval schedule (+ = discharge) at the given prices."""
    net_mw = np.asarray(net_mw, dtype=float)
    rt_prices = np.asarray(rt_prices, dtype=float)
    if net_mw.shape != rt_prices.shape:
        raise ValueError(f"schedule has {net_mw.shape} intervals, prices have {rt_prices.shape}")
    gross = float((rt_prices * net_mw).sum() * dt_hours)
    discharged = float(np.clip(net_mw, 0, None).sum() * dt_hours)
    deg = deg_cost_per_mwh * discharged
    return {"revenue": gross - deg, "gross_revenue": gross, "degradation_cost": deg, "energy_discharged_mwh": discharged}


def da_schedule_rt_settle(
    da_prices: np.ndarray,
    rt_prices: np.ndarray,
    power_mw: float,
    energy_mwh: float,
    rte: float = 0.85,
    deg_cost_per_mwh: float = 0.0,
    soc0_frac: float = 0.0,
) -> dict:
    """One day: optimize on hourly DA prices, settle at 15-min RT prices.

    `rt_prices` must have exactly four intervals per DA hour (in order), which
    holds for complete days including the 23- and 25-hour DST days.
    """
    da_prices = np.asarray(da_prices, dtype=float)
    rt_prices = np.asarray(rt_prices, dtype=float)
    if len(rt_prices) != INTERVALS_PER_HOUR * len(da_prices):
        raise ValueError(f"{len(rt_prices)} RT intervals for {len(da_prices)} DA hours; expected 4 per hour")
    if not np.isfinite(rt_prices).all():
        raise ValueError("rt_prices contain NaN or inf")
    da = optimize_day(da_prices, DA_DT, power_mw, energy_mwh, rte, deg_cost_per_mwh, soc0_frac)
    net_rt = np.repeat(da["schedule"]["net_mw"].to_numpy(), INTERVALS_PER_HOUR)
    at_rt = settle(net_rt, rt_prices, RT_DT, deg_cost_per_mwh)
    return {
        "revenue_at_rt": at_rt["revenue"],
        "gross_revenue_at_rt": at_rt["gross_revenue"],
        "revenue_at_da": da["revenue"],
        "degradation_cost": da["degradation_cost"],
        "energy_discharged_mwh": da["energy_discharged_mwh"],
        "cycles": da["cycles"],
        "net_mw_rt": net_rt,
        "da_schedule": da["schedule"],
    }


def _day_key(local: pd.Series) -> pd.Series:
    return local.dt.tz_localize(None).dt.normalize().dt.date.astype(str)


def run_da_schedule(
    rt: pd.DataFrame,
    da: pd.DataFrame,
    power_mw: float,
    hours: float,
    rte: float,
    deg_cost: float,
    soc0_frac: float,
    days: list[str] | None = None,
) -> dict:
    """DA-schedule / RT-settle over many days.

    rt, da: frames from data.fetch_prices.fetch (interval_start_utc,
    interval_start_local, price). `days` restricts the run to these ISO dates
    (the days the perfect-foresight run solved), so the two are compared on
    identical days. Each RT interval is matched to the DA hour that contains it
    by UTC timestamp, so DST days line up. Single missing RT intervals are
    filled within the day, as in the perfect-foresight run; a day with a DA
    gap of more than one hour, or without four RT intervals per DA hour, is
    skipped and listed.

    Returns {"daily": DataFrame[date, da_rt_revenue, da_da_revenue, cycles], "skipped_days": [...]}.
    """
    energy = power_mw * hours
    rt = rt[["interval_start_utc", "interval_start_local", "price"]].copy()
    da = da[["interval_start_utc", "interval_start_local", "price"]].copy()
    rt["day"] = _day_key(rt["interval_start_local"])
    da["day"] = _day_key(da["interval_start_local"])
    rt["hour_utc"] = rt["interval_start_utc"].dt.floor("h")

    wanted = sorted(days) if days is not None else sorted(set(rt["day"]) & set(da["day"]))
    rt_by_day = dict(tuple(rt.groupby("day", sort=False)))
    da_by_day = dict(tuple(da.groupby("day", sort=False)))

    rows, skipped = [], []
    for day in wanted:
        g_da, g_rt = da_by_day.get(day), rt_by_day.get(day)
        if g_da is None or g_rt is None:
            skipped.append(day)
            log.warning("DA schedule: no %s prices for %s", "DA" if g_da is None else "RT", day)
            continue
        g_da = g_da.sort_values("interval_start_utc")
        if int(g_da["price"].isna().sum()) > MAX_DA_GAP_HOURS:
            skipped.append(day)
            log.warning("DA schedule: skipping %s, DA gap", day)
            continue
        g_rt = g_rt.sort_values("interval_start_utc")
        counts = g_rt.groupby("hour_utc").size().reindex(g_da["interval_start_utc"])
        if counts.isna().any() or (counts != INTERVALS_PER_HOUR).any() or len(g_rt) != INTERVALS_PER_HOUR * len(g_da):
            skipped.append(day)
            log.warning("DA schedule: skipping %s, RT intervals don't line up with DA hours", day)
            continue
        da_p = g_da["price"].ffill().bfill().to_numpy()
        rt_p = g_rt["price"].ffill().bfill().to_numpy()
        r = da_schedule_rt_settle(da_p, rt_p, power_mw, energy, rte, deg_cost, soc0_frac)
        rows.append(
            {"date": day, "da_rt_revenue": r["revenue_at_rt"], "da_da_revenue": r["revenue_at_da"], "cycles": r["cycles"]}
        )
    daily = pd.DataFrame(rows, columns=["date", "da_rt_revenue", "da_da_revenue", "cycles"])
    return {"daily": daily, "skipped_days": skipped}


def summarize_da(pf_daily: pd.DataFrame, da_daily: pd.DataFrame, power_mw: float, scale: float) -> dict:
    """Compare DA-scheduled and perfect-foresight revenue on the days both have.

    pf_daily: [date, revenue] from the perfect-foresight run. `scale` is the
    same annualization factor the perfect-foresight metrics use (365 / days
    covered for a partial year, else 1), so $/kW-yr figures are comparable.
    """
    kw = power_mw * 1000
    m = pf_daily[["date", "revenue"]].merge(da_daily, on="date", how="inner")
    pf = float(m["revenue"].sum())
    da_rt = float(m["da_rt_revenue"].sum())
    da_da = float(m["da_da_revenue"].sum())
    return {
        "da_rt_revenue_per_kw_year": round(da_rt / kw * scale, 2),
        "da_rt_revenue_per_kw_period": round(da_rt / kw, 2),
        "da_da_revenue_per_kw_year": round(da_da / kw * scale, 2),
        "pf_revenue_per_kw_year_matched": round(pf / kw * scale, 2),
        "value_of_perfect_foresight_per_kw_year": round((pf - da_rt) / kw * scale, 2),
        "capture_rate": round(da_rt / pf, 4) if pf > 0 else None,
        "da_days_matched": int(len(m)),
        "da_losing_days": int((m["da_rt_revenue"] < 0).sum()),
        "da_cycles_per_year": round(float(m["cycles"].sum()) * scale, 1),
    }
