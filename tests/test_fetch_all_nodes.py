import io
import zipfile
from unittest.mock import MagicMock

import pandas as pd
import pytest

from data import fetch_all_nodes as fan


def _zip_csv(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("doc.csv", df.to_csv(index=False))
    return buf.getvalue()


def _rt_file(date: str, hour: int, interval: int, prices: dict[str, float], dst: str = "N") -> bytes:
    rows = [
        {
            "DeliveryDate": date, "DeliveryHour": hour, "DeliveryInterval": interval, "SettlementPointName": sp,
            "SettlementPointType": "HU" if sp.startswith("HB_") else "RN", "SettlementPointPrice": p, "DSTFlag": dst,
        }
        for sp, p in prices.items()
    ]
    return _zip_csv(pd.DataFrame(rows))


def test_parse_rt_keeps_month_converts_to_utc_and_latest_repost_wins():
    blobs = [
        (_rt_file("03/10/2025", 1, 1, {"NODE_A": 10.0, "HB_NORTH": 20.0}), "2025-03-10T00:17:00"),
        (_rt_file("03/10/2025", 1, 1, {"NODE_A": 11.0, "HB_NORTH": 20.0}), "2025-03-10T00:30:00"),  # re-post
        (_rt_file("03/10/2025", 1, 2, {"NODE_A": 12.0, "HB_NORTH": 21.0}), "2025-03-10T00:32:00"),
        (_rt_file("02/28/2025", 24, 4, {"NODE_A": 99.0, "HB_NORTH": 99.0}), "2025-03-01T00:02:00"),  # previous month
    ]
    df = fan.parse("RT15", blobs, 2025, 3)
    assert list(df.columns) == fan.COLUMNS
    a = df[df["location"] == "NODE_A"].reset_index(drop=True)
    assert a["price"].tolist() == [11.0, 12.0]
    # DST began Mar 9, so 00:00 CDT on Mar 10 is 05:00 UTC
    assert a["interval_start_utc"].iloc[0] == pd.Timestamp("2025-03-10 05:00", tz="UTC")
    assert a["interval_start_utc"].iloc[1] == pd.Timestamp("2025-03-10 05:15", tz="UTC")
    assert set(df["location_type"].astype(str)) == {"RN", "HU"}


def test_parse_rt_fall_back_hour_is_not_collapsed():
    # Nov 2, 2025: hour ending 2 happens twice; the repeated one is flagged DSTFlag=Y.
    blobs = [
        (_rt_file("11/02/2025", 2, 1, {"NODE_A": 1.0}, "N"), "2025-11-02T01:17:00"),
        (_rt_file("11/02/2025", 2, 1, {"NODE_A": 2.0}, "Y"), "2025-11-02T01:17:30"),
    ]
    df = fan.parse("RT15", blobs, 2025, 11)
    assert len(df) == 2
    assert df["interval_start_utc"].diff().iloc[1] == pd.Timedelta(hours=1)


def test_parse_da():
    rows = [{"DeliveryDate": "01/02/2025", "HourEnding": f"{h:02d}:00", "SettlementPoint": "NODE_A", "SettlementPointPrice": float(h), "DSTFlag": "N"} for h in range(1, 25)]
    df = fan.parse("DA", [(_zip_csv(pd.DataFrame(rows)), "2025-01-01T12:30:00")], 2025, 1)
    assert len(df) == 24
    assert df["interval_start_utc"].iloc[0] == pd.Timestamp("2025-01-02 06:00", tz="UTC")
    assert df["price"].iloc[-1] == 24.0


def test_post_windows_cover_late_and_early_posts():
    start, end = fan._post_window("RT15", 2025, 12)
    assert start == pd.Timestamp("2025-12-01") and end > pd.Timestamp("2026-01-01")
    start, end = fan._post_window("DA", 2025, 1)
    assert start < pd.Timestamp("2025-01-01")  # DA for Jan 1 posts on Dec 31


def test_download_docs_batches_and_checks_every_doc(monkeypatch):
    monkeypatch.setattr(fan, "_throttle", lambda: None)
    monkeypatch.setattr(fan, "BATCH", 2)

    def fake_call(url, api_params=None, parse_json=True, method="GET"):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for d in api_params["docIds"]:
                z.writestr(f"{d}.cdr.x.zip", b"payload-" + d.encode())
        return buf.getvalue()

    api = MagicMock()
    api.make_api_call.side_effect = fake_call
    files = fan.download_docs(api, "np6-905-cd", ["1", "2", "3"])
    assert files == {"1": b"payload-1", "2": b"payload-2", "3": b"payload-3"}
    assert api.make_api_call.call_count == 2


def test_fail_fast_on_403(monkeypatch):
    import requests

    monkeypatch.setattr(fan, "_throttle", lambda: None)
    monkeypatch.setenv("ERCOT_FAIL_FAST", "1")
    resp = MagicMock(status_code=403)

    def refuse():
        raise requests.HTTPError(response=resp)

    from data.fetch_prices import ErcotBlockedError

    with pytest.raises(ErcotBlockedError):
        fan._call(refuse, "test")


def test_parse_rt_newest_first_listing_keeps_each_price_on_its_interval():
    # The archive lists files newest first; timestamps must follow each file's own delivery interval.
    blobs = [
        (_rt_file("01/31/2025", 24, 4, {"NODE_A": 3.0}), "2025-02-01T00:02:00"),
        (_rt_file("01/31/2025", 24, 3, {"NODE_A": 2.0}), "2025-01-31T23:47:00"),
        (_rt_file("01/01/2025", 1, 1, {"NODE_A": 1.0}), "2025-01-01T00:17:00"),
    ]
    df = fan.parse("RT15", blobs, 2025, 1).set_index("interval_start_utc")["price"]
    assert df[pd.Timestamp("2025-01-01 06:00", tz="UTC")] == 1.0
    assert df[pd.Timestamp("2025-02-01 05:30", tz="UTC")] == 2.0
    assert df[pd.Timestamp("2025-02-01 05:45", tz="UTC")] == 3.0
