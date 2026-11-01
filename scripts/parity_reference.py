"""Python reference numbers for the browser parity test (Phase 15).

Reads the published price files (results/prices/*.ebp, the same bytes the
browser loads), runs the Python model on them and writes
results/parity/reference.json. web/src/custom/parity.test.ts runs the
highs-js port on the same files and checks it lands within 0.5%.

It also records how far the Python run on these files is from the committed
results JSON for each run (the parity test requires that within 0.5% too), so
passing parity means the browser matches the numbers on the site, not just a
re-run.

Covered: three full-year runs (a hub with both DST days, the hub-year with the
most MILP-fallback days, and a resource node), plus single days: a day that
triggers the MILP fallback and both 2025 DST days (92 and 100 intervals).

CLI:
    python -m scripts.parity_reference
"""

from __future__ import annotations

import json

import numpy as np

from data import price_files
from model.forecast import run_da_schedule
from model.run_year import RESULTS_DIR, SOC0_FRAC, add_da_schedule, result_path, run_year, to_json
from scripts.export_prices import PRICES_DIR

OUT = RESULTS_DIR / "parity" / "reference.json"
POWER_MW = 100.0
RTE = 0.85
RUNS = [
    {"location": "HB_HOUSTON", "year": 2025, "hours": 2.0, "deg": 10.0},
    {"location": "HB_PAN", "year": 2024, "hours": 1.0, "deg": 0.0},
    {"location": "RUSSEKST_RN", "year": 2025, "hours": 4.0, "deg": 10.0},
]
# (run index, date, why). The MILP day is filled in from run 1's results.
DAYS = [(0, "2025-03-09", "DST spring forward (92 intervals)"), (0, "2025-11-02", "DST fall back (100 intervals)")]
METRICS = [
    "revenue_per_kw_year",
    "total_revenue",
    "top10_day_share",
    "cycles_per_year",
    "avg_charge_price",
    "avg_discharge_price",
    "avg_spread_captured",
    "milp_days",
    "da_rt_revenue_per_kw_year",
    "da_da_revenue_per_kw_year",
    "value_of_perfect_foresight_per_kw_year",
    "capture_rate",
    "da_days_matched",
    "da_cycles_per_year",
]


def _rel(a, b) -> float:
    if a is None or b is None:
        return float("inf") if a != b else 0.0
    return abs(a - b) / max(abs(b), 1e-9)


def run_one(spec: dict) -> tuple[dict, dict, dict]:
    path = PRICES_DIR / f"{spec['location']}_{spec['year']}.ebp"
    _, rt, da = price_files.read(path)
    result = run_year(spec["location"], spec["year"], POWER_MW, spec["hours"], RTE, spec["deg"], prices=rt)
    days = result["daily"]["date"].tolist()
    da_run = run_da_schedule(rt, da, POWER_MW, spec["hours"], RTE, spec["deg"], SOC0_FRAC, days=days)
    doc = add_da_schedule(to_json(result), da_run, result["daily"][["date", "revenue"]])
    return result, da_run, doc


def main() -> None:
    runs, days = [], []
    for i, spec in enumerate(RUNS):
        result, da_run, doc = run_one(spec)
        m = doc["metrics"]
        published = json.loads(
            result_path(spec["location"], spec["year"], spec["hours"], RTE, spec["deg"]).read_text()
        )["metrics"]
        # Not bit-for-bit: MILP days stop at a 0.01% gap or a 10 s wall-clock limit, and tied optima
        # can settle differently at DA prices, so small drifts from the committed run are expected.
        diffs = {
            k: {"here": m[k], "published": published.get(k), "rel": _rel(m[k], published.get(k))}
            for k in METRICS
            if m[k] != published.get(k)
        }
        worst = max((d["rel"] for d in diffs.values()), default=0.0)
        runs.append(
            {
                **spec,
                "power_mw": POWER_MW,
                "rte": RTE,
                "start_date": f"{spec['year']}-01-01",
                "end_date": f"{spec['year']}-12-31",
                "days_solved": doc["meta"]["days_solved"],
                "skipped_days": doc["meta"]["skipped_days"],
                "metrics": {k: m[k] for k in METRICS},
                "max_rel_difference_from_published": worst,
                "differences_from_published": diffs,
            }
        )
        print(f"{spec}: $/kW-yr {m['revenue_per_kw_year']}, DA-scheduled {m['da_rt_revenue_per_kw_year']}, "
              f"MILP days {m['milp_days']}, max difference from published {worst:.4%} {diffs or ''}")

        daily = result["daily"].set_index("date")
        da_daily = da_run["daily"].set_index("date")
        wanted = [(d, why) for r, d, why in DAYS if r == i]
        if i == 1:
            milp = daily[daily["used_milp"]]
            # The MILP day with the most revenue at stake: largest |revenue| among fallback days.
            d = milp["revenue"].abs().idxmax()
            wanted.append((d, "MILP fallback (LP charged and discharged at once)"))
        sched = result["schedule"]
        local_day = sched["interval_start_local"].dt.tz_localize(None).dt.normalize().dt.date.astype(str)
        for d, why in wanted:
            row = daily.loc[d]
            days.append(
                {
                    "run": i,
                    "date": d,
                    "why": why,
                    "intervals": int((local_day == d).sum()),
                    "revenue": float(row["revenue"]),
                    "cycles": float(row["cycles"]),
                    "used_milp": bool(row["used_milp"]),
                    "da_rt_revenue": float(da_daily.loc[d, "da_rt_revenue"]) if d in da_daily.index else None,
                    "da_da_revenue": float(da_daily.loc[d, "da_da_revenue"]) if d in da_daily.index else None,
                    "net_mw": np.round(sched.loc[local_day == d, "net_mw"].to_numpy(), 6).tolist(),
                }
            )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "description": "Python model results on results/prices/*.ebp; web/src/custom/parity.test.ts must match within 0.5%",
                "tolerance_rel": 0.005,
                "runs": runs,
                "days": days,
            },
            indent=1,
        )
        + "\n"
    )
    for d in days:
        print(f"day {d['date']} ({d['why']}): {d['intervals']} intervals, revenue {d['revenue']:.2f}, "
              f"MILP {d['used_milp']}, DA-scheduled {d['da_rt_revenue']}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
