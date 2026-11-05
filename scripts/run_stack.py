"""v4 revenue stack runs: energy + AS ($/kW-yr) for hubs and resource nodes.

Writes results/v4/stack/{year}_{dur}h_{mode}.json (schema in docs/PLAN_V4.md,
Shared contracts). Every (point, year, duration, mode) result is checkpointed in
data/raw/stack_ckpt/ first, so an interrupted run resumes where it stopped and
the output files are rebuilt from all checkpoints at the end of each run.

Tiers (docs/PLAN_V4.md, Step 1):
  1: the five hubs x 2023-2026 YTD x 1, 2, 4 h x foresight and realistic
  2: every resource node x 2025, 2026 YTD x 2, 4 h x realistic
  3: every resource node x 2025, 2026 YTD x the remaining combinations

Battery: 100 MW, round-trip efficiency 0.85, degradation 10 $/MWh discharged,
state of charge empty at every midnight (model/run_year.py defaults).

CLI:
    python -m scripts.run_stack --tier 1 --workers 4
    python -m scripts.run_stack --tier 2 --workers 4
    python -m scripts.run_stack --rebuild          # only rewrite output files from checkpoints
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from data.fetch_prices import RAW_DIR
from model.run_year import RESULTS_DIR
from model.stack import PRODUCTS, Battery, Options, load_rules
from model.stack_year import per_kw_year, run_point_year, valid_days

log = logging.getLogger(__name__)

OUT_DIR = RESULTS_DIR / "v4" / "stack"
CKPT_DIR = RAW_DIR / "stack_ckpt"
HUBS = ("HB_HOUSTON", "HB_NORTH", "HB_PAN", "HB_SOUTH", "HB_WEST")
POWER_MW, RTE, DEG = 100.0, 0.85, 10.0
MODES = ("foresight", "realistic")
TIERS = {
    1: {"points": "hubs", "years": (2023, 2024, 2025, 2026), "durs": (1, 2, 4), "modes": MODES},
    2: {"points": "nodes", "years": (2025, 2026), "durs": (2, 4), "modes": ("realistic",)},
    3: {"points": "nodes", "years": (2025, 2026), "durs": (1, 2, 4), "modes": MODES},
}


def out_path(year, dur, mode) -> Path:
    return OUT_DIR / f"{year}_{dur:g}h_{mode}.json"


def ckpt_path(code, year, dur, mode) -> Path:
    return CKPT_DIR / f"{year}_{dur:g}h_{mode}" / f"{code}.json"


def end_day(year: int) -> str:
    """Last day of the last complete month (Central time), so partial years cover whole months."""
    yesterday = pd.Timestamp.now(tz="US/Central").tz_localize(None).normalize() - pd.Timedelta(days=1)
    last = min(pd.Timestamp(year=year, month=12, day=31), yesterday)
    if last != last + pd.offsets.MonthEnd(0):
        last = last - pd.offsets.MonthEnd(1)
    return last.strftime("%Y-%m-%d")


def load_as(year):
    da = pd.read_parquet(RAW_DIR / f"ANCILLARY_DA_{year}.parquet")
    rt_path = RAW_DIR / f"ANCILLARY_RT_{year}.parquet"
    return da, (pd.read_parquet(rt_path) if rt_path.exists() else None)


def hub_prices(code, year):
    """Hub RT/DA prices: committed results/prices/*.ebp when present, else the archive cache (data.fetch_prices)."""
    ebp = RESULTS_DIR / "prices" / f"{code}_{year}.ebp"
    if ebp.exists():
        from data.price_files import read

        _, rt, da = read(ebp)
        return rt, da, "ERCOT annual archives NP6-785-ER (RT) and NP4-180-ER (DA), via results/prices"
    from data.fetch_prices import fetch

    return fetch(code, year, "RT15"), fetch(code, year, "DA"), "ERCOT annual archives NP6-785-ER (RT) and NP4-180-ER (DA)"


def system_days(as_da, year) -> int:
    """Days of the window with complete AS prices: the most any point can have."""
    days = as_da.assign(day=as_da["interval_start_utc"].dt.tz_convert("US/Central").dt.strftime("%Y-%m-%d"))
    days = days[(days["day"] >= f"{year}-01-01") & (days["day"] <= end_day(year))]
    others = ["REGUP", "REGDN", "RRS", "NSPIN"]
    return int(days.groupby("day")[others].apply(lambda g: g.notna().all().all()).sum())


def run_job(job) -> list[dict]:
    code, year, rt, da, configs, source, rules = job
    logging.getLogger("model").setLevel(logging.ERROR)
    as_da, as_rt = load_as(year)
    t0 = time.monotonic()
    days = valid_days(rt, da, as_da, end_day(year))
    days = [d for d in days if d.startswith(str(year))]
    out = []
    for dur, mode in configs:
        t = time.monotonic()
        r = run_point_year(rt, da, as_da, as_rt, days, dur, rules, mode,
                           battery=Battery(POWER_MW, POWER_MW * dur, RTE, DEG, 0.0),
                           options=Options(reg_deploy=rules["regulation_deployment_factor"]["value"],
                                           headroom=rules["headroom"]["value"]))
        vals, scale = per_kw_year(r["daily"], POWER_MW, year)
        rec = {"code": code, "year": year, "dur": dur, "mode": mode, "values": vals, "days": len(days),
               "scale": scale, "milp_days": int(r["daily"]["used_milp"].sum()),
               "rt_as_missing_days": r["rt_as_missing_days"], "source": source,
               "solve_s": round(time.monotonic() - t, 2)}
        p = ckpt_path(code, year, dur, mode)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(rec))
        out.append(rec)
    log.debug("%s %d done in %.1fs", code, year, time.monotonic() - t0)
    return out


def assumptions(rules) -> list[str]:
    reg = rules["regulation_deployment_factor"]
    return [
        f"Battery: {POWER_MW:g} MW, round-trip efficiency {RTE}, degradation {DEG:g} $/MWh discharged, empty at every midnight. "
        "Results in $/kW-yr; partial years are annualized as 365 / days covered.",
        "Price taker: the battery never moves prices. AS markets are thin, and as more batteries offer AS the clearing prices "
        "fall (saturation), so AS revenue is an upper bound on what a new battery could capture.",
        "AS revenue = award x clearing price (MCPC). No deployment energy except Regulation; no mileage, penalties, "
        "qualification or outages.",
        f"Regulation deployment factor {reg['value']} ({reg['status']}): {reg['note']}",
        "Headroom: discharge + up-products <= P, charge + Reg Down <= P, charge + discharge <= P. State of charge must back "
        "each award for its duration at both ends of every interval.",
        "Reserve durations (h) for Reg Up, Reg Down, RRS, ECRS, Non-Spin before RTC+B: "
        + ", ".join(f"{rules['products'][k]['duration_h']['pre_rtcb']['value']:g}" for k in PRODUCTS)
        + "; from RTC+B: " + ", ".join(f"{rules['products'][k]['duration_h']['post_rtcb']['value']:g}" for k in PRODUCTS)
        + ". Pre-RTC+B Regulation and RRS use a conservative one hour (ASSUMPTION). Sources in model/config/as_rules.json.",
        "ECRS earns nothing before its first DAM price (June 10, 2023).",
        "foresight: " + rules["price_basis"]["foresight"],
        "realistic: " + rules["price_basis"]["realistic"],
    ]


def rebuild(rules) -> list[Path]:
    """Write one output file per configuration from every checkpoint."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    for cdir in sorted(CKPT_DIR.glob("*h_*")):
        year_s, dur_s, mode = cdir.name.split("_")
        year, dur = int(year_s), float(dur_s.rstrip("h"))
        recs = [json.loads(p.read_text()) for p in sorted(cdir.glob("*.json"))]
        if not recs:
            continue
        as_da, _ = load_as(year)
        full = system_days(as_da, year)
        complete = [r for r in recs if r["days"] == full]
        excluded = sorted(r["code"] for r in recs if r["days"] != full)
        last = end_day(year)
        months = int(last[5:7])
        year_days = 366 if year % 4 == 0 else 365
        rtcb = rules["rtcb_go_live"]["date"]
        span = "post" if f"{year}-01-01" >= rtcb else "pre" if last < rtcb else "mixed"
        nodes = {r["code"]: r["values"] for r in sorted(complete, key=lambda r: (r["code"] not in HUBS, r["code"]))}
        rt_missing = sorted({d for r in complete for d in r["rt_as_missing_days"]})
        meta = {
            "year": year, "durationH": dur, "mode": mode, "products": list(PRODUCTS), "partialYear": full < year_days,
            "monthsCovered": months, "rtcb": span, "assumptions": assumptions(rules),
            "sources": {
                "rules": "model/config/as_rules.json",
                "as_dam": "https://www.ercot.com/mp/data-products/data-product-details?id=NP4-188-CD",
                "as_rt": "https://www.ercot.com/mp/data-products/data-product-details?id=NP6-796-ER",
                "energy_hubs": "ERCOT annual archives NP6-785-ER (RT) and NP4-180-ER (DA)",
                "energy_nodes": "ERCOT public API NP6-905-CD (RT 15-min) and NP4-190-CD (DA hourly), all settlement points",
                "rules_sources": sorted({v["source"] for k in PRODUCTS for v in rules["products"][k]["duration_h"].values()}),
            },
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "units": "$/kW-yr", "powerMw": POWER_MW, "rte": RTE, "degCostPerMwh": DEG,
            "firstDay": f"{year}-01-01", "lastDay": last, "daysCovered": full,
            "hubs": [h for h in HUBS if h in nodes], "nNodes": len(nodes),
            "excludedIncomplete": excluded,
            "rtAsPriceMissingDays": rt_missing if mode == "foresight" else [],
            "milpDays": {r["code"]: r["milp_days"] for r in complete if r["milp_days"]},
            "engine": "model/stack.py via model/stack_year.py",
        }
        path = out_path(year, dur, mode)
        path.write_text(json.dumps({"meta": meta, "nodes": nodes}, separators=(",", ":")))
        written.append(path)
        log.info("wrote %s: %d points (%d excluded as incomplete)", path.relative_to(RESULTS_DIR.parent), len(nodes), len(excluded))
    return written


def node_jobs(year, configs, rules, limit=None):
    from data.fetch_all_nodes import fetch_year
    from scripts.run_all_nodes import NODE_TYPES, _series

    rt_all = fetch_year(year, "RT15")
    da_all = fetch_year(year, "DA")
    types = rt_all.drop_duplicates("location").set_index("location")["location_type"].astype(str)
    nodes = sorted(c for c, t in types.items() if t in NODE_TYPES)
    n_rt = rt_all["interval_start_utc"].nunique()
    rt_by = {k: g for k, g in rt_all.groupby("location", observed=True)}
    da_by = {k: g for k, g in da_all.groupby("location", observed=True)}
    del rt_all, da_all
    jobs = []
    for code in nodes[:limit] if limit else nodes:
        todo = [(d, m) for d, m in configs if not ckpt_path(code, year, d, m).exists()]
        rt = rt_by.get(code)
        if not todo or code not in da_by or rt is None or rt["price"].notna().sum() < 0.99 * n_rt:
            continue
        cols = ["interval_start_utc", "price"]
        jobs.append((code, year, _series(rt, "RT15", year)[cols], _series(da_by[code], "DA", year)[cols], todo,
                     "ERCOT public API NP6-905-CD / NP4-190-CD", rules))
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--tier", type=int, choices=sorted(TIERS))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--years", type=int, nargs="*")
    ap.add_argument("--limit", type=int, help="first N nodes only (quick test)")
    ap.add_argument("--rebuild", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    rules = load_rules()
    if args.tier:
        tier = TIERS[args.tier]
        configs = [(d, m) for d in tier["durs"] for m in tier["modes"]]
        t0 = time.monotonic()
        done = 0
        for year in args.years or tier["years"]:
            if tier["points"] == "hubs":
                jobs = []
                for code in HUBS:
                    todo = [(d, m) for d, m in configs if not ckpt_path(code, year, d, m).exists()]
                    if todo:
                        rt, da, src = hub_prices(code, year)
                        jobs.append((code, year, rt, da, todo, src, rules))
            else:
                jobs = node_jobs(year, configs, rules, args.limit)
            log.info("tier %d, %d: %d points to run", args.tier, year, len(jobs))
            with ProcessPoolExecutor(args.workers) as pool:
                for i, recs in enumerate(pool.map(run_job, jobs, chunksize=1), 1):
                    done += len(recs)
                    if i % 25 == 0 or i == len(jobs):
                        log.info("%d: %d / %d points (%.0fs)", year, i, len(jobs), time.monotonic() - t0)
        log.info("tier %d: %d results in %.0fs", args.tier, done, time.monotonic() - t0)
    rebuild(rules)


if __name__ == "__main__":
    main()
