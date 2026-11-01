"""DA-schedule / RT-settle: small days whose answers can be checked by hand."""

import numpy as np
import pandas as pd
import pytest

from model.dispatch import optimize_day
from model.forecast import da_schedule_rt_settle, run_da_schedule, settle, summarize_da
from model.run_year import add_da_schedule


def _hourly_day(cheap=10.0, dear=100.0):
    """24 DA hours: cheap 00–05, dear 18–20, $40 otherwise."""
    p = np.full(24, 40.0)
    p[0:6] = cheap
    p[18:21] = dear
    return p


def test_settle_by_hand():
    # Charge 2 MW for one 15-min interval at $20, discharge 1 MW for two at $50, $5/MWh degradation.
    r = settle([-2, 1, 1], [20, 50, 50], dt_hours=0.25, deg_cost_per_mwh=5)
    assert r["gross_revenue"] == pytest.approx(-2 * 20 * 0.25 + 2 * 50 * 0.25)  # -10 + 25 = 15
    assert r["degradation_cost"] == pytest.approx(5 * 0.5)
    assert r["revenue"] == pytest.approx(12.5)


def test_identical_da_and_rt_prices_match_perfect_foresight():
    # When RT equals DA in every 15-min interval of each hour, the DA schedule is
    # also optimal at RT: same revenue as perfect foresight on the RT prices.
    da = _hourly_day()
    rt = np.repeat(da, 4)
    for hours in (1, 2, 4):
        r = da_schedule_rt_settle(da, rt, power_mw=1, energy_mwh=hours, rte=0.85, deg_cost_per_mwh=2, soc0_frac=0)
        pf = optimize_day(rt, 0.25, 1, hours, rte=0.85, deg_cost_per_mwh=2, soc0_frac=0)
        assert r["revenue_at_rt"] == pytest.approx(pf["revenue"], rel=1e-6)
        assert r["revenue_at_rt"] == pytest.approx(r["revenue_at_da"], rel=1e-6)
        assert r["revenue_at_rt"] > 0


def test_hand_calculated_revenue_with_rte_one():
    # 1 MW / 1 MWh, rte 1: buy one hour at $10, sell one hour at $100 -> $90.
    da = _hourly_day()
    r = da_schedule_rt_settle(da, np.repeat(da, 4), 1, 1, rte=1.0, deg_cost_per_mwh=0.01, soc0_frac=0)
    assert r["revenue_at_rt"] == pytest.approx(90 - 0.01, abs=1e-6)


def test_da_schedule_can_lose_money_at_rt():
    # DA says buy at 01:00 and sell at 19:00. In real time the prices flipped:
    # the battery buys 1 MWh at $100 and sells 1 MWh at $10 -> loses $90.
    da = _hourly_day()
    rt = np.repeat(np.full(24, 40.0), 4)
    rt[0:24] = 100.0  # 00:00–05:59 is expensive in RT
    rt[72:84] = 10.0  # 18:00–20:59 is cheap in RT
    r = da_schedule_rt_settle(da, rt, 1, 1, rte=1.0, soc0_frac=0)
    assert r["revenue_at_da"] == pytest.approx(90, abs=1e-6)
    assert r["revenue_at_rt"] == pytest.approx(-90, abs=1e-6)
    # Perfect foresight on the same RT prices never loses money.
    assert optimize_day(rt, 0.25, 1, 1, rte=1.0, soc0_frac=0)["revenue"] >= 0


def test_each_hourly_mw_applies_to_its_four_intervals():
    da = _hourly_day()
    rt = np.repeat(da, 4) + np.tile([0.0, 3.0, -1.0, 2.0], 24)  # RT wiggles inside each hour
    r = da_schedule_rt_settle(da, rt, 1, 1, rte=1.0, soc0_frac=0)
    hourly = r["da_schedule"]["net_mw"].to_numpy()
    assert np.array_equal(r["net_mw_rt"].reshape(24, 4), np.repeat(hourly[:, None], 4, axis=1))
    # The hour-average RT price is DA + 1, so each MWh sold earns $1 more and each bought costs $1 more.
    assert r["revenue_at_rt"] == pytest.approx(r["revenue_at_da"] + 1 * hourly.sum(), abs=1e-6)


def test_mismatched_lengths_rejected():
    with pytest.raises(ValueError):
        da_schedule_rt_settle(np.ones(24), np.ones(95), 1, 1)


def _frames(day: str, da: np.ndarray, rt: np.ndarray):
    def frame(values, freq):
        local = pd.date_range(day, periods=len(values), freq=freq, tz="US/Central")
        return pd.DataFrame({"interval_start_utc": local.tz_convert("UTC"), "interval_start_local": local, "price": values})

    return frame(rt, "15min"), frame(da, "h")


def test_run_da_schedule_lines_up_dst_day():
    # Nov 2, 2025 has 25 hours (fall back): 25 DA hours, 100 RT intervals.
    da = np.r_[np.full(6, 10.0), np.full(13, 40.0), np.full(3, 100.0), np.full(3, 40.0)]
    rt_df, da_df = _frames("2025-11-02", da, np.repeat(da, 4))
    out = run_da_schedule(rt_df, da_df, power_mw=1, hours=1, rte=1.0, deg_cost=0, soc0_frac=0)
    assert out["skipped_days"] == []
    assert out["daily"]["da_rt_revenue"].iloc[0] == pytest.approx(90, abs=1e-6)


def test_run_da_schedule_skips_days_without_da_prices():
    da = _hourly_day()
    rt_df, da_df = _frames("2025-03-01", da, np.repeat(da, 4))
    out = run_da_schedule(rt_df, da_df, 1, 1, 1.0, 0, 0, days=["2025-03-01", "2025-03-02"])
    assert out["skipped_days"] == ["2025-03-02"]
    assert out["daily"]["date"].tolist() == ["2025-03-01"]


def test_summary_gap_and_capture_rate():
    pf = pd.DataFrame({"date": ["d1", "d2", "d3"], "revenue": [100.0, 300.0, 50.0]})
    da = pd.DataFrame({"date": ["d1", "d2"], "da_rt_revenue": [80.0, -20.0], "da_da_revenue": [90.0, 250.0], "cycles": [1.0, 1.0]})
    s = summarize_da(pf, da, power_mw=0.001, scale=1.0)  # 1 kW, so $ == $/kW
    assert s["da_days_matched"] == 2  # d3 has no DA result and is left out of both sides
    assert s["pf_revenue_per_kw_year_matched"] == pytest.approx(400)
    assert s["da_rt_revenue_per_kw_year"] == pytest.approx(60)
    assert s["value_of_perfect_foresight_per_kw_year"] == pytest.approx(340)
    assert s["capture_rate"] == pytest.approx(0.15)
    assert s["da_losing_days"] == 1


def test_add_da_schedule_keeps_existing_fields():
    doc = {
        "meta": {"power_mw": 0.001, "location": "X"},
        "metrics": {"revenue_per_kw_year": 1.0, "annualized": False, "days_covered": 2},
        "daily": {"date": ["d1", "d2"], "revenue": [10.0, 20.0], "cycles": [1.0, 1.0]},
    }
    before = {k: dict(v) for k, v in doc.items()}
    da = {"daily": pd.DataFrame({"date": ["d1"], "da_rt_revenue": [6.0], "da_da_revenue": [7.0], "cycles": [1.0]}), "skipped_days": ["d2"]}
    add_da_schedule(doc, da)
    for block, fields in before.items():
        for k, v in fields.items():
            assert doc[block][k] == v
    assert doc["daily"]["da_rt_revenue"] == [6.0, None]
    assert doc["metrics"]["capture_rate"] == pytest.approx(0.6)
    assert doc["meta"]["da_schedule"]["skipped_days"] == ["d2"]
