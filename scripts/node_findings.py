"""Print the tables behind FINDINGS section 9 (all-node coverage) from results/nodes_{year}_{hours}h.json.

CLI:
    python -m scripts.node_findings --year 2025 --hours 2
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from model.run_year import RESULTS_DIR


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--hours", type=float, default=2.0)
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()
    doc = json.loads((RESULTS_DIR / f"nodes_{args.year}_{args.hours:g}h.json").read_text())
    meta = doc["meta"]
    hubs = pd.DataFrame(doc["hubs"]).set_index("code")
    nodes = pd.DataFrame(doc["nodes"])
    nodes["hub_rev"] = nodes["hub"].map(hubs["rev"])
    nodes["ratio"] = nodes["rev"] / nodes["hub_rev"]

    print(f"Nodes: {meta['n_nodes']} complete of {meta['n_nodes_in_data']} in data; excluded {meta['excluded_counts']}")
    print(f"Geocoded: {meta['n_nodes_geocoded']} ({meta['n_nodes_geocoded'] / meta['n_nodes']:.0%})")
    print(f"Runtime: {meta['runtime_s']} on {meta['workers']} workers\n")

    print("Hubs, same pipeline:")
    print(hubs[["rev", "da_rev", "capture", "top10", "cycles", "spread"]].to_string(), "\n")

    q = [0, 10, 25, 50, 75, 90, 99, 100]
    print("Distribution of node $/kW-yr (perfect foresight):")
    print("  " + ", ".join(f"p{p} {np.percentile(nodes['rev'], p):.1f}" for p in q))
    print("Distribution of node / own-hub ratio:")
    r = nodes["ratio"].dropna()
    print("  " + ", ".join(f"p{p} {np.percentile(r, p):.2f}" for p in q))
    for lo, hi in [(0, 0.9), (0.9, 1.1), (1.1, 1.5), (1.5, 2), (2, 3), (3, 1e9)]:
        n = int(((r >= lo) & (r < hi)).sum())
        print(f"  {lo:g}–{hi:g}x: {n} ({n / len(r):.0%})")
    print(f"  ratio unknown (no load zone): {nodes['ratio'].isna().sum()}")
    print(f"  median capture rate: {nodes['capture'].median():.2f} (hubs {hubs['capture'].min():.2f}–{hubs['capture'].max():.2f})")
    print(f"  median DA-scheduled $/kW-yr: {nodes['da_rev'].median():.1f}")
    print(f"  corr with hub vs ratio (Spearman): {nodes[['corr_hub', 'ratio']].corr('spearman').iloc[0, 1]:.2f}\n")

    print("By load zone:")
    z = nodes.groupby("lz").agg(n=("code", "size"), median_rev=("rev", "median"), p90_rev=("rev", lambda s: s.quantile(0.9)),
                                median_ratio=("ratio", "median"))
    top = nodes.head(args.top)
    z["in_top"] = top.groupby("lz").size()
    z["in_top"] = z["in_top"].fillna(0).astype(int)
    print(z.round(2).sort_values("n", ascending=False).to_string(), "\n")

    print(f"Top {args.top}:")
    cols = ["rank", "code", "lz", "sub", "rev", "hub", "ratio", "da_rev", "capture", "top10", "corr_hub", "mean_price"]
    print(top[cols].round(2).to_string(index=False))


if __name__ == "__main__":
    main()
