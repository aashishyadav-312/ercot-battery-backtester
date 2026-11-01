import numpy as np
import pandas as pd
import pytest

from scripts import build_walkthrough as bw


def _rt(days, spike_day=None):
    """Synthetic 15-min prices: $10 overnight/midday, $100 from 18:00 to 21:00 (x10 on the spike day)."""
    idx = pd.date_range(f"{days[0]} 00:00", f"{days[-1]} 23:45", freq="15min", tz="US/Central")
    price = np.where((idx.hour >= 18) & (idx.hour < 21), 100.0, 10.0)
    df = pd.DataFrame({"interval_start_local": idx, "price": price})
    if spike_day:
        mask = df["interval_start_local"].dt.strftime("%Y-%m-%d") == spike_day
        df.loc[mask & (idx.hour >= 18) & (idx.hour < 21), "price"] = 1000.0
    return df


def test_full_days_skips_dst_and_gappy_days():
    df = _rt(["2025-03-08", "2025-03-11"])  # 2025-03-09 is the spring-forward day: 92 intervals
    assert "2025-03-09" not in bw.full_days(df)
    gappy = _rt(["2025-01-01", "2025-01-02"]).drop(index=range(10, 14))  # 4 missing intervals on Jan 1
    assert list(bw.full_days(gappy)) == ["2025-01-02"]


def test_pick_featured_orders_and_dedupes():
    dates = [f"2025-01-{d:02d}" for d in range(1, 29)]
    revenue = pd.Series(np.arange(1, 29, dtype=float), index=dates)
    min_price = pd.Series(10.0, index=dates)
    min_price["2025-01-03"] = -50.0
    picks = bw.pick_featured(revenue, min_price)
    assert picks[0] == ("2025-01-28", "top", "Best day of the year")
    assert [p[1] for p in picks[:10]] == ["top"] * 10
    assert len({p[0] for p in picks}) == len(picks)
    kinds = [p[1] for p in picks]
    assert {"typical", "quiet", "negative"} <= set(kinds)
    assert dict((p[1], p[0]) for p in picks)["negative"] == "2025-01-03"


def test_build_matches_stored_revenue_and_battery_physics():
    days = [f"2025-06-{d:02d}" for d in range(1, 13)]
    rt = _rt(days, spike_day="2025-06-05")
    solved = {d: bw.solve_day(g, 2.0, 0.85, 10.0) for d, g in bw.full_days(rt).items()}
    stored = {d: round(s["revenue"], 2) for d, s in solved.items()}
    doc = bw.build(rt, None, stored, "TEST", 2025, 2.0, 0.85, 10.0, 12.3)
    best = doc["days"][0]
    assert best["date"] == "2025-06-05" and best["label"] == "Best day of the year"
    assert len(best["price"]) == len(best["net_mw"]) == len(best["soc_mwh"]) == 96
    assert max(best["soc_mwh"]) <= 200 + 1e-6 and min(best["soc_mwh"]) >= -1e-6
    assert best["soc_mwh"][-1] == pytest.approx(0, abs=0.01)  # starts and ends empty
    assert bw.revenue_from_arrays(best["price"], best["net_mw"], 10.0) == pytest.approx(best["revenue"], abs=2)
    assert "da_price" not in best


def test_build_refuses_prices_that_disagree_with_stored_results():
    days = ["2025-06-01", "2025-06-02", "2025-06-03"]
    rt = _rt(days)
    stored = {d: 1.0 for d in days}  # real revenue is far from $1
    with pytest.raises(RuntimeError, match="differs from stored"):
        bw.build(rt, None, stored, "TEST", 2025, 2.0, 0.85, 10.0, 1.0)
