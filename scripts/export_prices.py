"""Publish per-location-year price files for the in-browser custom run (Phase 15).

Writes results/prices/{location}_{year}.ebp (format: data/price_files.py) for
the 10 detailed locations and every year, plus results/prices/index.json listing
each file, its date span and size. Prices come from data.fetch_prices.fetch, so
these are the same series the precomputed results were built from: hubs from
ERCOT's annual archives, resource nodes from the ERCOT public API.

CLI:
    python -m scripts.export_prices                 # all detailed locations and years
    python -m scripts.export_prices --years 2026    # refresh one year
"""

from __future__ import annotations

import argparse
import json
import logging

from data import price_files
from data.fetch_prices import fetch, is_hub_or_zone
from model.run_year import RESULTS_DIR

log = logging.getLogger(__name__)

PRICES_DIR = RESULTS_DIR / "prices"
LOCATIONS = [
    "HB_HOUSTON",
    "HB_NORTH",
    "HB_SOUTH",
    "HB_WEST",
    "HB_PAN",
    "RUSSEKST_RN",
    "CAMWIND_RN",
    "ANSON1_ALL",
    "WIPOPA_3_4",
    "RHESS2_ESS1",
]
YEARS = [2024, 2025, 2026]


def sources(location: str) -> dict:
    if is_hub_or_zone(location):
        return {"rt": "ERCOT annual archive NP6-785-ER", "da": "ERCOT annual archive NP4-180-ER"}
    return {"rt": "ERCOT public API NP6-905-CD", "da": "ERCOT public API NP4-190-CD"}


def export(location: str, year: int) -> dict:
    rt, da = fetch(location, year, "RT15"), fetch(location, year, "DA")
    name = f"{location}_{year}.ebp"
    size = price_files.write(PRICES_DIR / name, location, year, rt, da, sources(location))
    day = lambda df, i: df["interval_start_local"].iloc[i].strftime("%Y-%m-%d")  # noqa: E731
    return {
        "location": location,
        "year": year,
        "file": name,
        "bytes": size,
        "rt_first_day": day(rt, 0),
        "rt_last_day": day(rt, -1),
        "da_first_day": day(da, 0),
        "da_last_day": day(da, -1),
        "rt_missing": int(rt["price"].isna().sum()),
        "da_missing": int(da["price"].isna().sum()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--locations", nargs="+", default=LOCATIONS)
    parser.add_argument("--years", nargs="+", type=int, default=YEARS)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    index_path = PRICES_DIR / "index.json"
    files = {}
    if index_path.exists():
        files = {(f["location"], f["year"]): f for f in json.loads(index_path.read_text())["files"]}
    for location in args.locations:
        for year in args.years:
            f = export(location, year)
            files[(location, year)] = f
            print(f"{f['file']:<24} {f['bytes'] / 1024:7.1f} KB  RT {f['rt_first_day']}..{f['rt_last_day']}")
    rows = [files[k] for k in sorted(files, key=lambda k: (LOCATIONS.index(k[0]) if k[0] in LOCATIONS else 99, k))]
    total = sum(f["bytes"] for f in rows)
    index_path.write_text(
        json.dumps(
            {
                "format": "EBP1 (see data/price_files.py)",
                "description": "RT 15-min and DA hourly settlement point prices per location-year for the custom run",
                "total_bytes": total,
                "files": rows,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"{len(rows)} files, {total / 1024 / 1024:.2f} MB total")


if __name__ == "__main__":
    main()
