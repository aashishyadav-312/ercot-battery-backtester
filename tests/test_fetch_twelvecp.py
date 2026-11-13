import json
from pathlib import Path

import numpy as np
import pandas as pd

from data import fetch_twelvecp as f

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "results" / "v5" / "twelvecp"
RULES = ROOT / "web" / "src" / "custom" / "config" / "twelvecp_rules.json"
CONTRACT_KEYS = {"month", "start_utc", "end_utc", "interval_ending_local", "resolution_minutes", "ercot_peak_mw"}


def _load(year: int, until: str | None = None, drop_month: int | None = None) -> pd.DataFrame:
    """Hourly load for a year: a daily shape plus a known peak on the 10th of each month at 16:00."""
    idx = pd.date_range(f"{year}-01-01", f"{year + 1}-01-01", freq="h", tz=f.TZ, inclusive="left")
    load = 50000 + 10000 * np.sin(np.pi * (idx.hour - 4) / 24) ** 2 + 100 * idx.month
    df = pd.DataFrame({"interval_start": idx, "load_mw": load.astype(float)})
    for m in range(1, 13):
        df.loc[(idx.month == m) & (idx.day == 10) & (idx.hour == 16), "load_mw"] = 90000.0 + m
    if until:
        df = df[df["interval_start"] < pd.Timestamp(until, tz=f.TZ)]
    if drop_month:
        df = df[~((df["interval_start"].dt.month == drop_month) & (df["interval_start"].dt.day > 3))]
    return df.reset_index(drop=True)


def test_twelve_peaks_for_a_complete_year():
    out = f.build_year(2025, load=_load(2025), now=pd.Timestamp("2026-11-13", tz=f.TZ))
    assert out["complete"] is True
    assert [i["month"] for i in out["intervals"]] == list(range(1, 13))
    for iv in out["intervals"]:
        assert CONTRACT_KEYS <= iv.keys()
        assert iv["resolution_minutes"] == 60
        assert iv["ercot_peak_mw"] == 90000.0 + iv["month"]
        # Peak hour 16:00-17:00 local, interval ending 17:00.
        assert iv["interval_ending_local"] == f"2025-{iv['month']:02d}-10T17:00"
        assert pd.Timestamp(iv["end_utc"]) - pd.Timestamp(iv["start_utc"]) == f.ONE_HOUR
    assert out["intervals"][0]["start_utc"] == "2025-01-10T22:00:00Z"  # CST, UTC-6
    assert out["intervals"][6]["start_utc"] == "2025-07-10T21:00:00Z"  # CDT, UTC-5
    assert len(out["daily_peaks"]) == 365
    assert out["source"].startswith("https://")


def test_twelvecp_year_runs_october_to_september():
    assert f.twelvecp_year(2025, 9) == 2025
    assert f.twelvecp_year(2025, 10) == 2026
    out = f.build_year(2025, load=_load(2025), now=pd.Timestamp("2026-11-13", tz=f.TZ))
    assert [i["twelvecp_year"] for i in out["intervals"]] == [2025] * 9 + [2026] * 3


def test_incomplete_year_keeps_only_finished_months():
    now = pd.Timestamp("2026-11-13 05:00", tz=f.TZ)
    out = f.build_year(2026, load=_load(2026, until="2026-11-13 04:00"), now=now)
    assert out["complete"] is False
    assert out["months_finished"] == list(range(1, 11))
    assert [i["month"] for i in out["intervals"]] == list(range(1, 11))
    assert all(d["date"] < "2026-11-01" for d in out["daily_peaks"])
    assert any("Incomplete year" in n for n in out["notes"])


def test_a_month_with_missing_hours_is_left_out():
    out = f.build_year(2025, load=_load(2025, drop_month=3), now=pd.Timestamp("2026-11-13", tz=f.TZ))
    assert out["complete"] is False
    assert 3 not in [i["month"] for i in out["intervals"]]
    assert len(out["intervals"]) == 11


def test_hours_in_month_handles_dst():
    assert f.hours_in_month(2025, 3) == 743
    assert f.hours_in_month(2025, 11) == 721
    assert f.hours_in_month(2024, 2) == 696


def test_derive_windows_starts_an_hour_early_and_splits_morning_and_evening():
    def year(hours):
        return {"intervals": [{"month": m, "start_utc": pd.Timestamp(f"2025-{m:02d}-10 {h:02d}:00", tz=f.TZ).tz_convert("UTC").isoformat()} for m, h in hours]}

    seasons = [{"season": "winter", "months": [1, 2]}, {"season": "summer", "months": [7, 8]}]
    got = f.derive_windows([year([(1, 7), (2, 18), (7, 16), (8, 17)])], seasons)
    assert got == [
        {"season": "winter", "months": [1, 2], "hours": [[6, 8], [17, 19]]},
        {"season": "summer", "months": [7, 8], "hours": [[15, 18]]},
    ]


def test_committed_files():
    for y in (2023, 2024, 2025):
        d = json.loads((OUT / f"{y}.json").read_text())
        assert d["year"] == y and d["complete"] is True and d["status"] == "computed"
        assert [i["month"] for i in d["intervals"]] == list(range(1, 13))
        assert all(CONTRACT_KEYS <= i.keys() and i["resolution_minutes"] == 60 for i in d["intervals"])
    d = json.loads((OUT / "2026.json").read_text())
    assert d["complete"] is False and len(d["intervals"]) < 12


def test_config_windows_match_the_derivation_from_committed_files():
    rules = json.loads(RULES.read_text())
    rs = rules["realisticStrategy"]
    hist = [json.loads((OUT / f"{y}.json").read_text()) for y in rs["derivedFromYears"]]
    seasons = [{"season": w["season"], "months": w["months"]} for w in rs["windows"]]
    assert f.derive_windows(hist, seasons) == [{**s, "hours": w["hours"]} for s, w in zip(seasons, rs["windows"])]
