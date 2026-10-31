import time

import numpy as np
import pytest

from model.dispatch import optimize_day

DT = 0.25


def _check_physics(result, power_mw, energy_mwh, rte, soc0_frac):
    s = result["schedule"]
    eta = np.sqrt(rte)
    assert (s["charge_mw"] >= 0).all() and (s["charge_mw"] <= power_mw + 1e-6).all()
    assert (s["discharge_mw"] >= 0).all() and (s["discharge_mw"] <= power_mw + 1e-6).all()
    assert (s["soc_mwh"] >= -1e-6).all() and (s["soc_mwh"] <= energy_mwh + 1e-6).all()
    # State of charge follows the energy balance, and the day ends where it started.
    soc0 = soc0_frac * energy_mwh
    expected = soc0 + np.cumsum(s["charge_mw"] * eta * DT - s["discharge_mw"] / eta * DT)
    np.testing.assert_allclose(s["soc_mwh"], expected, atol=1e-6)
    assert s["soc_mwh"].iloc[-1] == pytest.approx(soc0, abs=1e-6)
    # Never charging and discharging in the same interval.
    assert not ((s["charge_mw"] > 0) & (s["discharge_mw"] > 0)).any()


def test_flat_prices_give_zero_dispatch():
    r = optimize_day(np.full(96, 40.0), DT, 10, 20)
    assert r["energy_discharged_mwh"] == pytest.approx(0, abs=1e-6)
    assert r["revenue"] == pytest.approx(0, abs=1e-6)


def test_two_price_day_matches_hand_calculation():
    # 12 cheap hours then 12 expensive hours; 1 MW / 1 MWh, eta = 0.9 each way.
    # Charge from 0.5 to 1.0 MWh while cheap (buys 0.5 / 0.9 MWh), discharge
    # back to 0.5 MWh while expensive (sells 0.5 * 0.9 MWh).
    prices = np.r_[np.full(48, 10.0), np.full(48, 100.0)]
    r = optimize_day(prices, DT, 1, 1, rte=0.81)
    s = r["schedule"]
    assert s["discharge_mw"].iloc[:48].sum() == pytest.approx(0, abs=1e-6)
    assert s["charge_mw"].iloc[48:].sum() == pytest.approx(0, abs=1e-6)
    assert r["revenue"] == pytest.approx(100 * 0.45 - 10 * 0.5 / 0.9, rel=1e-6)
    _check_physics(r, 1, 1, 0.81, 0.5)


@pytest.mark.parametrize("seed", range(5))
def test_random_days_obey_physics_and_never_lose_money(seed):
    rng = np.random.default_rng(seed)
    prices = rng.normal(40, 60, 96)  # includes negative prices
    r = optimize_day(prices, DT, 25, 100, rte=0.85, deg_cost_per_mwh=5)
    assert r["revenue"] >= -1e-6  # doing nothing is always feasible
    _check_physics(r, 25, 100, 0.85, 0.5)


def test_negative_prices_never_charge_and_discharge_together():
    # A full battery facing a midday stretch of negative prices would burn
    # energy through losses by charging and discharging at once if allowed to.
    prices = np.r_[np.full(36, 25.0), np.linspace(-60, -5, 28), np.full(32, 60.0)]
    r = optimize_day(prices, DT, 10, 10, soc0_frac=1.0)
    assert r["used_milp"]
    _check_physics(r, 10, 10, 0.85, 1.0)


def test_degradation_above_spread_stops_cycling():
    prices = np.r_[np.full(48, 30.0), np.full(48, 50.0)]
    r = optimize_day(prices, DT, 10, 20, rte=0.85, deg_cost_per_mwh=100)
    assert r["energy_discharged_mwh"] == pytest.approx(0, abs=1e-6)


@pytest.mark.parametrize("n", [92, 100])
def test_dst_day_lengths(n):
    prices = np.r_[np.full(n // 2, 10.0), np.full(n - n // 2, 80.0)]
    r = optimize_day(prices, DT, 5, 10)
    assert len(r["schedule"]) == n
    assert r["revenue"] > 0


def test_nan_prices_rejected():
    with pytest.raises(ValueError):
        optimize_day(np.array([1.0, np.nan]), DT, 1, 1)


def test_solves_a_day_in_under_half_a_second():
    prices = np.random.default_rng(0).normal(40, 30, 96)
    optimize_day(prices, DT, 100, 200)  # warm up solver import
    start = time.perf_counter()
    optimize_day(prices, DT, 100, 200)
    assert time.perf_counter() - start < 0.5
