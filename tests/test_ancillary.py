import numpy as np
import pytest
from model.ancillary import optimize_stack, PRODUCTS, UP, PRE_DURATIONS, POST_DURATIONS
from model.dispatch import optimize_day


@pytest.mark.parametrize("n", [92, 96, 100])
@pytest.mark.parametrize("durations", [PRE_DURATIONS, POST_DURATIONS], ids=['before-RTC', 'after-RTC'])
def test_reserves_share_power_and_energy_on_dst_and_regular_days(n, durations):
    rng = np.random.default_rng(n)
    r = optimize_stack(rng.normal(30, 60, n), rng.uniform(0, 25, (n, 5)), .25, 10, 20, durations=durations)
    s = r['schedule']; eta = np.sqrt(.85)
    assert (s.charge_mw + s.discharge_mw + s[list(PRODUCTS)].sum(axis=1) <= 10+1e-6).all()
    assert not ((s.charge_mw > 1e-6) & (s.discharge_mw > 1e-6)).any()
    up = sum(s[k]*durations[k]/eta for k in UP)
    down = s['REGDN']*durations['REGDN']*eta
    for edge in ('soc_start_mwh', 'soc_mwh'):
        assert (s[edge] >= up-1e-6).all()
        assert (20-s[edge] >= down-1e-6).all()
    np.testing.assert_allclose(s.soc_mwh, s.soc_start_mwh + s.charge_mw*eta*.25-s.discharge_mw/eta*.25, atol=1e-6)
    assert s.soc_mwh.iloc[-1] == pytest.approx(0, abs=1e-6)
    assert r['revenue'] == pytest.approx(sum(r['components'].values()))


@pytest.mark.parametrize('durations', [PRE_DURATIONS, POST_DURATIONS], ids=['before-RTC', 'after-RTC'])
@pytest.mark.parametrize('product', PRODUCTS)
def test_each_product_uses_its_duration_and_efficiency_for_backing(product, durations):
    # Start/end at 1 MWh: only 1 MWh can back an upward award or provide
    # empty room for Regulation Down. Scarce energy, rather than MW, binds.
    a = np.zeros((1, 5)); a[0, PRODUCTS.index(product)] = 100
    result = optimize_stack([0.], a, .25, 10, 2, soc0_frac=.5, durations=durations)
    eta = np.sqrt(.85)
    expected = 1 / (durations[product]*eta) if product == 'REGDN' else eta / durations[product]
    assert result['schedule'][product].iloc[0] == pytest.approx(expected, abs=1e-6)


def test_zero_reserve_prices_matches_existing_energy_model():
    p = np.r_[np.full(48, 10.), np.full(48, 100.)]
    r = optimize_stack(p, np.zeros((96, 5)), .25, 10, 20, deg_cost=10)
    old = optimize_day(p, .25, 10, 20, deg_cost_per_mwh=10, soc0_frac=0)
    assert r['revenue'] == pytest.approx(old['revenue'])


def test_hourly_awards_are_held_and_capacity_share_is_obeyed():
    a = np.zeros((96, 5)); a[:, 1] = np.tile([0, 100, 0, 0], 24)
    r = optimize_stack(np.zeros(96), a, .25, 10, 20, award_groups=np.arange(96)//4, max_as_share=.5)
    s = r['schedule']
    assert (s[list(PRODUCTS)].sum(axis=1) <= 5+1e-6).all()
    for k in PRODUCTS:
        assert all(np.ptp(v) < 1e-6 for v in s[k].to_numpy().reshape(-1, 4))


def test_capacity_payment_units_and_negative_prices():
    a = np.zeros((4, 5)); a[:, 1] = 2
    r = optimize_stack(np.zeros(4), a, .25, 1, 10)
    assert r['components']['REGDN'] == pytest.approx(2)  # 1 MW x $2/MW-h x 1 h
    r = optimize_stack(np.zeros(4), -np.ones((4, 5)), .25, 1, 10)
    assert r['revenue'] == pytest.approx(0)


@pytest.mark.parametrize('kwargs', [{'rte': 0}, {'max_as_share': 2}, {'durations': {'REGUP': 0}}, {'deg_cost': float('nan')}])
def test_reject_invalid_parameters(kwargs):
    with pytest.raises(ValueError):
        optimize_stack(np.zeros(4), np.zeros((4, 5)), .25, 1, 2, **kwargs)
