import pandas as pd

from data.fetch_prices import _fill_gaps, _normalize


def _raw(starts, location="HB_HOUSTON", prices=None):
    starts = pd.DatetimeIndex(starts).tz_localize("US/Central")
    return pd.DataFrame(
        {
            "Interval Start": starts,
            "Location": location,
            "SPP": prices if prices is not None else range(len(starts)),
        }
    )


def test_normalize_stores_utc_and_collapses_identical_duplicates():
    raw = _raw(["2025-01-01 00:00", "2025-01-01 00:00", "2025-01-01 00:15"], prices=[10.0, 10.0, 12.0])
    df = _normalize(raw, "RT15")
    assert len(df) == 2
    assert str(df["interval_start_utc"].dt.tz) == "UTC"
    assert df["interval_start_utc"].iloc[0] == pd.Timestamp("2025-01-01 06:00", tz="UTC")


def test_normalize_drops_location_with_conflicting_duplicates():
    hub = _raw(["2025-01-01 00:00"], prices=[10.0])
    lz = _raw(["2025-01-01 00:00", "2025-01-01 00:00"], location="LZ_WEST", prices=[10.0, 11.0])
    df = _normalize(pd.concat([hub, lz]), "RT15")
    assert df["location"].unique().tolist() == ["HB_HOUSTON"]


def test_fill_gaps_ffills_one_interval_only():
    starts = pd.date_range("2025-01-01 00:00", periods=8, freq="15min")
    keep = [0, 1, 3, 6, 7]  # one-interval gap at 2, two-interval gap at 4-5
    df = _normalize(_raw(starts[keep], prices=[1.0, 2.0, 4.0, 7.0, 8.0]), "RT15")
    out = _fill_gaps(df, "RT15", 2025)
    assert len(out) == 8
    assert out.attrs["missing_intervals"] == 3
    assert out["price"].iloc[2] == 2.0  # filled
    assert out["price"].iloc[4] == 4.0  # first of the long gap filled
    assert pd.isna(out["price"].iloc[5])  # second left missing


def test_fill_gaps_handles_dst_days():
    # Spring-forward day has 92 fifteen-minute intervals, fall-back day has 100.
    for day, expected in [("2025-03-09", 92), ("2025-11-02", 100)]:
        start = pd.Timestamp(day, tz="US/Central")
        end = start + pd.Timedelta("30h")
        utc = pd.date_range(start.tz_convert("UTC"), end.tz_convert("UTC"), freq="15min")
        raw = pd.DataFrame({"Interval Start": utc.tz_convert("US/Central"), "Location": "HB_HOUSTON", "SPP": 1.0})
        out = _fill_gaps(_normalize(raw, "RT15"), "RT15", 2025)
        local_day = out["interval_start_local"].dt.strftime("%Y-%m-%d")
        assert (local_day == day).sum() == expected


# --- ERCOT public API path (resource nodes), with mocked responses -----------

from unittest.mock import MagicMock  # noqa: E402

import pytest  # noqa: E402
import requests  # noqa: E402

from data import fetch_prices as fp  # noqa: E402


def _api_rows(day, point="NODE_A", n_hours=24, dst_repeat=False):
    """Rows shaped like ErcotAPI.hit_ercot_api output for np6-905-cd."""
    rows = []
    for hour in range(1, n_hours + 1):
        for interval in range(1, 5):
            rows.append([day, hour, interval, point, "RN", float(hour * 10 + interval), False])
    if dst_repeat:  # fall-back day: hour ending 2 appears again with DSTFlag True
        rows += [[day, 2, i, point, "RN", 900.0 + i, True] for i in range(1, 5)]
    cols = ["DeliveryDate", "DeliveryHour", "DeliveryInterval", "SettlementPoint",
            "SettlementPointType", "SettlementPointPrice", "DSTFlag"]
    return pd.DataFrame(rows, columns=cols)


def _http_error(code):
    resp = requests.Response()
    resp.status_code = code
    return requests.HTTPError(f"{code}", response=resp)


def test_api_rows_become_utc_intervals_with_hour_ending_offset():
    api = MagicMock()
    api.hit_ercot_api.return_value = _api_rows("2025-06-01")
    df = fp._hit_api(api, "RT15", "2025-06-01", "2025-06-01", settlementPoint="NODE_A")
    assert len(df) == 96
    # Hour ending 1, interval 1 starts at local midnight (CDT = UTC-5).
    assert df["interval_start_utc"].iloc[0] == pd.Timestamp("2025-06-01 05:00", tz="UTC")
    assert df["price"].iloc[0] == 11.0
    assert set(df.columns) == {"interval_start_utc", "location", "market", "price"}
    args, kwargs = api.hit_ercot_api.call_args
    assert args[0] == fp.API_ENDPOINTS["RT15"]
    assert kwargs == {"deliveryDateFrom": "2025-06-01", "deliveryDateTo": "2025-06-01", "settlementPoint": "NODE_A"}


def test_api_fall_back_day_keeps_repeated_hour():
    api = MagicMock()
    api.hit_ercot_api.return_value = _api_rows("2025-11-02", dst_repeat=True)
    df = fp._hit_api(api, "RT15", "2025-11-02", "2025-11-02")
    assert len(df) == 100
    assert df["interval_start_utc"].is_unique
    local = df["interval_start_utc"].dt.tz_convert("US/Central")
    assert (local.dt.strftime("%Y-%m-%d") == "2025-11-02").all()


def test_api_retries_on_bot_protection_403(monkeypatch):
    monkeypatch.setattr(fp.time, "sleep", lambda s: None)
    api = MagicMock()
    api.hit_ercot_api.side_effect = [_http_error(403), _http_error(429), _api_rows("2025-06-01")]
    df = fp._hit_api(api, "RT15", "2025-06-01", "2025-06-01")
    assert len(df) == 96 and api.hit_ercot_api.call_count == 3


def test_api_does_not_retry_other_errors(monkeypatch):
    monkeypatch.setattr(fp.time, "sleep", lambda s: None)
    api = MagicMock()
    api.hit_ercot_api.side_effect = _http_error(401)
    with pytest.raises(requests.HTTPError):
        fp._hit_api(api, "RT15", "2025-06-01", "2025-06-01")
    assert api.hit_ercot_api.call_count == 1


def test_download_api_requests_one_month_at_a_time(monkeypatch):
    api = MagicMock()
    api.hit_ercot_api.side_effect = lambda ep, deliveryDateFrom, deliveryDateTo, **kw: _api_rows(deliveryDateFrom)
    df = fp._download_api("NODE_A", 2024, "RT15", api=api)
    calls = [c.kwargs for c in api.hit_ercot_api.call_args_list]
    assert len(calls) == 12
    assert calls[0]["deliveryDateFrom"] == "2024-01-01" and calls[0]["deliveryDateTo"] == "2024-01-31"
    assert calls[1]["deliveryDateTo"] == "2024-02-29"  # leap year
    assert all(c["settlementPoint"] == "NODE_A" for c in calls)
    assert len(df) == 12 * 96 and df["interval_start_utc"].is_monotonic_increasing


def test_download_api_stops_at_today_for_current_year(monkeypatch):
    api = MagicMock()
    api.hit_ercot_api.side_effect = lambda ep, deliveryDateFrom, deliveryDateTo, **kw: _api_rows(deliveryDateFrom)
    real_now = pd.Timestamp.now
    monkeypatch.setattr(pd.Timestamp, "now", lambda tz=None: pd.Timestamp("2026-03-15 10:00", tz=tz))
    try:
        fp._download_api("NODE_A", 2026, "RT15", api=api)
    finally:
        monkeypatch.setattr(pd.Timestamp, "now", real_now)
    calls = [c.kwargs for c in api.hit_ercot_api.call_args_list]
    assert len(calls) == 3 and calls[-1]["deliveryDateTo"] == "2026-03-15"


def test_api_day_ahead_hourly_rows():
    api = MagicMock()
    api.hit_ercot_api.return_value = pd.DataFrame(
        {"DeliveryDate": "2025-06-01", "HourEnding": [f"{h:02d}:00" for h in range(1, 25)],
         "SettlementPoint": "NODE_A", "SettlementPointPrice": [float(h) for h in range(24)], "DSTFlag": False}
    )
    df = fp._hit_api(api, "DA", "2025-06-01", "2025-06-01")
    assert len(df) == 24 and (df["market"] == "DA").all()
    assert df["interval_start_utc"].iloc[0] == pd.Timestamp("2025-06-01 05:00", tz="UTC")


def test_fetch_routes_nodes_to_api_and_caches(monkeypatch, tmp_path):
    monkeypatch.setattr(fp, "RAW_DIR", tmp_path)
    calls = []

    def fake(location, year, market, api=None):
        calls.append(location)
        return fp._hit_api(MagicMock(hit_ercot_api=MagicMock(return_value=_api_rows(f"{year}-01-01", location))),
                           market, "", "")

    monkeypatch.setattr(fp, "_download_api", fake)
    df = fp.fetch("NODE_A", 2025)
    assert (tmp_path / "RT15_NODE_A_2025.parquet").exists()
    assert len(df) == 96 and df["location"].eq("NODE_A").all()
    fp.fetch("NODE_A", 2025)
    assert calls == ["NODE_A"]  # second call served from cache


def test_missing_credentials_raise_clear_error(monkeypatch):
    for k in fp.API_ENV:
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(RuntimeError, match="ERCOT_API_USERNAME"):
        fp._api_client()


def test_node_sample_filters_resource_nodes_and_caches(monkeypatch, tmp_path):
    monkeypatch.setattr(fp, "RAW_DIR", tmp_path)
    api = MagicMock()
    api.hit_ercot_api.return_value = pd.concat([_api_rows("2025-08-01", "N1"), _api_rows("2025-08-01", "N2")])
    df = fp.fetch_node_sample(2025, 8, api=api)
    kw = api.hit_ercot_api.call_args.kwargs
    assert kw == {"deliveryDateFrom": "2025-08-01", "deliveryDateTo": "2025-08-31", "settlementPointType": "RN"}
    assert sorted(df["location"].unique()) == ["N1", "N2"]
    assert (tmp_path / "RT15_RN_2025-08.parquet").exists()
