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
