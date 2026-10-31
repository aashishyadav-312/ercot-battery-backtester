import pandas as pd

from scripts.rank_nodes import pick, rank


def test_rank_and_pick_high_and_typical_nodes():
    t = pd.date_range("2025-08-01", periods=100, freq="15min", tz="UTC")
    frames = []
    for i, scale in enumerate([1, 2, 3, 4, 5, 6, 50, 60, 70]):
        prices = [scale * (j % 2) for j in range(100)]
        frames.append(pd.DataFrame({"interval_start_utc": t, "location": f"N{i}", "price": prices}))
    patchy = pd.DataFrame({"interval_start_utc": t[:10], "location": "PATCHY", "price": 1e4 * (t[:10].minute % 2)})
    stats = rank(pd.concat(frames + [patchy]))
    assert "PATCHY" not in stats.index  # too few intervals
    picks = pick(stats)
    assert picks.query("group == 'high'").index.tolist() == ["N8", "N7", "N6"]
    typical = set(picks.query("group == 'typical'").index)
    assert "N4" in typical and typical <= {"N3", "N4", "N5"}  # N4 is the median node
    assert len(picks) == 5
