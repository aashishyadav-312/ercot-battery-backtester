import json

import numpy as np
import pandas as pd
import pytest

from model import run_year as ry
from model.metrics import summarize


def _prices(days, drop=()):
    """Synthetic 15-min prices: $10 overnight/midday, $100 from 18:00 to 21:00."""
    idx = pd.date_range(f"{days[0]} 00:00", f"{days[-1]} 23:45", freq="15min", tz="US/Central")
    price = np.where((idx.hour >= 18) & (idx.hour < 21), 100.0, 10.0)
    df = pd.DataFrame({"interval_start_local": idx, "price": price})
    df.loc[df.index.isin(drop), "price"] = np.nan
    return df


def test_skips_days_with_long_gaps_and_fills_short_ones():
    df = _prices(["2025-01-01", "2025-01-03"], drop=list(range(96 + 10, 96 + 15)) + [200, 201])
    r = ry.run_year("TEST", 2025, power_mw=1, hours=1, prices=df)
    assert r["skipped_days"] == ["2025-01-02"]  # 5 missing intervals
    assert r["daily"]["date"].tolist() == ["2025-01-01", "2025-01-03"]  # day 3 has 2, filled


def test_metrics_on_synthetic_days():
    df = _prices(["2025-01-01", "2025-01-10"])
    # A tiny degradation cost stops zero-profit churn at $10 with rte = 1.
    r = ry.run_year("TEST", 2025, power_mw=1, hours=1, rte=1.0, deg_cost=0.01, prices=df)
    m = summarize(r)
    # Each day: buy 1 MWh at $10, sell 1 MWh at $100 => $90/day on a 1 MW battery.
    assert r["daily"]["revenue"].tolist() == pytest.approx([89.99] * 10)
    assert m["revenue_per_kw_period"] == pytest.approx(0.9, abs=1e-3)
    assert m["annualized"] and m["days_covered"] == 10
    assert m["revenue_per_kw_year"] == pytest.approx(0.9 * 365 / 10, abs=0.01)
    assert m["top10_day_share"] == pytest.approx(1.0)
    assert m["avg_spread_captured"] == pytest.approx(90.0)
    heat = np.array(m["heatmap_net_mw"]["values"])
    assert heat.shape == (1, 24)
    assert heat[0, 18:21].sum() > 0  # discharging in the evening peak


def test_json_is_compact_and_lists_assumptions(tmp_path, monkeypatch):
    monkeypatch.setattr(ry, "RESULTS_DIR", tmp_path)
    df = _prices(["2025-01-01", "2025-12-31"])
    r = ry.run_year("TEST", 2025, power_mw=100, hours=2, prices=df)
    path = ry.save(r)
    assert path.name == "TEST_2025_2h_0.85_0.json"
    assert path.stat().st_size < 200_000
    doc = json.loads(path.read_text())
    assert not doc["metrics"]["annualized"]
    assert len(doc["daily"]["revenue"]) == 365
    assert "ancillary services" in doc["meta"]["excludes"]
