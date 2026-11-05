import io
import json
from pathlib import Path

import openpyxl
import pandas as pd
import pytest

from data import fetch_fourcp as f

OUT = Path(__file__).resolve().parent.parent / "results" / "v4" / "fourcp"


def _workbook(headers, rows) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["2025 Four Coincident Peak Load Calculation (MW)"])
    ws.append([])
    ws.append(["TDSP Code", "Load Entity Name", "DUNS NUMBER", *headers, "Average 4CP Load", "Load Ratio Share"])
    for r in rows:
        ws.append(r)
    ws.append(["Total", "=ROUND(SUM(D4:D5),6)"])
    ws.append([None, "* Note: storage loads are excluded."])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


HEADERS = ["June \n6/19/2025 17:00 ", "July\n7/30/2025 17:00", "August\n8/18/2025 17:00", "September\n9/04/2025 17:30"]


def test_parse_interval_label_is_interval_ending_central():
    t = f.parse_interval_label("June \n6/19/2025 17:00 ")
    assert t == pd.Timestamp("2025-06-19 17:00", tz="US/Central")
    with pytest.raises(ValueError):
        f.parse_interval_label("June")


def test_parse_report_sums_dsp_rows_and_sets_15_minute_spans():
    blob = _workbook(HEADERS, [[5, "A", "1", 100.5, 200, 300, 400, "=AVERAGE()", "x"], [7, "B", "2", 0.5, 1, 2, 3, None, None]])
    out = f.parse_report(blob)
    assert [x["month"] for x in out] == [6, 7, 8, 9]
    assert out[0]["ercot_4cp_mw"] == 101.0
    assert out[3]["ercot_4cp_mw"] == 403.0
    # 17:00 CDT ending = 22:00 UTC; the interval starts 15 minutes earlier.
    assert out[0]["end_utc"] == "2025-06-19T22:00:00Z"
    assert out[0]["start_utc"] == "2025-06-19T21:45:00Z"
    assert out[3]["interval_ending_local"] == "2025-09-04T17:30"
    assert all(x["resolution_minutes"] == 15 for x in out)


def test_parse_report_rejects_missing_months():
    with pytest.raises(ValueError):
        f.parse_report(_workbook(HEADERS[:3], [[5, "A", "1", 1, 2, 3]]))


def test_report_for_year_picks_latest_matching_name():
    docs = [
        {"FriendlyName": "4CP20251124", "PublishDate": "2025-11-24T08:38:19-06:00", "DocID": "a"},
        {"FriendlyName": "4CP20251201", "PublishDate": "2025-12-01T08:00:00-06:00", "DocID": "b"},
        {"FriendlyName": "4CP20241125", "PublishDate": "2024-11-25T12:11:04-06:00", "DocID": "c"},
    ]
    assert f.report_for_year(docs, 2025)["DocID"] == "b"
    assert f.report_for_year(docs, 2026) is None


def _load():
    idx = pd.date_range("2026-06-01", "2026-09-30 23:00", freq="h", tz="US/Central")
    mw = [50000 + 1000 * ((t.hour - 17) ** 2 < 2) * (1 + t.day / 100) + t.month for t in idx]
    return pd.DataFrame({"interval_start": idx, "load_mw": mw})


def test_daily_peaks_and_computed_intervals():
    load = _load()
    peaks = f.daily_peaks(load)
    assert len(peaks) == 122
    assert peaks[0]["date"] == "2026-06-01"
    assert peaks[0]["hour_ending"] in (17, 18, 19)
    cps = f.computed_intervals(load)
    assert [c["month"] for c in cps] == [6, 7, 8, 9]
    assert all(c["resolution_minutes"] == 60 for c in cps)
    # The peak hour of June is on the 30th (the day term grows through the month).
    assert cps[0]["interval_ending_local"].startswith("2026-06-30")
    end = pd.Timestamp(cps[0]["end_utc"])
    assert end - pd.Timestamp(cps[0]["start_utc"]) == pd.Timedelta(hours=1)


def test_committed_files_have_sources_and_four_months():
    for y in (2023, 2024, 2025, 2026):
        d = json.loads((OUT / f"{y}.json").read_text())
        assert d["year"] == y and d["complete"]
        assert [i["month"] for i in d["intervals"]] == [6, 7, 8, 9]
        assert d["sources"]["intervals"].startswith("https://")
        assert d["sources"]["daily_peaks"].startswith("https://")
        assert len(d["daily_peaks"]) == 122
        assert d["status"] == ("computed" if y == 2026 else "official")
