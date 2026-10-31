"""Before vs after RTC+B (ERCOT real-time co-optimization plus batteries, live Dec 5, 2025).

Compares two equal-length windows that cover the same calendar days one year
apart, so seasonality is matched day for day:

    before: Dec 5, 2024 – END - 1 year      after: Dec 5, 2025 – END

END is the last day every location has 2026 results for (Oct 24, 2026 at the
time of writing), capped at Dec 4, 2026 so the before window stays before go-live. A day is used only if both it and its partner a year
earlier have perfect-foresight and DA-scheduled results.

For each location, duration and degradation setting it reports perfect-
foresight and DA-scheduled revenue ($/kW over the window) and the capture
rate. For each location it reports RT and DA price statistics over the same
days: the RT − DA spread (each 15-min RT price minus its hour's DA price) and
RT price volatility.

This describes what changed between the windows. It does not say why: battery
capacity, load, gas prices, weather and transmission all changed too, and the
model has no way to isolate RTC+B from them. Writes results/rtcb.json.

CLI:
    python -m scripts.rtcb
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import defaultdict

import numpy as np
import pandas as pd

from data.fetch_prices import fetch
from model.run_year import RESULTS_DIR

log = logging.getLogger(__name__)

GO_LIVE = pd.Timestamp("2025-12-05")
BEFORE_START = pd.Timestamp("2024-12-05")


def _daily_frame(index: list[dict], location: str, duration: float, deg: float) -> pd.DataFrame:
    """Per-day PF and DA-scheduled revenue for one location/duration/deg, across all years."""
    parts = []
    for r in index:
        if r["location"] == location and r["duration_h"] == duration and r["deg_cost_per_mwh"] == deg:
            d = json.loads((RESULTS_DIR / r["file"]).read_text())["daily"]
            parts.append(pd.DataFrame({"date": pd.to_datetime(d["date"]), "pf": d["revenue"], "da_rt": d.get("da_rt_revenue")}))
    df = pd.concat(parts, ignore_index=True).set_index("date").sort_index()
    df["da_rt"] = pd.to_numeric(df["da_rt"], errors="coerce")
    return df.dropna()


def matched_days(available: set[pd.Timestamp], end: pd.Timestamp) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """(before, after) day pairs one year apart, both available, after-day in [GO_LIVE, end]."""
    pairs = []
    for after in pd.date_range(GO_LIVE, end, freq="D"):
        before = after - pd.DateOffset(years=1)
        if before >= BEFORE_START and before in available and after in available:
            pairs.append((before, after))
    return pairs


def _price_stats(rt: pd.DataFrame, da: pd.DataFrame, days: list[pd.Timestamp]) -> dict:
    keep = {d.date() for d in days}
    rt = rt[rt["interval_start_local"].dt.date.isin(keep)].copy()
    da = da[da["interval_start_local"].dt.date.isin(keep)]
    rt["hour_utc"] = rt["interval_start_utc"].dt.floor("h")
    m = rt.merge(da[["interval_start_utc", "price"]].rename(columns={"interval_start_utc": "hour_utc", "price": "da"}), on="hour_utc")
    spread = m["price"] - m["da"]
    daily_std = rt.groupby(rt["interval_start_local"].dt.date)["price"].std()
    return {
        "rt_mean": round(float(rt["price"].mean()), 2),
        "da_mean": round(float(da["price"].mean()), 2),
        "rt_minus_da_mean": round(float(spread.mean()), 2),
        "rt_minus_da_mean_abs": round(float(spread.abs().mean()), 2),
        "rt_std": round(float(rt["price"].std()), 2),
        "rt_intraday_std_mean": round(float(daily_std.mean()), 2),
        "rt_intraday_std_median": round(float(daily_std.median()), 2),
        "rt_intervals_over_1000": int((rt["price"] > 1000).sum()),
        "rt_intervals_below_0": int((rt["price"] < 0).sum()),
    }


def _pct(new: float, old: float) -> float | None:
    return round(new / old - 1, 4) if old else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Before vs after RTC+B over matched windows.")
    parser.add_argument("--locations", nargs="*", help="default: every location in index.json")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    index = json.loads((RESULTS_DIR / "index.json").read_text())["runs"]
    if args.locations:
        index = [r for r in index if r["location"] in args.locations]
    end = pd.Timestamp(min(r["last_day"] for r in index if r["year"] == GO_LIVE.year + 1))
    # Stop a year after go-live so the before window never crosses Dec 5, 2025.
    end = min(end, GO_LIVE + pd.DateOffset(years=1) - pd.Timedelta(days=1))
    combos = sorted({(r["location"], r["duration_h"], r["deg_cost_per_mwh"]) for r in index})
    kw = 100.0 * 1000  # every run is 100 MW; checked below

    assert all(json.loads((RESULTS_DIR / r["file"]).read_text())["meta"]["power_mw"] == 100.0 for r in index[:3])

    out_locs: dict[str, dict] = defaultdict(lambda: {"runs": []})
    for location, duration, deg in combos:
        df = _daily_frame(index, location, duration, deg)
        pairs = matched_days(set(df.index), end)
        b = df.loc[[p[0] for p in pairs]]
        a = df.loc[[p[1] for p in pairs]]
        loc = out_locs[location]
        loc.setdefault("days", [])
        if not loc["days"] or len(pairs) < len(loc["days"]):
            loc["days"] = [p[1] for p in pairs]  # smallest matched set, used for price stats
        months = sorted({d.month for _, d in pairs}, key=lambda m: (m < 12, m))
        bm = b.groupby(b.index.month)
        am = a.groupby(a.index.month)
        run = {"duration_h": duration, "deg_cost_per_mwh": deg, "days": len(pairs)}
        for name, w in (("before", b), ("after", a)):
            pf, da = w["pf"].sum() / kw, w["da_rt"].sum() / kw
            run[name] = {
                "pf_revenue_per_kw": round(float(pf), 2),
                "da_rt_revenue_per_kw": round(float(da), 2),
                "value_of_perfect_foresight_per_kw": round(float(pf - da), 2),
                "capture_rate": round(float(da / pf), 4) if pf > 0 else None,
                "da_losing_days": int((w["da_rt"] < 0).sum()),
            }
        run["change"] = {
            "pf_revenue": _pct(run["after"]["pf_revenue_per_kw"], run["before"]["pf_revenue_per_kw"]),
            "da_rt_revenue": _pct(run["after"]["da_rt_revenue_per_kw"], run["before"]["da_rt_revenue_per_kw"]),
            "capture_rate_pts": round((run["after"]["capture_rate"] - run["before"]["capture_rate"]) * 100, 1),
        }
        run["monthly"] = {
            "months": months,
            "pf_before": [round(float(bm["pf"].sum().get(m, 0)) / kw, 3) for m in months],
            "pf_after": [round(float(am["pf"].sum().get(m, 0)) / kw, 3) for m in months],
            "da_rt_before": [round(float(bm["da_rt"].sum().get(m, 0)) / kw, 3) for m in months],
            "da_rt_after": [round(float(am["da_rt"].sum().get(m, 0)) / kw, 3) for m in months],
        }
        loc["runs"].append(run)

    for location, loc in out_locs.items():
        after_days = loc.pop("days")
        before_days = [d - pd.DateOffset(years=1) for d in after_days]
        rt = pd.concat([fetch(location, y) for y in (2024, 2025, 2026)], ignore_index=True)
        da = pd.concat([fetch(location, y, "DA") for y in (2024, 2025, 2026)], ignore_index=True)
        loc["location_type"] = "hub" if location.startswith("HB_") else "node"
        loc["prices"] = {"before": _price_stats(rt, da, before_days), "after": _price_stats(rt, da, after_days)}
        loc["matched_days"] = len(after_days)

    doc = {
        "meta": {
            "event": "RTC+B (real-time co-optimization plus batteries) went live in ERCOT on Dec 5, 2025",
            "before": {"start": BEFORE_START.date().isoformat(), "end": (end - pd.DateOffset(years=1)).date().isoformat()},
            "after": {"start": GO_LIVE.date().isoformat(), "end": end.date().isoformat()},
            "matching": "each after-day is paired with the same calendar day one year earlier; a pair is used only if both days have results",
            "revenue_units": "$ per kW over the matched days (not annualized)",
            "rt_minus_da": "each 15-min RT price minus the DA price of the hour that contains it",
            "rt_intraday_std": "standard deviation of the 15-min RT price within each day, averaged (or median) over days",
            "caveat": (
                "Before/after describes what changed, not why. Battery capacity kept growing, and load, gas prices, "
                "weather and transmission also changed between the windows. This model cannot isolate the effect of "
                "RTC+B from those, and it leaves out ancillary services, where RTC+B changes battery revenue most directly."
            ),
        },
        "locations": dict(sorted(out_locs.items())),
    }
    path = RESULTS_DIR / "rtcb.json"
    path.write_text(json.dumps(doc, indent=1))
    log.info("Wrote %s (%.0f KB)", path, path.stat().st_size / 1024)

    rows = []
    for location, loc in doc["locations"].items():
        for r in loc["runs"]:
            if r["duration_h"] == 2 and r["deg_cost_per_mwh"] == 10:
                rows.append({
                    "location": location, "days": r["days"],
                    "PF before": r["before"]["pf_revenue_per_kw"], "PF after": r["after"]["pf_revenue_per_kw"],
                    "DA before": r["before"]["da_rt_revenue_per_kw"], "DA after": r["after"]["da_rt_revenue_per_kw"],
                    "cap before": r["before"]["capture_rate"], "cap after": r["after"]["capture_rate"],
                    "|RT-DA| b": loc["prices"]["before"]["rt_minus_da_mean_abs"], "|RT-DA| a": loc["prices"]["after"]["rt_minus_da_mean_abs"],
                    "RT std b": loc["prices"]["before"]["rt_std"], "RT std a": loc["prices"]["after"]["rt_std"],
                })
    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
