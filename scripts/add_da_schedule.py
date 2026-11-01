"""Add DA-schedule / RT-settle fields to every run already in results/index.json.

Perfect-foresight results are left exactly as they are. For each run this
fetches (or reads from cache) the location's DA hourly and RT 15-min prices,
solves each day the perfect-foresight run solved on DA prices, settles that
schedule at RT, and writes the new fields into the run's JSON and index.json
(see model/forecast.py and model/run_year.add_da_schedule).

As a guard against the cached RT prices differing from the ones the stored
results were computed on, a few days per location-year are re-solved with
perfect foresight and must match the stored daily revenue.

CLI:
    python -m scripts.add_da_schedule              # every run in index.json
    python -m scripts.add_da_schedule --locations HB_HOUSTON --years 2025
"""

from __future__ import annotations

import argparse
import json
import logging
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from data.fetch_prices import fetch
from model.dispatch import optimize_day
from model.forecast import run_da_schedule
from model.run_year import DA_INDEX_FIELDS, RESULTS_DIR, SOC0_FRAC, add_da_schedule

log = logging.getLogger(__name__)
CHECK_DAYS = 4


def _check_pf(doc: dict, rt: pd.DataFrame) -> float:
    """Re-solve a few stored days with perfect foresight; return the worst $ difference."""
    m = doc["meta"]
    dates = doc["daily"]["date"]
    rng = np.random.default_rng(0)
    picks = rng.choice(len(dates), size=min(CHECK_DAYS, len(dates)), replace=False)
    day = rt["interval_start_local"].dt.tz_localize(None).dt.normalize().dt.date.astype(str)
    worst = 0.0
    for i in picks:
        p = rt.loc[day == dates[i], "price"].ffill().bfill().to_numpy()
        r = optimize_day(p, 0.25, m["power_mw"], m["energy_mwh"], m["rte"], m["deg_cost_per_mwh"], SOC0_FRAC)
        worst = max(worst, abs(r["revenue"] - doc["daily"]["revenue"][i]))
    return worst


def _process(row: dict) -> dict:
    path = RESULTS_DIR / row["file"]
    doc = json.loads(path.read_text())
    m = doc["meta"]
    rt, da_prices = fetch(m["location"], m["year"]), fetch(m["location"], m["year"], "DA")
    worst = _check_pf(doc, rt)
    # Stored daily revenue is rounded to cents; the LP re-solve should land within a few dollars.
    tol = max(5.0, 1e-3 * max(abs(v) for v in doc["daily"]["revenue"]))
    if worst > tol:
        raise RuntimeError(f"{row['file']}: cached RT prices don't reproduce stored results (off by ${worst:,.0f})")
    da = run_da_schedule(
        rt, da_prices, m["power_mw"], m["duration_h"], m["rte"], m["deg_cost_per_mwh"], SOC0_FRAC, days=doc["daily"]["date"]
    )
    add_da_schedule(doc, da)
    path.write_text(json.dumps(doc, separators=(",", ":")))
    return {**row, **{k: doc["metrics"][k] for k in DA_INDEX_FIELDS}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--locations", nargs="*")
    parser.add_argument("--years", type=int, nargs="*")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    index_path = RESULTS_DIR / "index.json"
    runs = json.loads(index_path.read_text())["runs"]
    todo = [
        r for r in runs
        if (not args.locations or r["location"] in args.locations) and (not args.years or r["year"] in args.years)
    ]
    # Fetch sequentially so workers only read the parquet cache.
    for loc, year in sorted({(r["location"], r["year"]) for r in todo}):
        fetch(loc, year)
        fetch(loc, year, "DA")

    with ProcessPoolExecutor(args.workers) as pool:
        done = {r["file"]: r for r in pool.map(_process, todo)}
    runs = [done.get(r["file"], r) for r in runs]
    index_path.write_text(json.dumps({"runs": runs}, indent=1))

    rows = pd.DataFrame(done.values())
    rows = rows[rows["deg_cost_per_mwh"] == 10]
    print(
        rows.pivot_table(index="location", columns=["year", "duration_h"], values="capture_rate")
        .round(2)
        .to_string()
    )


if __name__ == "__main__":
    main()
