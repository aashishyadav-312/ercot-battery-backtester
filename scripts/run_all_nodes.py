"""Run the daily battery LP at every ERCOT resource node for one configuration.

Phase 12. Prices come from the all-settlement-point monthly caches written by
data/fetch_all_nodes.py (one ERCOT file holds every point, so no per-node
requests). For each resource node with complete data for the year, this runs
the same code as the 10 detailed locations:

* model.run_year.run_year: perfect-foresight daily LP on RT 15-min prices
* model.forecast.run_da_schedule: schedule on DA hourly prices, settle at RT

and keeps only summary metrics, written to results/nodes_{year}_{hours}h.json:
$/kW-yr (perfect foresight and DA-scheduled), capture rate, top-10-day share,
cycles, average spread captured, correlation of 15-min RT prices with the
node's load-zone hub, and monthly revenue for the sparkline. The five hubs
are run through the same pipeline so node-vs-hub comparisons use identical data.

A node is "complete" when both runs solve every day of the year (no day with
more than model.run_year.MAX_GAP_INTERVALS missing RT intervals, no DA gaps).
Others are counted, with reasons, in the file's meta block.

Coordinates and load zones are merged from results/node_locations.json
(python -m scripts.build_locations --all-nodes) when it exists.

CLI:
    python -m scripts.run_all_nodes --year 2025 --hours 2 --rte 0.85 --deg-cost 10
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from data.fetch_all_nodes import fetch_year
from data.fetch_prices import _fill_gaps
from model.forecast import run_da_schedule, summarize_da
from model.metrics import summarize
from model.run_year import RESULTS_DIR, SOC0_FRAC, result_path, run_year
from scripts.rank_nodes import HUBS, ZONE_HUB

log = logging.getLogger(__name__)

POWER_MW = 100.0
NODE_TYPES = ("RN",)  # ERCOT settlement point type for resource nodes
LOCATIONS_FILE = RESULTS_DIR / "node_locations.json"


def nodes_path(year: int, hours: float):
    return RESULTS_DIR / f"nodes_{year}_{hours:g}h.json"


def _series(df: pd.DataFrame, market: str, year: int) -> pd.DataFrame:
    """One point's rows from the all-point cache, in the shape data.fetch_prices.fetch returns."""
    out = df[["interval_start_utc", "price"]].copy()
    out["location"] = str(df["location"].iloc[0])
    out["market"] = market
    out = out.sort_values("interval_start_utc").reset_index(drop=True)
    return _fill_gaps(out, market, year)


def run_point(job: tuple) -> dict:
    """Perfect-foresight and DA-scheduled runs for one settlement point; summary only."""
    code, rt_raw, da_raw, hub_rt, year, hours, rte, deg = job
    logging.getLogger("model").setLevel(logging.ERROR)  # per-day skip warnings are summarised below
    logging.getLogger("data").setLevel(logging.ERROR)
    rt = _series(rt_raw, "RT15", year)
    da = _series(da_raw, "DA", year)
    pf = run_year(code, year, POWER_MW, hours, rte, deg, prices=rt)
    m = summarize(pf)
    dar = run_da_schedule(rt, da, POWER_MW, hours, rte, deg, SOC0_FRAC, days=pf["daily"]["date"].tolist())
    scale = 365 / m["days_covered"] if m["annualized"] else 1.0
    d = summarize_da(pf["daily"][["date", "revenue"]], dar["daily"], POWER_MW, scale)

    corr = None
    if hub_rt is not None:
        both = rt[["interval_start_utc", "price"]].merge(hub_rt, on="interval_start_utc", suffixes=("", "_hub")).dropna()
        if len(both) > 100:
            corr = round(float(np.corrcoef(both["price"], both["price_hub"])[0, 1]), 3)

    da_month = dar["daily"].groupby(pd.to_datetime(dar["daily"]["date"]).dt.month)["da_rt_revenue"].sum() / (POWER_MW * 1000)
    return {
        "code": code,
        "days_solved": int(len(pf["daily"])),
        "skipped_pf": len(pf["skipped_days"]),
        "skipped_da": len(dar["skipped_days"]),
        "rev": m["revenue_per_kw_year"],
        "da_rev": d["da_rt_revenue_per_kw_year"],
        "capture": d["capture_rate"],
        "top10": m["top10_day_share"],
        "cycles": m["cycles_per_year"],
        "spread": m["avg_spread_captured"],
        "corr_hub": corr,
        "mean_price": round(float(rt["price"].mean()), 2),
        "monthly": [round(m["monthly_revenue_per_kw"].get(i, 0.0), 2) for i in range(1, 13)],
        "monthly_da": [round(float(da_month.get(i, 0.0)), 2) for i in range(1, 13)],
    }


PARITY_TOL = 0.02  # 2% of $/kW-yr


def check_parity(rows: list[dict], year: int, hours: float, rte: float, deg: float) -> list[dict]:
    """Compare against the detailed runs of the same configuration (results/{code}_...json).

    Hubs there come from ERCOT's annual archive (with later price corrections) and nodes from
    the per-node API, so small differences are expected; a large one means the bulk data or
    its timestamps are wrong, and the run stops.
    """
    out = []
    for r in rows:
        path = result_path(r["code"], year, hours, rte, deg)
        if not path.exists():
            continue
        m = json.loads(path.read_text())["metrics"]
        diff = (r["rev"] - m["revenue_per_kw_year"]) / m["revenue_per_kw_year"]
        out.append({"code": r["code"], "rev": r["rev"], "detailed_rev": m["revenue_per_kw_year"], "rel_diff": round(diff, 4),
                    "da_rev": r["da_rev"], "detailed_da_rev": m.get("da_rt_revenue_per_kw_year")})
        log.info("parity %-12s %7.2f vs detailed %7.2f (%+.2f%%)", r["code"], r["rev"], m["revenue_per_kw_year"], 100 * diff)
    bad = [p for p in out if abs(p["rel_diff"]) > PARITY_TOL]
    if bad:
        raise RuntimeError(f"All-node results disagree with the detailed runs by more than {PARITY_TOL:.0%}: {bad}")
    return out


def location_fields(code: str, locs: dict) -> dict:
    """Load zone, hub and map position for a node from results/node_locations.json.
    prec is "plant" (EIA plant coordinates) or "county" (GIS queue match, drawn at the county's Census point)."""
    loc = locs.get(code, {})
    zone = loc.get("load_zone")
    return {"lz": zone, "hub": ZONE_HUB.get(zone), "sub": loc.get("substation"), "lat": loc.get("lat"), "lon": loc.get("lon"),
            "geo": loc.get("method"), "prec": loc.get("precision"), "county": loc.get("county")}


def remerge(path) -> None:
    """Refresh only the location fields of an existing all-node file (after re-geocoding), without re-solving."""
    doc = json.loads(path.read_text())
    locs = _locations()
    fields = list(location_fields("", {}).keys())
    order = ["code", *fields]
    doc["nodes"] = [{**{k: n[k] for k in ("code",)}, **location_fields(n["code"], locs),
                     **{k: v for k, v in n.items() if k not in order}} for n in doc["nodes"]]
    doc["meta"]["n_nodes_geocoded"] = sum(n["lat"] is not None for n in doc["nodes"])
    doc["meta"]["n_nodes_county_level"] = sum(n["prec"] == "county" for n in doc["nodes"])
    path.write_text(json.dumps(doc, separators=(",", ":")))
    log.info("Re-merged locations into %s: %d placed (%d county-level)", path.name, doc["meta"]["n_nodes_geocoded"], doc["meta"]["n_nodes_county_level"])


def _locations() -> dict:
    if not LOCATIONS_FILE.exists():
        log.warning("%s not found; nodes will have no coordinates or load zone", LOCATIONS_FILE.name)
        return {}
    return {r["code"]: r for r in json.loads(LOCATIONS_FILE.read_text())["nodes"]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--hours", type=float, default=2.0)
    ap.add_argument("--rte", type=float, default=0.85)
    ap.add_argument("--deg-cost", type=float, default=10.0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, help="run only the first N nodes (for a quick test)")
    ap.add_argument("--remerge", action="store_true", help="only refresh coordinates from results/node_locations.json (no solving)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.remerge:
        remerge(nodes_path(args.year, args.hours))
        return
    t0 = time.monotonic()

    rt_all = fetch_year(args.year, "RT15")
    da_all = fetch_year(args.year, "DA")
    t_load = time.monotonic() - t0
    log.info("Loaded %d RT and %d DA rows in %.0fs", len(rt_all), len(da_all), t_load)

    types = rt_all.drop_duplicates("location").set_index("location")["location_type"].astype(str)
    nodes = sorted(c for c, t in types.items() if t in NODE_TYPES)
    n_rt_intervals = rt_all["interval_start_utc"].nunique()
    rt_by = {k: g for k, g in rt_all.groupby("location", observed=True)}
    da_by = {k: g for k, g in da_all.groupby("location", observed=True)}
    del rt_all, da_all

    locs = _locations()
    hub_rt = {h: _series(rt_by[h], "RT15", args.year)[["interval_start_utc", "price"]] for h in HUBS}

    excluded: dict[str, list[str]] = {"no_da_prices": [], "rt_coverage_below_99pct": [], "days_skipped": []}
    jobs = []
    for code in HUBS + nodes:
        rt = rt_by.get(code)
        if code not in da_by:
            excluded["no_da_prices"].append(code)
            continue
        # Cheap pre-filter: nodes that started or retired mid-year cannot be complete.
        if rt is None or rt["price"].notna().sum() < 0.99 * n_rt_intervals:
            excluded["rt_coverage_below_99pct"].append(code)
            continue
        hub = code if code in HUBS else ZONE_HUB.get((locs.get(code) or {}).get("load_zone"))
        jobs.append((code, rt, da_by[code], None if code in HUBS else hub_rt.get(hub), args.year, args.hours, args.rte, args.deg_cost))
    if args.limit:
        jobs = jobs[: len(HUBS) + args.limit]
    log.info("%d resource nodes in the RT data; running %d nodes + %d hubs on %d workers",
             len(nodes), len(jobs) - len(HUBS), len(HUBS), args.workers)

    t1 = time.monotonic()
    rows = []
    with ProcessPoolExecutor(args.workers) as pool:
        for i, r in enumerate(pool.map(run_point, jobs, chunksize=4), 1):
            rows.append(r)
            if i % 50 == 0:
                log.info("%d / %d done (%.0fs)", i, len(jobs), time.monotonic() - t1)
    t_solve = time.monotonic() - t1

    hubs_out, nodes_out = [], []
    for r in rows:
        complete = r["skipped_pf"] == 0 and r["skipped_da"] == 0
        if r["code"] in HUBS:
            hubs_out.append({k: v for k, v in r.items() if not k.startswith("skipped")})
            continue
        if not complete:
            excluded["days_skipped"].append(r["code"])
            continue
        nodes_out.append({"code": r["code"], **location_fields(r["code"], locs),
                          **{k: v for k, v in r.items() if k not in ("code", "skipped_pf", "skipped_da", "days_solved")}})
    nodes_out.sort(key=lambda r: -r["rev"])
    for i, r in enumerate(nodes_out, 1):
        r["rank"] = i

    parity = check_parity(hubs_out + nodes_out, args.year, args.hours, args.rte, args.deg_cost)

    revs = np.array([r["rev"] for r in nodes_out])
    meta = {
        "year": args.year,
        "duration_h": args.hours,
        "power_mw": POWER_MW,
        "rte": args.rte,
        "deg_cost_per_mwh": args.deg_cost,
        "method": "same daily LP as the detailed runs (model.run_year perfect foresight; model.forecast DA-schedule / RT-settle), "
        "summary metrics only",
        "price_source": "ERCOT public API archive: NP6-905-CD (RT 15-min SPP, one file per interval holding every settlement point) "
        "and NP4-190-CD (DA hourly SPP, one file per day)",
        "complete_rule": "both runs solve every day of the year (a day is skipped when more than 4 RT intervals are missing, "
        "or the DA day has a gap)",
        "n_nodes_in_data": len(nodes),
        "n_nodes": len(nodes_out),
        "n_nodes_geocoded": sum(r["lat"] is not None for r in nodes_out),
        "n_nodes_county_level": sum(r["prec"] == "county" for r in nodes_out),
        "excluded_counts": {k: len(v) for k, v in excluded.items()},
        "excluded": excluded,
        "quantiles_rev": {f"p{q}": round(float(np.percentile(revs, q)), 2) for q in (10, 25, 50, 75, 90)} if len(revs) else {},
        "fields": {
            "rev": "perfect-foresight revenue, $/kW-yr", "da_rev": "DA-scheduled, RT-settled revenue, $/kW-yr",
            "capture": "da_rev / rev on the same days", "top10": "share of PF revenue from the 10 best days",
            "cycles": "PF full cycles per year", "spread": "PF average discharge minus charge price, $/MWh",
            "corr_hub": "correlation of 15-min RT prices with the load-zone hub", "mean_price": "average RT price, $/MWh",
            "monthly": "PF revenue by month, $/kW", "monthly_da": "DA-scheduled revenue by month, $/kW",
            "lz": "ERCOT settlement load zone", "hub": "trading hub of that load zone", "sub": "substation",
            "geo": "how lat/lon were found (see results/geocoding_log_all_nodes.md)",
            "prec": "plant: EIA plant coordinates; county: county-level, drawn at the county's Census internal point",
            "county": "county for county-level placements",
        },
        "parity_with_detailed_runs": parity,
        "runtime_s": {"load_prices": round(t_load), "solve": round(t_solve), "total": round(time.monotonic() - t0)},
        "workers": args.workers,
    }
    path = nodes_path(args.year, args.hours)
    path.write_text(json.dumps({"meta": meta, "hubs": hubs_out, "nodes": nodes_out}, separators=(",", ":")))
    log.info("Wrote %s: %d nodes (%d geocoded), %.0f KB, solve %.0fs on %d workers",
             path.name, len(nodes_out), meta["n_nodes_geocoded"], path.stat().st_size / 1024, t_solve, args.workers)
    log.info("Excluded: %s", meta["excluded_counts"])


if __name__ == "__main__":
    main()
