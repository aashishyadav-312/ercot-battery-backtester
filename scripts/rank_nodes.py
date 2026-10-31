"""Rank ERCOT resource nodes by real-time price volatility in one sample month.

Pulls RT 15-min prices for every resource node (settlement point type RN) for
one month via the ERCOT public API, ranks nodes by price standard deviation,
and picks the N most volatile plus M "typical" nodes (closest to the median
standard deviation). For each pick it reports the settlement load zone (from
ERCOT's settlement-point mapping) and the trading hub whose prices it tracks
most closely that month (highest correlation), i.e. the hub it "sits near".

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


def rank(sample: pd.DataFrame, min_coverage: float = 0.98) -> pd.DataFrame:
    """Per-node price stats, most volatile first. Drops nodes with patchy data."""
    n_intervals = sample["interval_start_utc"].nunique()
    stats = sample.groupby("location")["price"].agg(["std", "mean", "min", "max", "count"])
    stats = stats[stats["count"] >= min_coverage * n_intervals]
    return stats.sort_values("std", ascending=False)


def pick(stats: pd.DataFrame, n_high: int = 3, n_typical: int = 2) -> pd.DataFrame:
    high = stats.head(n_high).assign(group="high")
    median = stats["std"].median()
    rest = stats.drop(high.index)
    typical = rest.iloc[(rest["std"] - median).abs().argsort()[:n_typical]].assign(group="typical")
    return pd.concat([high, typical])


def nearest_hub(sample: pd.DataFrame, hubs: pd.DataFrame, nodes: list[str]) -> pd.DataFrame:
    wide = pd.concat([sample[sample["location"].isin(nodes)], hubs]).pivot(
        index="interval_start_utc", columns="location", values="price"
    )
    corr = wide.corr().loc[nodes, HUBS]
    return pd.DataFrame({"nearest_hub": corr.idxmax(axis=1), "hub_corr": corr.max(axis=1).round(3)})


def load_zones(nodes: list[str]) -> pd.Series:
    from gridstatus import Ercot

    m = Ercot().get_settlement_points_electrical_bus_mapping("latest")
    m = m.dropna(subset=["Resource Node"]).drop_duplicates("Resource Node")
    return m.set_index("Resource Node").reindex(nodes)["Settlement Load Zone"].rename("load_zone")


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
    picks = pick(stats, args.high, args.typical)
    nodes = picks.index.tolist()

    api = _api_client()
    first = pd.Timestamp(year=args.year, month=args.month, day=1)
    last = first + pd.offsets.MonthEnd(0)
    hubs = pd.concat(
        _hit_api(api, "RT15", f"{first:%Y-%m-%d}", f"{last:%Y-%m-%d}", settlementPoint=h) for h in HUBS
    )
    hub_std = hubs.groupby("location")["price"].std()
    out = picks.join(nearest_hub(sample, hubs, nodes)).join(load_zones(nodes))
    out["rank"] = [int(stats.index.get_loc(n)) + 1 for n in nodes]

    print(f"{len(stats)} resource nodes with full data, {first:%B %Y}. "
          f"Median std ${stats['std'].median():.1f}/MWh.")
    print("Hub std: " + ", ".join(f"{h} {hub_std[h]:.1f}" for h in HUBS))
    print(out.round(2).to_string())

    payload = {
        "sample_month": f"{first:%Y-%m}",
        "n_nodes_ranked": len(stats),
        "median_std": round(float(stats["std"].median()), 2),
        "hub_std": {h: round(float(hub_std[h]), 2) for h in HUBS},
        "nodes": [
            {"location": n, **{k: (round(v, 3) if isinstance(v, float) else v) for k, v in row.items()}}
            for n, row in out.drop(columns="count").iterrows()
        ],
    }
    (RESULTS_DIR / "node_selection.json").write_text(json.dumps(payload, indent=1, default=str))


if __name__ == "__main__":
    main()
