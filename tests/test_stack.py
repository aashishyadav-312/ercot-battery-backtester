"""v4 revenue stack engine (model/stack.py, model/stack_year.py, scripts/run_stack.py)."""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from data.price_files import read
from model.stack import PRODUCTS, UP, Battery, Options, durations, load_rules, optimize
from model.stack_year import per_kw_year, run_point_year

ROOT = Path(__file__).resolve().parent.parent
PRICES = ROOT / "results" / "prices"
STACK = ROOT / "results" / "v4" / "stack"
RULES = load_rules()


def test_rules_load_and_every_rule_has_a_source():
    assert RULES["as_of"] and RULES["rtcb_go_live"]["date"] == "2025-12-05"
    assert RULES["rtcb_go_live"]["source"].startswith("https://")
    for k in PRODUCTS:
        prod = RULES["products"][k]
        assert isinstance(prod["eligible_esr"], bool) and isinstance(prod["symmetric"], bool)
        for era in ("pre_rtcb", "post_rtcb"):
            rule = prod["duration_h"][era]
            assert rule["value"] > 0
            assert rule["status"] in ("SOURCED", "ASSUMPTION")
            assert rule["source"].startswith("https://www.ercot.com/"), (k, era)
            assert rule["note"]
    # Unsourced items must be labelled as assumptions with an explanation.
    for key in ("regulation_deployment_factor", "eligibility_note", "price_taker"):
        assert RULES[key]["status"] in ("ASSUMPTION", "SOURCED") and RULES[key]["note"]
    assert list(durations(RULES, True)) == [0.5, 0.5, 0.5, 1.0, 4.0]
    assert list(durations(RULES, False)) == [1.0, 1.0, 1.0, 2.0, 4.0]


def _fixture(hours=48, dt=0.25, seed=1):
    rng = np.random.default_rng(seed)
    n = int(hours / dt)
    t = np.arange(n) * dt
    p = 30 + 40 * np.sin(2 * np.pi * (t - 9) / 24) + rng.normal(0, 15, n)
    p[10:14] = -20.0  # negative prices exercise the charge-or-discharge fallback
    p[70] = 900.0
    a = rng.uniform(0, 25, (n, 5))
    day = (t // 24).astype(int)
    return p, a, dt, day


def test_headroom_and_soc_reserve_constraints_hold_on_48h_fixture():
    p, a, dt, day = _fixture()
    bat = Battery(100, 200, 0.85, 10, 0)
    dur = durations(RULES, True)
    f = 0.1
    o = optimize(p, a, dt, day, dur, battery=bat, options=Options(reg_deploy=f))
    c, d, r, soc = o["charge"], o["discharge"], o["awards"], o["soc"]
    eta = math.sqrt(bat.rte)
    tol = 1e-5
    up = r[:, list(UP)].sum(axis=1)
    assert (c + d <= 100 + tol).all()
    assert (d + up <= 100 + tol).all()
    assert (c + r[:, 1] <= 100 + tol).all()
    assert not ((c > 1e-6) & (d > 1e-6)).any()
    # SOC at each interval start (0 at each midnight) and end.
    start = np.r_[0.0, soc[:-1]]
    start[np.r_[True, np.diff(day) != 0]] = 0.0
    up_e = (r[:, list(UP)] * dur[list(UP)]).sum(axis=1) / eta
    dn_e = r[:, 1] * dur[1] * eta
    for s in (start, soc):
        assert (s >= up_e - tol).all() and (200 - s >= dn_e - tol).all()
        assert (s >= -tol).all() and (s <= 200 + tol).all()
    # Dynamics incl. regulation deployment energy.
    exp = start + eta * c * dt - d * dt / eta - f * r[:, 0] * dt / eta + f * r[:, 1] * dt * eta
    assert np.allclose(soc, exp, atol=1e-5)
    last = np.r_[np.diff(day) != 0, True]
    assert np.allclose(soc[last], 0.0, atol=1e-6)
    assert o["awards"].sum() > 0


def test_as_revenue_is_award_times_price_and_unavailable_products_earn_nothing():
    p, a, dt, day = _fixture(seed=3)
    avail = np.ones_like(a, bool)
    avail[:, 3] = False  # ECRS before it existed
    o = optimize(p, a, dt, day, durations(RULES, False), available=avail, options=Options(reg_deploy=0.0))
    for k, name in enumerate(PRODUCTS):
        assert sum(x[name] for x in o["days"]) == pytest.approx(float((a[:, k] * o["awards"][:, k] * dt).sum()), rel=1e-9)
    assert o["awards"][:, 3].max() == 0
    energy = float(((p * (o["discharge"] - o["charge"])) - 10 * o["discharge"]).sum() * dt)
    assert sum(x["energy"] for x in o["days"]) == pytest.approx(energy, rel=1e-9)


def test_award_groups_hold_awards_for_the_hour():
    p, a, dt, day = _fixture(seed=4)
    hour = (np.arange(len(p)) // 4)
    o = optimize(p, a, dt, day, durations(RULES, False), award_groups=hour)
    r = o["awards"].reshape(-1, 4, 5)
    assert np.allclose(r, r[:, :1, :])


def test_as_off_matches_energy_only_dispatch():
    from model.dispatch import optimize_day

    p, a, dt, day = _fixture(seed=5)
    o = optimize(p, a, dt, day, durations(RULES, True), options=Options(as_enabled=False))
    ref = sum(optimize_day(p[day == k], dt, 100, 200, 0.85, 10, 0)["revenue"] for k in np.unique(day))
    assert sum(x["energy"] for x in o["days"]) == pytest.approx(ref, rel=1e-7)
    assert sum(x[k] for x in o["days"] for k in PRODUCTS) == 0


def _frames(hours, seed):
    """Synthetic 15-min RT, hourly DA and DAM AS frames for whole Central-time days."""
    rng = np.random.default_rng(seed)
    start = pd.Timestamp("2025-06-01", tz="US/Central").tz_convert("UTC")
    rt_t = pd.date_range(start, periods=hours * 4, freq="15min")
    da_t = pd.date_range(start, periods=hours, freq="h")
    h = np.arange(hours)
    da_p = 30 + 30 * np.sin(2 * np.pi * (h - 9) / 24) + rng.normal(0, 5, hours)
    rt_p = np.repeat(da_p, 4) + rng.normal(0, 20, hours * 4)
    as_da = pd.DataFrame({"interval_start_utc": da_t, **{c: rng.uniform(0, 15, hours) for c in ("REGUP", "REGDN", "RRS", "ECRS", "NSPIN")}})
    rt = pd.DataFrame({"interval_start_utc": rt_t, "price": np.round(rt_p, 2)})
    da = pd.DataFrame({"interval_start_utc": da_t, "price": np.round(da_p, 2)})
    days = sorted(set(rt_t.tz_convert("US/Central").strftime("%Y-%m-%d")))
    return rt, da, as_da, days


def test_realistic_never_beats_foresight_and_pays_dam_mcpc():
    rt, da, as_da, days = _frames(72, seed=7)
    opts = Options(reg_deploy=0.1)
    fs = run_point_year(rt, da, as_da, None, days, 2, RULES, "foresight", options=opts)["daily"]
    re = run_point_year(rt, da, as_da, None, days, 2, RULES, "realistic", options=opts)["daily"]
    tot = lambda df: df[["energy", *PRODUCTS]].sum(axis=1).to_numpy()
    assert (tot(fs) >= tot(re) - 1e-6).all()
    assert re[list(PRODUCTS)].to_numpy().sum() > 0


@pytest.mark.parametrize("code", ["HB_WEST", "HB_NORTH", "HB_HOUSTON", "RHESS2_ESS1", "ANSON1_ALL", "CAMWIND_RN"])
def test_energy_only_parity_with_published_results(code):
    """With AS off the stack engine reproduces the published energy-only $/kW-yr within 0.5%."""
    year, hours = 2025, 2
    _, rt, da = read(PRICES / f"{code}_{year}.ebp")
    ref = json.loads((ROOT / "results" / f"{code}_{year}_{hours}h_0.85_10.json").read_text())
    days = ref["daily"]["date"]
    as_da = pd.DataFrame({"interval_start_utc": da["interval_start_utc"], **{c: 0.0 for c in ("REGUP", "REGDN", "RRS", "ECRS", "NSPIN")}})
    for mode, key in (("foresight", "revenue_per_kw_year"), ("realistic", "da_rt_revenue_per_kw_year")):
        out = run_point_year(rt, da, as_da, None, days, hours, RULES, mode, options=Options(as_enabled=False))
        val, _ = per_kw_year(out["daily"], 100, year)
        assert val["total"] == pytest.approx(ref["metrics"][key], rel=0.005), (code, mode)


def test_per_kw_year_annualizes_partial_years():
    daily = pd.DataFrame({"energy": [1000.0] * 100, **{k: [100.0] * 100 for k in PRODUCTS}})
    val, scale = per_kw_year(daily, 100, 2026)
    assert scale == pytest.approx(3.65)
    assert val["energy"] == pytest.approx(1000 * 100 / 1e5 * 3.65, abs=0.01)
    assert val["total"] == pytest.approx(val["energy"] + sum(val[k] for k in PRODUCTS), abs=0.05)


def test_stack_output_schema():
    files = sorted(p for p in STACK.glob("*.json") if p.name != "index.json")
    if not files:
        pytest.skip("no stack results yet")
    index = json.loads((STACK / "index.json").read_text())
    assert index == {"files": [p.name for p in files]}
    for path in files:
        doc = json.loads(path.read_text())
        m = doc["meta"]
        year, dur, mode = path.stem.split("_")
        assert m["year"] == int(year) and m["durationH"] == float(dur.rstrip("h")) and m["mode"] == mode
        assert mode in ("foresight", "realistic")
        assert m["products"] == ["energy", *PRODUCTS]
        assert m["rtcb"] in ("pre", "post", "mixed")
        assert isinstance(m["partialYear"], bool) and 1 <= m["monthsCovered"] <= 12
        assert m["assumptions"] and m["generated"]
        assert m["sources"] and all(isinstance(x, str) for x in m["sources"])  # web/src/v4/stack.ts: string[]
        assert any("Price taker" in a for a in m["assumptions"])
        assert set(m["hubs"]) <= set(doc["nodes"])
        for code, v in doc["nodes"].items():
            assert set(v) == {"energy", *PRODUCTS, "total"}, code
            assert v["total"] == pytest.approx(v["energy"] + sum(v[k] for k in PRODUCTS), abs=0.05)
            assert all(v[k] >= 0 for k in PRODUCTS)
