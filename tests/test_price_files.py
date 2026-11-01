import gzip

import numpy as np
import pandas as pd
import pytest

from data import price_files


def _frame(start: str, periods: int, freq: str, prices) -> pd.DataFrame:
    utc = pd.date_range(pd.Timestamp(start, tz="US/Central").tz_convert("UTC"), periods=periods, freq=freq)
    return pd.DataFrame(
        {"interval_start_utc": utc, "interval_start_local": utc.tz_convert("US/Central"), "price": prices}
    )


def test_round_trip_is_exact_and_keeps_gaps(tmp_path):
    rt_prices = np.round(np.random.default_rng(0).normal(40, 300, 400), 2)
    rt_prices[[5, 6, 7]] = np.nan
    rt = _frame("2025-11-01", 400, "15min", rt_prices)  # spans the 100-interval DST day
    da = _frame("2025-11-01", 100, "1h", np.round(np.linspace(-20, 5000, 100), 2))
    path = tmp_path / "X_2025.ebp"
    price_files.write(path, "X", 2025, rt, da)

    header, rt2, da2 = price_files.read(path)
    assert header["location"] == "X" and header["rt"]["count"] == 400
    np.testing.assert_array_equal(rt2["price"].to_numpy(), rt_prices)
    np.testing.assert_array_equal(da2["price"].to_numpy(), da["price"].to_numpy())
    pd.testing.assert_series_equal(rt2["interval_start_utc"], rt["interval_start_utc"], check_freq=False)
    assert (rt2["interval_start_local"] == rt["interval_start_local"]).all()


def test_files_are_deterministic():
    rt = _frame("2025-01-01", 8, "15min", [1.0] * 8)
    da = _frame("2025-01-01", 2, "1h", [2.0, 3.0])
    a = price_files.encode("X", 2025, rt, da)
    assert a == price_files.encode("X", 2025, rt, da)
    assert gzip.decompress(a)[:4] == b"EBP1"


def test_rejects_more_than_two_decimals_and_irregular_grids():
    da = _frame("2025-01-01", 2, "1h", [2.0, 3.0])
    with pytest.raises(ValueError, match="two decimals"):
        price_files.encode("X", 2025, _frame("2025-01-01", 2, "15min", [1.001, 2.0]), da)
    rt = _frame("2025-01-01", 3, "15min", [1.0, 2.0, 3.0]).drop(index=1)
    with pytest.raises(ValueError, match="regular"):
        price_files.encode("X", 2025, rt, da)
