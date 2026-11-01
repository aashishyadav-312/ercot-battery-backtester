import numpy as np
import pandas as pd
import pytest
from data.fetch_ancillary import normalize_as, DA_COLUMNS
from model.ancillary import PRODUCTS
from scripts.run_ancillary import run_stack
from scripts.run_ancillary import save_checkpoint
from scripts.run_ancillary import select_best_feasible
from scripts.run_ancillary import fetch_energy
from pathlib import Path
import json


def test_hourly_da_and_rt_share_utc_schema_and_preserve_fall_back():
    times = pd.date_range('2025-11-02', periods=25, freq='h', tz='US/Central')
    frame = pd.DataFrame({'Interval Start':times, **{v:np.ones(25) for v in DA_COLUMNS.values()}})
    out = normalize_as(frame, 'DA')
    assert len(out) == 25 and out.interval_start_utc.is_unique
    assert str(out.interval_start_utc.dt.tz) == 'UTC'
    long = pd.DataFrame([{'Interval Start':t, 'AS Type':k, 'MCPC':2} for t in times for k in PRODUCTS])
    assert normalize_as(long, 'RT')[list(PRODUCTS)].to_numpy().sum() == 250
    with pytest.raises(ValueError):
        normalize_as(pd.concat([long,long.iloc[:1]]), 'RT')


def test_missing_prices_do_not_become_zero_revenue():
    t = pd.date_range('2025-12-04', periods=192, freq='15min', tz='US/Central')
    energy = pd.DataFrame({'interval_start_utc':t.tz_convert('UTC'), 'interval_start_local':t, 'price':30.})
    da_t = t[::4].tz_convert('UTC')
    da = pd.DataFrame({'interval_start_utc':da_t, **{k:1. for k in PRODUCTS}})
    rt_t = t[96:].tz_convert('UTC')
    rt = pd.DataFrame({'interval_start_utc':rt_t, **{k:2. for k in PRODUCTS}})
    p = dict(power_mw=1, duration_h=2, rte=.85, deg_cost_per_mwh=10)
    r = run_stack(energy, da, rt, p)
    assert [d['market'] for d in r['daily']] == ['DA','RT']
    assert [d['date'] for d in r['daily']] == ['2025-12-04','2025-12-05']
    rt.loc[0, 'REGUP'] = np.nan
    r = run_stack(energy, da, rt, p)
    assert len(r['daily']) == 1
    assert r['skipped_days'] == ['2025-12-05']


def test_windows_cache_lock_keeps_last_valid_checkpoint_without_aborting(tmp_path, monkeypatch):
    target = tmp_path / 'partial.json'
    target.write_text('{"daily":[]}')
    def locked(*args, **kwargs):
        raise PermissionError('Windows sharing lock')
    monkeypatch.setattr(Path, 'replace', locked)
    monkeypatch.setattr('scripts.run_ancillary.time.sleep', lambda _: None)
    save_checkpoint(target, {'daily':[{'date':'2025-01-01'}]})
    assert json.loads(target.read_text()) == {'daily':[]}
    assert json.loads(target.with_suffix('.tmp').read_text())['daily'][0]['date'] == '2025-01-01'


def test_known_energy_schedule_improves_incumbent_and_keeps_dual_bound():
    row = dict(energy=1., REGUP=0., REGDN=0., RRS=0., ECRS=0., NSPIN=0., energy_only=2., solver_gap=3.)
    doc = select_best_feasible({'daily':[row]})
    assert doc['daily'][0]['energy'] == 2.
    assert doc['daily'][0]['energy_fallback']
    assert 4. <= 2*(1+doc['daily'][0]['solver_gap']) <= 4.00002


def test_refresh_updates_api_energy_cache_without_touching_corrected_archives(tmp_path, monkeypatch):
    calls = []
    def download(location, year, market):
        calls.append(1)
        return pd.DataFrame({'interval_start_utc':pd.date_range('2025-01-01 06:00', periods=4, freq='15min', tz='UTC'),
                             'location':location, 'market':market, 'price':float(len(calls))})
    monkeypatch.setattr('scripts.run_ancillary.RAW_DIR', tmp_path)
    monkeypatch.setattr('scripts.run_ancillary._download_api', download)
    assert fetch_energy('HB_TEST',2025).price.iloc[0] == 1.
    assert fetch_energy('HB_TEST',2025).price.iloc[0] == 1.
    assert fetch_energy('HB_TEST',2025,refresh=True).price.iloc[0] == 2.
    assert len(calls) == 2
    assert not (tmp_path/'RT15_ALL_2025.parquet').exists()
