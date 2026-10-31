"""Run every location x duration x year x degradation combination.

Writes one results/{location}_{year}_{hours}h_{rte}_{deg}.json per run and a
results/index.json listing every run with its headline metrics, which the web
app reads to populate its selectors.

CLI:
    python -m scripts.run_grid                       # default hubs, all years
    python -m scripts.run_grid --nodes NODE_A NODE_B # add resource nodes (needs ERCOT API env vars)
"""

from __future__ import annotations

import argparse
import json
import logging
from concurrent.futures import ProcessPoolExecutor
from itertools import product

from data.fetch_prices import ErcotBlockedError, fetch
from model.metrics import summarize
from model.run_year import RESULTS_DIR, run_year, save

log = logging.getLogger(__name__)

HUBS = ["HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST", "HB_PAN"]
YEARS = [2024, 2025, 2026]
HOURS = [1.0, 2.0, 4.0]
DEG_COSTS = [0.0, 10.0]
RTE = 0.85
POWER_MW = 100.0


def _run(job: tuple) -> dict:
    location, year, hours, deg = job
    result = run_year(location, year, POWER_MW, hours, RTE, deg, prices=fetch(location, year))
    path = save(result)
    m = summarize(result)
    return {
        "location": location,
        "location_type": "hub" if location.startswith("HB_") else "node",
        "year": year,
        "duration_h": hours,
        "rte": RTE,
        "deg_cost_per_mwh": deg,
        "file": path.name,
        "first_day": result["daily"]["date"].iloc[0],
        "last_day": result["daily"]["date"].iloc[-1],
        **{
            k: m[k]
            for k in (
                "revenue_per_kw_year",
                "annualized",
                "days_covered",
                "top10_day_share",
                "cycles_per_year",
                "avg_spread_captured",
            )
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch-run the backtester grid.")
    parser.add_argument("--hubs", nargs="*", default=HUBS)
    parser.add_argument("--nodes", nargs="*", default=[])
    parser.add_argument("--years", type=int, nargs="*", default=YEARS)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    # Fetch sequentially first so workers only read the parquet cache and
    # ERCOT isn't hit with parallel downloads.
    locations = []
    for loc in args.hubs + args.nodes:
        try:
            for year in args.years:
                fetch(loc, year)
            locations.append(loc)
        except ErcotBlockedError:
            raise  # a blocked runner won't recover; fail the whole run with the clear message
        except Exception as err:  # noqa: BLE001 - report and keep going
            log.error("Skipping %s: %s", loc, err)

    jobs = list(product(locations, args.years, HOURS, DEG_COSTS))
    log.info("Running %d combinations on %d workers", len(jobs), args.workers)
    with ProcessPoolExecutor(args.workers) as pool:
        rows = list(pool.map(_run, jobs))

    index = RESULTS_DIR / "index.json"
    existing = json.loads(index.read_text())["runs"] if index.exists() else []
    keep = {r["file"]: r for r in existing}
    keep.update({r["file"]: r for r in rows})
    runs = sorted(keep.values(), key=lambda r: (r["location"], r["year"], r["duration_h"], r["deg_cost_per_mwh"]))
    index.write_text(json.dumps({"runs": runs}, indent=1))
    log.info("Wrote %d runs to %s", len(runs), index)


if __name__ == "__main__":
    main()
