"""Rank ERCOT resource nodes by real-time price volatility in one sample month.

Pulls RT 15-min prices for every resource node (settlement point type RN) for
one month via the ERCOT public API, ranks nodes by price standard deviation,
and picks the N most volatile plus M "typical" nodes (closest to the median
standard deviation). Neighbouring nodes in one congestion pocket move
together, so a candidate whose prices correlate above 0.95 with a node already
picked is skipped; otherwise the "top 3" can be one pocket three times.

For each pick it reports the settlement load zone and substation (from ERCOT's
settlement-point mapping) and the trading hub of that load zone, which is the
hub it "sits near". The best-correlated hub in the sample month is reported
too; volatile nodes often track no hub closely.

Writes results/node_selection.json.

CLI:
    python -m scripts.rank_nodes --year 2025 --month 8
"""

from __future__ import annotations

import argparse
import json
import logging

import pandas as pd

from data.fetch_prices import _api_client, _hit_api, fetch_node_sample
from model.run_year import RESULTS_DIR

log = logging.getLogger(__name__)

HUBS = ["HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST", "HB_PAN"]

# Trading hub for each settlement load zone. The NOIE zones (Austin Energy,
# CPS, LCRA, Rayburn) sit inside the South and North hub areas.
ZONE_HUB = {
    "LZ_HOUSTON": "HB_HOUSTON", "LZ_NORTH": "HB_NORTH", "LZ_SOUTH": "HB_SOUTH", "LZ_WEST": "HB_WEST",
    "LZ_AEN": "HB_SOUTH", "LZ_CPS": "HB_SOUTH", "LZ_LCRA": "HB_SOUTH", "LZ_RAYBN": "HB_NORTH",
}


def rank(sample: pd.DataFrame, min_coverage: float = 0.98) -> pd.DataFrame:
    """Per-node price stats, most volatile first. Drops nodes with patchy data."""
    n_intervals = sample["interval_start_utc"].nunique()
    stats = sample.groupby("location")["price"].agg(["std", "mean", "min", "max", "count"])
    stats = stats[stats["count"] >= min_coverage * n_intervals]
    return stats.sort_values("std", ascending=False)


def pick(
    stats: pd.DataFrame,
    sample: pd.DataFrame | None = None,
    n_high: int = 3,
    n_typical: int = 2,
    max_corr: float = 0.95,
) -> pd.DataFrame:
    """Most volatile nodes plus nodes nearest the median std, skipping near-duplicates."""
    wide = None
    if sample is not None:
        wide = sample.pivot(index="interval_start_utc", columns="location", values="price")
    chosen: list[str] = []

    def take(candidates, n):
        out = []
        for node in candidates:
            if len(out) == n:
                break
            if wide is not None and chosen and wide[chosen].corrwith(wide[node]).max() > max_corr:
                continue
            out.append(node)
            chosen.append(node)
        return out

    high = take(stats.index, n_high)
    rest = stats.drop(high)
    typical = take(rest.index[(rest["std"] - stats["std"].median()).abs().argsort()], n_typical)
    return pd.concat([stats.loc[high].assign(group="high"), stats.loc[typical].assign(group="typical")])


def hub_correlations(sample: pd.DataFrame, hubs: pd.DataFrame, nodes: list[str]) -> pd.DataFrame:
    wide = pd.concat([sample[sample["location"].isin(nodes)], hubs]).pivot(
        index="interval_start_utc", columns="location", values="price"
    )
    corr = wide.corr().loc[nodes, HUBS]
    return pd.DataFrame({"best_corr_hub": corr.idxmax(axis=1), "best_hub_corr": corr.max(axis=1).round(3)})


def load_zones(nodes: list[str]) -> pd.DataFrame:
    from gridstatus import Ercot

    m = Ercot().get_settlement_points_electrical_bus_mapping("latest")
    m = m.dropna(subset=["Resource Node"]).drop_duplicates("Resource Node").set_index("Resource Node").reindex(nodes)
    return pd.DataFrame({"load_zone": m["Settlement Load Zone"], "substation": m["Substation"]})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--month", type=int, default=8)
    parser.add_argument("--high", type=int, default=3)
    parser.add_argument("--typical", type=int, default=2)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    sample = fetch_node_sample(args.year, args.month)
    stats = rank(sample)
    picks = pick(stats, sample, args.high, args.typical)
    nodes = picks.index.tolist()

    api = _api_client()
    first = pd.Timestamp(year=args.year, month=args.month, day=1)
    last = first + pd.offsets.MonthEnd(0)
    hubs = pd.concat(
        _hit_api(api, "RT15", f"{first:%Y-%m-%d}", f"{last:%Y-%m-%d}", settlementPoint=h) for h in HUBS
    )
    hub_std = hubs.groupby("location")["price"].std()
    out = picks.drop(columns="count").join(load_zones(nodes)).join(hub_correlations(sample, hubs, nodes))
    out["nearest_hub"] = out["load_zone"].map(ZONE_HUB)
    out["rank"] = [int(stats.index.get_loc(n)) + 1 for n in nodes]

    print(f"{len(stats)} resource nodes with full data, {first:%B %Y}. Median std ${stats['std'].median():.1f}/MWh.")
    print("Hub std: " + ", ".join(f"{h} {hub_std[h]:.1f}" for h in HUBS))
    print(out.round(2).to_string())

    payload = {
        "sample_month": f"{first:%Y-%m}",
        "method": "rank by RT 15-min price std; skip nodes with >0.95 price correlation to an earlier pick",
        "n_nodes_ranked": len(stats),
        "median_std": round(float(stats["std"].median()), 2),
        "hub_std": {h: round(float(hub_std[h]), 2) for h in HUBS},
        "nodes": [
            {"location": n, **{k: (round(v, 3) if isinstance(v, float) else v) for k, v in row.items()}}
            for n, row in out.iterrows()
        ],
    }
    (RESULTS_DIR / "node_selection.json").write_text(json.dumps(payload, indent=1, default=str))


if __name__ == "__main__":
    main()
