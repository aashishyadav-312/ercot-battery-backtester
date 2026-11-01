"""Print the tables behind FINDINGS section 9 (all-node coverage) from results/nodes_{year}_{hours}h.json.

CLI:
    python -m scripts.node_findings --year 2025 --hours 2
"""

from __future__ import annotations

import argparse
import json
import logging

import numpy as np
import pandas as pd

from model.run_year import RESULTS_DIR


def main() -> None:
    logging.disable(logging.WARNING)  # per-day skip warnings from the partial-year reruns
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

    prev_path = RESULTS_DIR / f"nodes_{args.year - 1}_{args.hours:g}h.json"
    if prev_path.exists():
        print(f"\nTop {args.top} in {args.year - 1} (same configuration and bulk source, ratio vs the {args.year - 1} bulk hub):")
        print(persistence(top, json.loads(prev_path.read_text()), args.year).to_string(index=False))


PREMIUM = 1.5  # node earns at least 1.5x its own hub ("premium", as in the section 9 tail)
WEAK = 1.25  # 1.25-1.5x: a smaller premium; below this the premium is absent that year


def _partial(code: str, hub: str, year: int) -> tuple[float, float, int] | None:
    """Node and hub $/kW over the node's solved days in a year it only partly covers (bulk cache needed)."""
    from data.fetch_all_nodes import month_path
    from model.run_year import run_year
    from scripts.run_all_nodes import POWER_MW, _series

    if not month_path("RT15", year, 12).exists():
        return None
    rt = pd.concat(pd.read_parquet(month_path("RT15", year, m), filters=[("location", "in", [code, hub])]) for m in range(1, 13))
    node, hubp = rt[rt["location"] == code], rt[rt["location"] == hub]
    if node.empty:
        return None
    first = node["interval_start_utc"].min()
    n = run_year(code, year, POWER_MW, 2.0, 0.85, 10.0, prices=_series(node, "RT15", year))["daily"]
    n = n[pd.to_datetime(n["date"]).dt.tz_localize("US/Central") >= first.tz_convert("US/Central").normalize()]
    h = run_year(hub, year, POWER_MW, 2.0, 0.85, 10.0, prices=_series(hubp, "RT15", year))["daily"]
    days = sorted(set(n["date"]) & set(h["date"]))
    kw = POWER_MW * 1000
    return (float(n[n["date"].isin(days)]["revenue"].sum() / kw), float(h[h["date"].isin(days)]["revenue"].sum() / kw), len(days))


def persistence(top: pd.DataFrame, prev: dict, year: int) -> pd.DataFrame:
    """The premium of each top node in the previous year, flagged when it shows in one year only."""
    p_hubs = {h["code"]: h["rev"] for h in prev["hubs"]}
    p_nodes = {n["code"]: n for n in prev["nodes"]}
    rows = []
    for _, r in top.iterrows():
        q = p_nodes.get(r["code"])
        note, prev_rev, prev_ratio = "", None, None
        if q is not None:
            prev_rev, prev_ratio = q["rev"], q["rev"] / p_hubs[r["hub"]]
        else:
            part = _partial(r["code"], r["hub"], year - 1)
            if part and part[2] >= 30:
                prev_ratio = part[0] / part[1]
                note = f"partial year: {part[2]} days, ${part[0]:.1f} vs hub ${part[1]:.1f}/kW on those days"
            else:
                note = f"not priced in {year - 1}" if part is None else f"only {part[2]} days in {year - 1}"
        if prev_ratio is None:
            flag = f"no {year - 1} data"
        elif prev_ratio >= PREMIUM:
            flag = "premium both years"
        elif prev_ratio >= WEAK:
            flag = f"weaker in {year - 1}"
        else:
            flag = f"premium in {year} only"
        rows.append({"rank": r["rank"], "code": r["code"], "lz": r["lz"], "top10": r["top10"], "rev": r["rev"], "ratio": round(r["ratio"], 2),
                     f"rev_{year - 1}": prev_rev, f"ratio_{year - 1}": None if prev_ratio is None else round(prev_ratio, 2),
                     f"top10_{year - 1}": q["top10"] if q else None, "flag": flag, "note": note})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    main()
