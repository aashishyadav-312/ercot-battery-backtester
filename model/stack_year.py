"""Run the v4 revenue stack (model/stack.py) for one settlement point and year.

Two modes:

* foresight: perfect hindsight upper bound. Energy at RT 15-minute settlement
  point prices. AS at the DAM MCPC, with awards held for the physical hour,
  before RTC+B. From RTC+B (Dec 5, 2025) AS per 15 minutes at the higher of
  that hour's DAM MCPC and the settled RT MCPC; awards may change each
  interval. Where the RT AS price is not yet published the DAM MCPC is used.
* realistic: energy schedule and AS awards chosen from DAM prices only (DA
  hourly settlement point prices and DAM MCPC). The hourly energy schedule is
  then settled at RT 15-minute prices, the same way as model/forecast.py.
  AS awards are paid the DAM MCPC and held in real time.

Both modes run on the same set of days, so foresight >= realistic holds on
every day (the realistic schedule is feasible in the foresight problem and
earns at least as much there). A day is used when RT prices have at most
model.run_year.MAX_GAP_INTERVALS gaps, DA prices at most
model.forecast.MAX_DA_GAP_HOURS, RT intervals line up four per DA hour, and
every AS product that existed that day has a DAM price for each hour.
Single gaps are filled within the day, as in model/run_year.py.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from model.forecast import MAX_DA_GAP_HOURS
from model.run_year import MAX_GAP_INTERVALS, _expected_intervals
from model.stack import PRODUCTS, Battery, Options, durations, optimize, revenue_components

AS_COLUMNS = ("REGUP", "REGDN", "RRS", "ECRS", "NSPIN")  # parquet columns, PRODUCTS order
TZ = "US/Central"


def _local_day(utc: pd.Series) -> pd.Series:
    return utc.dt.tz_convert(TZ).dt.strftime("%Y-%m-%d")


def valid_days(rt: pd.DataFrame, da: pd.DataFrame, as_da: pd.DataFrame, end_day: str | None = None) -> list[str]:
    """Days usable by both modes (see module docstring)."""
    rt = rt.assign(day=_local_day(rt["interval_start_utc"]), hour=rt["interval_start_utc"].dt.floor("h"))
    da = da.assign(day=_local_day(da["interval_start_utc"]))
    asd = as_da.assign(day=_local_day(as_da["interval_start_utc"]))
    others = [c for c in AS_COLUMNS if c != "ECRS"]
    rt_n = rt.groupby("day").size()
    rt_ok_n = rt.groupby("day")["price"].count()
    per_hour = rt.groupby(["day", "hour"]).size()
    hour_ok = (per_hour == 4).groupby(level="day").all()
    rt_hours = {d: set(g.index.get_level_values("hour")) for d, g in per_hour.groupby(level="day")}
    da_gaps = da["price"].isna().groupby(da["day"]).sum()
    da_hours = {d: set(g) for d, g in da.groupby("day")["interval_start_utc"]}
    as_ok = asd[others].notna().all(axis=1).groupby(asd["day"]).all()
    ecrs_n = asd["ECRS"].notna().groupby(asd["day"]).sum()
    as_n = asd.groupby("day").size()
    as_hours = {d: set(g) for d, g in asd.groupby("day")["interval_start_utc"]}
    out = []
    for day in sorted(rt_n.index):
        if end_day and day > end_day:
            continue
        exp = _expected_intervals(pd.Timestamp(day), 0.25)
        if rt_n[day] != exp or exp - rt_ok_n[day] > MAX_GAP_INTERVALS or not hour_ok[day]:
            continue
        if day not in da_hours or da_gaps[day] > MAX_DA_GAP_HOURS or day not in as_hours:
            continue
        if not as_ok[day] or ecrs_n[day] not in (0, as_n[day]):
            continue
        hours = da_hours[day]
        if len(hours) * 4 != exp or hours != as_hours[day] or hours != rt_hours[day]:
            continue
        out.append(day)
    return out


def _prep(rt, da, as_da, as_rt, days, rules):
    days = set(days)
    rt = rt[["interval_start_utc", "price"]].copy()
    rt["day"] = _local_day(rt["interval_start_utc"])
    rt = rt[rt["day"].isin(days)].sort_values("interval_start_utc").reset_index(drop=True)
    rt["price"] = rt.groupby("day")["price"].transform(lambda s: s.ffill().bfill())
    rt["hour"] = rt["interval_start_utc"].dt.floor("h")
    da = da[["interval_start_utc", "price"]].copy()
    da["day"] = _local_day(da["interval_start_utc"])
    da = da[da["day"].isin(days)].sort_values("interval_start_utc").reset_index(drop=True)
    da["price"] = da.groupby("day")["price"].transform(lambda s: s.ffill().bfill())
    asd = as_da.set_index("interval_start_utc")[list(AS_COLUMNS)]
    da_as = asd.reindex(da["interval_start_utc"]).to_numpy(float)
    rt_as_da = asd.reindex(rt["hour"]).to_numpy(float)
    rtcb = pd.Timestamp(rules["rtcb_go_live"]["date"]).strftime("%Y-%m-%d")
    post_rt = (rt["day"] >= rtcb).to_numpy()
    post_da = (da["day"] >= rtcb).to_numpy()
    rt_as = rt_as_da.copy()
    rt_missing_days = set()
    if post_rt.any():
        if as_rt is None or as_rt.empty:
            rt_missing_days = set(rt.loc[post_rt, "day"])
        else:
            rtv = as_rt.set_index("interval_start_utc")[list(AS_COLUMNS)].reindex(rt["interval_start_utc"]).to_numpy(float)
            use = post_rt[:, None] & np.isfinite(rtv)
            rt_as[use] = np.fmax(rt_as_da[use], rtv[use])
            miss = post_rt & ~np.isfinite(rtv).all(axis=1)
            rt_missing_days = set(rt.loc[miss, "day"])
    return rt, da, da_as, rt_as, post_rt, post_da, rt_missing_days


def run_point_year(rt, da, as_da, as_rt, days, hours, rules, mode, battery=None, options=None, block_days=7):
    """$ by component and day for one settlement point.

    rt, da: frames with interval_start_utc (UTC) and price (RT 15-minute, DA hourly).
    as_da: DAM MCPC, hourly; as_rt: settled RT MCPC (15-minute) or None.
    Returns {"daily": DataFrame[day, energy, regup, regdn, rrs, ecrs, nsrs, used_milp], "rt_as_missing_days": [...]}.
    """
    bat = battery or Battery(energy_mwh=100.0 * hours)
    opt = options or Options()
    rt, da, da_as, rt_as, post_rt, post_da, rt_missing = _prep(rt, da, as_da, as_rt, days, rules)
    pre_d, post_d = durations(rules, False), durations(rules, True)
    f = opt.reg_deploy if opt.as_enabled else 0.0
    cols = ["day", "energy", *PRODUCTS, "used_milp"]
    if mode == "foresight":
        dur = np.where(post_rt[:, None], post_d, pre_d)
        # Pre-RTC+B awards are DAM awards: one per physical hour. Afterwards per interval.
        group = np.where(post_rt, np.arange(len(rt)), -1 - rt["hour"].dt.tz_localize(None).to_numpy().astype("datetime64[h]").astype(np.int64))
        out = optimize(rt["price"].to_numpy(), rt_as, 0.25, rt["day"].to_numpy(), dur,
                       award_groups=group, battery=bat, options=opt, block_days=block_days)
        daily = pd.DataFrame(out["days"])[cols]
    elif mode == "realistic":
        dur = np.where(post_da[:, None], post_d, pre_d)
        out = optimize(da["price"].to_numpy(), da_as, 1.0, da["day"].to_numpy(), dur,
                       battery=bat, options=opt, block_days=block_days)
        # Settle the hourly energy schedule (and Reg deployment energy) at RT 15-minute prices.
        k = 4
        c, d, aw = (np.repeat(out[x], k, axis=0) for x in ("charge", "discharge", "awards"))
        comp = revenue_components(rt["price"].to_numpy(), np.zeros((len(rt), 5)), 0.25, c, d, aw, bat.deg_cost, f)
        energy = pd.Series(comp["energy"]).groupby(rt["day"].to_numpy()).sum()
        daily = pd.DataFrame(out["days"])
        daily["energy"] = daily["day"].map(energy)
        daily = daily[cols]
    else:
        raise ValueError("mode must be 'foresight' or 'realistic'")
    return {"daily": daily, "rt_as_missing_days": sorted(rt_missing) if mode == "foresight" else []}


def per_kw_year(daily: pd.DataFrame, power_mw: float, year: int) -> tuple[dict, float]:
    """$/kW-yr by component, annualized like model/metrics.py (365 / days when the year is incomplete)."""
    year_days = 366 if pd.Timestamp(year=year, month=12, day=31).dayofyear == 366 else 365
    n = len(daily)
    scale = 365 / n if n < year_days else 1.0
    kw = power_mw * 1000
    out = {k: round(float(daily[k].sum()) / kw * scale, 2) for k in ("energy", *PRODUCTS)}
    out["total"] = round(sum(float(daily[k].sum()) for k in ("energy", *PRODUCTS)) / kw * scale, 2)
    return out, scale
