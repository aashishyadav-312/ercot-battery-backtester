import pandas as pd

from scripts.build_context import fleet_series, hourly_shares, queue_by_county


def _units(rows, extra=()):
    cols = ["Technology", "Plant State", "Balancing Authority Code", "Operating Year", "Operating Month", "Nameplate Capacity (MW)", "Nameplate Energy Capacity (MWh)", *extra]
    return pd.DataFrame(rows, columns=cols)


def test_fleet_counts_units_from_their_start_month_and_drops_retired_ones():
    operating = _units([
        ["Batteries", "TX", "ERCO", 2024, 3, 100.0, 200.0],
        ["Batteries", "TX", "ERCO", 2024, 5, 50.0, 100.0],
        ["Batteries", "TX", "DOPD", 2024, 1, 999.0, 999.0],  # outside ERCOT
        ["Batteries", "CA", "ERCO", 2024, 1, 999.0, 999.0],  # outside Texas
        ["Solar Photovoltaic", "TX", "ERCO", 2024, 1, 999.0, None],
    ])
    retired = _units([["Batteries", "TX", "ERCO", 2023, 11, 2.0, 0.7, 2024, 4]], extra=["Retirement Year", "Retirement Month"])
    s = {r["month"]: r for r in fleet_series(operating, retired, 2024, 2024 * 12 + 5)}  # Jan..Jun 2024
    assert s["2024-02"]["mw"] == 2.0  # only the unit that retires in April
    assert s["2024-03"]["mw"] == 102.0 and s["2024-03"]["units"] == 2
    assert s["2024-04"]["mw"] == 100.0  # retired unit gone from its retirement month
    assert s["2024-06"]["mw"] == 150.0 and s["2024-06"]["mwh"] == 300.0


def test_queue_groups_storage_by_county_and_splits_signed_agreements():
    storage = pd.DataFrame({
        "County": ["harris", "Harris ", "Wise"],
        "Capacity (MW)": [100.0, 50.0, 200.0],
        "IA Signed": [pd.Timestamp("2025-01-01"), None, None],
    })
    q = queue_by_county(storage)
    assert list(q) == ["Wise", "Harris"]  # largest first
    assert q["Harris"] == {"mw": 150.0, "projects": 2, "mw_ia_signed": 100.0}


def _fuel_day(solar, wind, gas, wsl):
    slots = [f"{(i + 1) * 15 // 60}:{(i + 1) * 15 % 60:02d}" for i in range(96)]
    slots[-1] = "0:00"
    rows = {"Solar": solar, "Wind": wind, "Gas": gas, "WSL": wsl}
    return pd.DataFrame([{"Date": "2025-06-01", "Fuel": f, **dict(zip(slots, [v] * 96))} for f, v in rows.items()])


def test_hourly_share_excludes_storage_load_from_the_denominator():
    df = _fuel_day(solar=10.0, wind=30.0, gas=60.0, wsl=-500.0)
    out = hourly_shares({6: df})
    assert out["months"] == [6]
    assert out["solar_pct"][5][12] == 10.0 and out["wind_pct"][5][12] == 30.0
    assert out["solar_pct"][0][0] is None  # January not supplied
