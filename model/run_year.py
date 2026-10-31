"""Run the daily dispatch LP across a year and save the results.

Each Central-time operating day is solved on its own (perfect foresight within
the day). The battery starts and ends each day empty. A mid-level reset (e.g.
50%) forces a buy-back late every evening, which shows up as fake 11 p.m.
charging and lowers revenue; starting empty only gives up arbitrage across
midnight, which is small in ERCOT. Days with more than
MAX_GAP_INTERVALS missing prices are skipped and logged; smaller gaps are
forward-filled within the day.

CLI:
    python -m model.run_year --location HB_HOUSTON --year 2025 --hours 1 2 4
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from data.fetch_prices import fetch
from model.dispatch import optimize_day
from model.metrics import summarize

log = logging.getLogger(__name__)

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
MAX_GAP_INTERVALS = 4
DT_HOURS = {"RT15": 0.25, "DA": 1.0}
SOC0_FRAC = 0.0


def _expected_intervals(day: pd.Timestamp, dt_hours: float) -> int:
    """Intervals in a local day: 92/96/100 for 15-min data on DST/normal/DST days."""
    date = pd.Timestamp(day).date()
    start = pd.Timestamp(date.isoformat(), tz="US/Central")
    end = pd.Timestamp((date + timedelta(days=1)).isoformat(), tz="US/Central")
    return round((end - start) / pd.Timedelta(hours=dt_hours))


def run_year(
    location: str,
    year: int,
    power_mw: float = 100.0,
    hours: float = 2.0,
    rte: float = 0.85,
    deg_cost: float = 0.0,
    market: str = "RT15",
    prices: pd.DataFrame | None = None,
) -> dict:
    """Solve every day of the year.

    Returns a dict with "schedule" (interval-level DataFrame), "daily" (one row per
    solved day), "skipped_days" (list of ISO dates) and "params".
    `prices` can be passed in to skip the fetch (used by tests and batch runs).
    """
    if prices is None:
        prices = fetch(location, year, market)
    dt = DT_HOURS[market]
    energy_mwh = power_mw * hours

    prices = prices.copy()
    prices["day"] = prices["interval_start_local"].dt.tz_localize(None).dt.normalize()

    schedules, daily, skipped = [], [], []
    for day, g in prices.groupby("day", sort=True):
        missing = _expected_intervals(day, dt) - int(g["price"].notna().sum())
        if missing > MAX_GAP_INTERVALS:
            skipped.append(day.date().isoformat())
            log.warning("Skipping %s: %d missing intervals", day.date(), missing)
            continue
        p = g["price"].ffill().bfill().to_numpy()
        r = optimize_day(p, dt, power_mw, energy_mwh, rte, deg_cost, SOC0_FRAC)
        s = r["schedule"]
        s.insert(0, "interval_start_local", g["interval_start_local"].to_numpy())
        schedules.append(s)
        daily.append(
            {
                "date": day.date().isoformat(),
                "revenue": r["revenue"],
                "gross_revenue": r["gross_revenue"],
                "degradation_cost": r["degradation_cost"],
                "energy_charged_mwh": r["energy_charged_mwh"],
                "energy_discharged_mwh": r["energy_discharged_mwh"],
                "cycles": r["cycles"],
                "used_milp": r["used_milp"],
            }
        )

    return {
        "schedule": pd.concat(schedules, ignore_index=True),
        "daily": pd.DataFrame(daily),
        "skipped_days": skipped,
        "params": {
            "location": location,
            "year": year,
            "market": market,
            "power_mw": power_mw,
            "duration_h": hours,
            "energy_mwh": energy_mwh,
            "rte": rte,
            "deg_cost_per_mwh": deg_cost,
        },
    }


def result_path(location: str, year: int, hours: float, rte: float, deg_cost: float) -> Path:
    return RESULTS_DIR / f"{location}_{year}_{hours:g}h_{rte:g}_{deg_cost:g}.json"


def to_json(result: dict) -> dict:
    """Compact, web-ready summary of a year run, with every assumption listed."""
    p = result["params"]
    daily = result["daily"]
    first, last = daily["date"].iloc[0], daily["date"].iloc[-1]
    return {
        "meta": {
            **p,
            "method": "perfect-foresight energy arbitrage, solved one operating day at a time",
            "price_series": f"ERCOT {'real-time 15-min' if p['market'] == 'RT15' else 'day-ahead hourly'} settlement point price",
            "efficiency_split": "sqrt(rte) on charge and on discharge",
            "soc_start_end_frac": SOC0_FRAC,
            "degradation": "cost per MWh discharged",
            "excludes": ["ancillary services", "forecast error", "transmission/interconnection costs", "capacity fade"],
            "first_day": first,
            "last_day": last,
            "days_solved": int(len(daily)),
            "skipped_days": result["skipped_days"],
        },
        "metrics": summarize(result),
        "daily": {
            "date": daily["date"].tolist(),
            "revenue": np.round(daily["revenue"], 2).tolist(),
            "cycles": np.round(daily["cycles"], 3).tolist(),
        },
    }


DA_SCHEDULE_META = {
    "method": "optimize each day on ERCOT day-ahead hourly settlement point prices, hold that schedule "
    "fixed and settle it at real-time 15-minute prices (each hourly MW applies to its four 15-min intervals)",
    "battery": "same power, energy, efficiency, degradation cost and start/end state of charge as the perfect-foresight run",
    "comparison": "perfect-foresight and DA-scheduled revenue are compared on the same days; "
    "value_of_perfect_foresight = perfect foresight - DA-scheduled; capture_rate = DA-scheduled / perfect foresight",
    "da_da_revenue": "the same DA schedule paid at DA prices (what selling it day-ahead and following it exactly would earn)",
    "da_prices": "hubs: ERCOT annual archive NP4-180-ER; resource nodes: ERCOT public API NP4-190-CD",
}
DA_INDEX_FIELDS = ("da_rt_revenue_per_kw_year", "value_of_perfect_foresight_per_kw_year", "capture_rate")


def add_da_schedule(doc: dict, da: dict, pf_daily: pd.DataFrame | None = None) -> dict:
    """Add DA-schedule / RT-settle fields to a results JSON doc, leaving every existing field as it is.

    `da` is model.forecast.run_da_schedule output for the doc's days. `pf_daily`
    ([date, revenue], full precision) defaults to the doc's own rounded daily revenue.
    """
    from model.forecast import summarize_da

    meta, metrics = doc["meta"], doc["metrics"]
    if pf_daily is None:
        pf_daily = pd.DataFrame({"date": doc["daily"]["date"], "revenue": doc["daily"]["revenue"]})
    scale = 365 / metrics["days_covered"] if metrics["annualized"] else 1.0
    metrics.update(summarize_da(pf_daily, da["daily"], meta["power_mw"], scale))
    meta["da_schedule"] = {**DA_SCHEDULE_META, "skipped_days": da["skipped_days"]}
    by_day = dict(zip(da["daily"]["date"], np.round(da["daily"]["da_rt_revenue"], 2)))
    doc["daily"]["da_rt_revenue"] = [None if d not in by_day else float(by_day[d]) for d in doc["daily"]["date"]]
    return doc


def save(result: dict, da: dict | None = None) -> Path:
    p = result["params"]
    path = result_path(p["location"], p["year"], p["duration_h"], p["rte"], p["deg_cost_per_mwh"])
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = to_json(result)
    if da is not None:
        add_da_schedule(doc, da, result["daily"][["date", "revenue"]])
    path.write_text(json.dumps(doc, separators=(",", ":")))
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a year of battery dispatch.")
    parser.add_argument("--location", required=True)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--hours", type=float, nargs="+", default=[2.0])
    parser.add_argument("--power-mw", type=float, default=100.0)
    parser.add_argument("--rte", type=float, default=0.85)
    parser.add_argument("--deg-cost", type=float, default=0.0)
    parser.add_argument("--market", choices=sorted(DT_HOURS), default="RT15")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    prices = fetch(args.location, args.year, args.market)
    rows = []
    for h in args.hours:
        result = run_year(args.location, args.year, args.power_mw, h, args.rte, args.deg_cost, args.market, prices)
        path = save(result)
        m = summarize(result)
        rows.append(
            {
                "duration": f"{h:g}h",
                "$/kW-yr": m["revenue_per_kw_year"],
                "annualized": m["annualized"],
                "top10 share": m["top10_day_share"],
                "cycles/yr": m["cycles_per_year"],
                "spread $/MWh": m["avg_spread_captured"],
                "file": path.name,
                "KB": round(path.stat().st_size / 1024, 1),
            }
        )
    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
