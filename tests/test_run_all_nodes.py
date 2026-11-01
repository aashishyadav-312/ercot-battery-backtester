import numpy as np
import pandas as pd

from scripts.run_all_nodes import run_point


def _frame(freq: str, periods: int, code: str, seed: int) -> pd.DataFrame:
    start = pd.Timestamp("2025-01-01", tz="US/Central").tz_convert("UTC")
    t = pd.date_range(start, periods=periods, freq=freq)
    rng = np.random.default_rng(seed)
    hour = t.tz_convert("US/Central").hour.to_numpy()
    price = 30 + 40 * np.sin((hour - 6) / 24 * 2 * np.pi) + rng.normal(0, 5, len(t))
    return pd.DataFrame({"interval_start_utc": t, "location": code, "location_type": "RN", "price": price})


def test_run_point_summarises_both_strategies():
    days = 3
    rt = _frame("15min", 96 * days, "NODE_A", 0)
    da = _frame("1h", 24 * days, "NODE_A", 1)
    hub = _frame("15min", 96 * days, "HB_X", 2)[["interval_start_utc", "price"]]
    r = run_point(("NODE_A", rt, da, hub, 2025, 2.0, 0.85, 10.0))
    assert r["code"] == "NODE_A"
    assert r["days_solved"] == days and r["skipped_pf"] == 0 and r["skipped_da"] == 0
    assert r["rev"] > 0 and r["da_rev"] <= r["rev"]  # perfect foresight is an upper bound
    assert 0 < r["capture"] <= 1
    assert len(r["monthly"]) == 12 and r["monthly"][0] > 0 and r["monthly"][1] == 0
    assert 0 < r["corr_hub"] <= 1


def test_run_point_reports_skipped_days_for_gaps():
    rt = _frame("15min", 96 * 2, "NODE_A", 0)
    rt = rt.drop(index=range(100, 120))  # 20 missing intervals on day 2
    da = _frame("1h", 48, "NODE_A", 1)
    r = run_point(("NODE_A", rt, da, None, 2025, 2.0, 0.85, 10.0))
    assert r["skipped_pf"] == 1 and r["corr_hub"] is None
