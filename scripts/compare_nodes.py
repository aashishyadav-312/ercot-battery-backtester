"""Compare each resource node with its nearest hub over a matched window.

For every node in results/node_selection.json, reads the node's and its
nearest hub's result JSONs, keeps only the days both cover (hub archives and
the API can end on different days, and either side can skip a gappy day), and
reports $/kW earned over that common window plus the node / hub ratio.

CLI:
    python -m scripts.compare_nodes --duration 2 --deg 10
"""

from __future__ import annotations

import argparse
import json

import pandas as pd

from model.run_year import RESULTS_DIR, result_path


def _daily(location: str, year: int, hours: float, rte: float, deg: float) -> pd.Series | None:
    path = result_path(location, year, hours, rte, deg)
    if not path.exists():
        return None
    d = json.loads(path.read_text())
    power_kw = d["meta"]["power_mw"] * 1000
    return pd.Series(d["daily"]["revenue"], index=d["daily"]["date"]) / power_kw


def compare(years=(2024, 2025, 2026), hours: float = 2.0, rte: float = 0.85, deg: float = 10.0) -> pd.DataFrame:
    sel = json.loads((RESULTS_DIR / "node_selection.json").read_text())
    rows = []
    for n in sel["nodes"]:
        for year in years:
            node, hub = _daily(n["location"], year, hours, rte, deg), _daily(n["nearest_hub"], year, hours, rte, deg)
            if node is None or hub is None:
                continue
            days = node.index.intersection(hub.index)
            rows.append(
                {
                    "node": n["location"],
                    "group": n["group"],
                    "hub": n["nearest_hub"],
                    "year": year,
                    "window": f"{min(days)}..{max(days)}",
                    "days": len(days),
                    "node_per_kw": round(node[days].sum(), 1),
                    "hub_per_kw": round(hub[days].sum(), 1),
                    "ratio": round(node[days].sum() / hub[days].sum(), 2),
                }
            )
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--duration", type=float, default=2.0)
    parser.add_argument("--deg", type=float, default=10.0)
    args = parser.parse_args()
    print(compare(hours=args.duration, deg=args.deg).to_string(index=False))


if __name__ == "__main__":
    main()
