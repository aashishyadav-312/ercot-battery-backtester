"""Build results/walkthrough.json: 15-minute prices and the optimal battery schedule for a handful of featured days.

This feeds the "How a battery makes money here" walkthrough on the web "Start here" page. The year's
results JSON only holds daily totals, so the interval-level detail for the days shown there lives in
this small separate file (about 16 days, a few tens of KB).

Featured days for one location-year (default HB_HOUSTON 2025, 100 MW / 2 h / 85% round trip / $10 per
MWh, the same battery as the Overview default):
  * the 10 best days of the year, best first (the first is the walkthrough's default),
  * a typical day (revenue closest to the median),
  * a quiet day (revenue closest to the 10th percentile),
  * the day with the most negative price.
Daylight-saving days (92 or 100 intervals) are never featured, so every day has exactly 96 intervals.

Each day is solved exactly as model.run_year does (same LP, same empty start and end of day), and its revenue
must match the stored results/{location}_{year}_{hours}h_{rte}_{deg}.json, or the build stops.

CLI:
    python -m scripts.build_walkthrough
    python -m scripts.build_walkthrough --location HB_HOUSTON --year 2025 --hours 2 --deg-cost 10
"""

from __future__ import annotations

import argparse
import json
import logging

import numpy as np
import pandas as pd

from model.dispatch import optimize_day
from model.run_year import DT_HOURS, RESULTS_DIR, SOC0_FRAC, result_path

log = logging.getLogger(__name__)

INTERVALS = 96
DT = DT_HOURS["RT15"]
POWER_MW = 100.0
PRICE_DECIMALS = 2
MW_DECIMALS = 3
SOC_DECIMALS = 2
REVENUE_TOLERANCE = 1.0  # dollars; the stored daily revenue is rounded to cents


def _trim(values, decimals: int) -> list:
    """Round and turn whole numbers into ints so the JSON stays small (100.0 -> 100)."""
    out = []
    for v in np.round(np.asarray(values, dtype=float), decimals) + 0.0:  # + 0.0 turns -0.0 into 0.0
        out.append(int(v) if float(v).is_integer() else float(v))
    return out


def full_days(rt: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Central-time days with exactly 96 priced 15-minute intervals, keyed by ISO date."""
    df = rt.copy()
    df["day"] = df["interval_start_local"].dt.strftime("%Y-%m-%d")
    out = {}
    for day, g in df.groupby("day", sort=True):
        g = g.sort_values("interval_start_local")
        if len(g) == INTERVALS and g["price"].notna().all():
            out[day] = g
    return out


def revenue_from_arrays(price: list[float], net_mw: list[float], deg_cost: float) -> float:
    """Net revenue a reader of the JSON would get from the stored (rounded) arrays."""
    p, n = np.asarray(price, dtype=float), np.asarray(net_mw, dtype=float)
    return float((p * n).sum() * DT - deg_cost * n[n > 0].sum() * DT)


def pick_featured(revenue: pd.Series, min_price: pd.Series, n_top: int = 10) -> list[tuple[str, str, str]]:
    """Choose featured days. `revenue` and `min_price` are indexed by ISO date (full 96-interval days only).

    Returns (date, kind, label) tuples, best day first. A day appears once, under its first label.
    """
    ranked = revenue.sort_values(ascending=False)
    picks: list[tuple[str, str, str]] = []

    def add(date: str, kind: str, label: str) -> None:
        if all(date != p[0] for p in picks):
            picks.append((date, kind, label))

    for i, date in enumerate(ranked.index[:n_top]):
        add(date, "top", "Best day of the year" if i == 0 else f"Top-10 day, #{i + 1}")
    positive = revenue[revenue > 0]
    if len(positive):
        add((positive - positive.median()).abs().idxmin(), "typical", "A typical day")
        add((positive - positive.quantile(0.10)).abs().idxmin(), "quiet", "A quiet day")
    add(min_price.idxmin(), "negative", "Most negative price of the year")
    return picks


def solve_day(g: pd.DataFrame, hours: float, rte: float, deg_cost: float) -> dict:
    return optimize_day(g["price"].to_numpy(), DT, POWER_MW, POWER_MW * hours, rte, deg_cost, SOC0_FRAC)


def build(
    rt: pd.DataFrame,
    da: pd.DataFrame | None,
    stored_daily: dict[str, float],
    location: str,
    year: int,
    hours: float,
    rte: float,
    deg_cost: float,
    year_revenue_per_kw: float,
) -> dict:
    """Assemble the walkthrough document from RT prices, optional DA prices and the stored daily revenue."""
    days = full_days(rt)
    solved = {d: solve_day(g, hours, rte, deg_cost) for d, g in days.items()}
    revenue = pd.Series({d: s["revenue"] for d, s in solved.items()})
    min_price = pd.Series({d: g["price"].min() for d, g in days.items()})

    da_by_day: dict[str, list[float]] = {}
    if da is not None:
        d2 = da.copy()
        d2["day"] = d2["interval_start_local"].dt.strftime("%Y-%m-%d")
        for day, g in d2.groupby("day"):
            if len(g) == 24 and g["price"].notna().all():
                da_by_day[day] = g.sort_values("interval_start_local")["price"].tolist()

    out_days = []
    for date, kind, label in pick_featured(revenue, min_price):
        s = solved[date]
        if date in stored_daily and abs(s["revenue"] - stored_daily[date]) > REVENUE_TOLERANCE:
            raise RuntimeError(
                f"{date}: re-solved revenue {s['revenue']:.2f} differs from stored {stored_daily[date]:.2f}; "
                "the cached prices do not match the results files"
            )
        sch = s["schedule"]
        day = {
            "date": date,
            "kind": kind,
            "label": label,
            "revenue": round(s["revenue"], 2),
            "price": _trim(sch["price"], PRICE_DECIMALS),
            "net_mw": _trim(sch["net_mw"], MW_DECIMALS),
            "soc_mwh": _trim(sch["soc_mwh"], SOC_DECIMALS),
        }
        stored_rev = revenue_from_arrays(day["price"], day["net_mw"], deg_cost)
        if abs(stored_rev - s["revenue"]) > REVENUE_TOLERANCE * 2:
            raise RuntimeError(f"{date}: rounding the arrays moved revenue from {s['revenue']:.2f} to {stored_rev:.2f}")
        if date in da_by_day:
            day["da_price"] = _trim(da_by_day[date], PRICE_DECIMALS)
        out_days.append(day)

    return {
        "meta": {
            "location": location,
            "year": year,
            "power_mw": POWER_MW,
            "duration_h": hours,
            "energy_mwh": POWER_MW * hours,
            "rte": rte,
            "deg_cost_per_mwh": deg_cost,
            "interval_minutes": 15,
            "soc_start_end_frac": SOC0_FRAC,
            "year_revenue_per_kw": year_revenue_per_kw,
            "method": "perfect-foresight energy arbitrage for each featured day, solved exactly as in the year run",
            "price_series": "ERCOT real-time 15-min settlement point price; day-ahead hourly price where available",
            "net_mw": "positive = discharging (selling), negative = charging (buying)",
            "soc_mwh": "state of charge at the end of each interval",
            "featured": "10 best days, a typical day (median revenue), a quiet day (10th percentile), the most negative price",
        },
        "days": out_days,
    }


def main() -> None:
    from data.fetch_prices import fetch

    p = argparse.ArgumentParser(description="Write results/walkthrough.json for the web Start-here page.")
    p.add_argument("--location", default="HB_HOUSTON")
    p.add_argument("--year", type=int, default=2025)
    p.add_argument("--hours", type=float, default=2.0)
    p.add_argument("--rte", type=float, default=0.85)
    p.add_argument("--deg-cost", type=float, default=10.0)
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    stored = json.loads(result_path(args.location, args.year, args.hours, args.rte, args.deg_cost).read_text())
    stored_daily = dict(zip(stored["daily"]["date"], stored["daily"]["revenue"]))
    rt = fetch(args.location, args.year, "RT15")
    try:
        da = fetch(args.location, args.year, "DA")
    except Exception as e:  # DA is only used for one illustration; the walkthrough works without it
        log.warning("No day-ahead prices (%s); continuing without them", e)
        da = None

    doc = build(
        rt, da, stored_daily, args.location, args.year, args.hours, args.rte, args.deg_cost,
        stored["metrics"]["revenue_per_kw_year"],
    )
    path = RESULTS_DIR / "walkthrough.json"
    path.write_text(json.dumps(doc, separators=(",", ":")))
    log.info("Wrote %s (%.1f KB, %d days)", path, path.stat().st_size / 1024, len(doc["days"]))
    for d in doc["days"]:
        log.info("  %s  %-34s $%10.2f", d["date"], d["label"], d["revenue"])


if __name__ == "__main__":
    main()
