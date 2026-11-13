"""ERCOT monthly coincident peaks (12CP screening data) and daily system peaks, one JSON file per year.

The PUCT's Project No. 58000 proposal for publication (approved July 9, 2026) would replace 4CP
with 12CP: the ERCOT system peak demand interval in each of 12 calendar months, measured on a
30-minute interval (proposed 16 TAC §25.192(b)(4)). It is proposed, not adopted (PUCT filings list
checked 2026-11-13; see web/src/custom/config/twelvecp_rules.json).

Source: the same hourly ERCOT system load fetch_fourcp.py uses for years ERCOT has not published:
the ERCOT hourly load data archives (https://www.ercot.com/gridinfo/load/load_hist, read with
gridstatus Ercot.get_hourly_load_post_settlements), or, when a year has no archive, the ERCOT public
API report NP6-345-CD "Actual System Load by Weather Zone" (needs the ERCOT_API_* credentials used
by data/fetch_prices.py).

The source is hourly, so each monthly peak is the month's peak hour: resolution_minutes is 60, not
the proposal's 30. The 30-minute peak lies inside or next to that hour; this file does not claim it.

Files are calendar years (January to December) so they line up with the calendar-year price files
the engine dispatches on. The proposal's 12CP year runs October 1 to September 30; each interval
carries twelvecp_year, the 12CP year it would fall in. A year with months still running is written
with complete: false and only its finished months.

CLI:
    python -m data.fetch_twelvecp                 # 2023 to the current year
    python -m data.fetch_twelvecp --year 2026 --refresh
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

LOAD_ENDPOINT = "/np6-345-cd/act_sys_load_by_wzn"
TZ = "US/Central"
MONTHS = tuple(range(1, 13))
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = Path(__file__).resolve().parent / "raw" / "twelvecp"
OUT_DIR = ROOT / "results" / "v5" / "twelvecp"
FOURCP_DIR = ROOT / "results" / "v4" / "fourcp"
RULES = ROOT / "web" / "src" / "custom" / "config" / "twelvecp_rules.json"

SOURCES = {
    "hourly_load_archive": "https://www.ercot.com/gridinfo/load/load_hist",
    "hourly_load_api": "https://apiexplorer.ercot.com/ (NP6-345-CD act_sys_load_by_wzn)",
    "proposal": "https://www.ercot.com/files/docs/2026/07/23/PUCT-Project-58000-pfp_adopted-9-July-2026.pdf",
}
# Hours a month may miss (gaps, DST) and still count as finished.
MAX_MISSING_HOURS = 2
# ONE_HOUR warns under pandas 3 with recent NumPy; seconds with a unit does not.
ONE_HOUR = pd.Timedelta(3600, unit="s")


# --- hourly load -------------------------------------------------------------------------------


def _api_load(year: int) -> pd.DataFrame:
    """NP6-345-CD for every month of the year, normalized to interval_start (US/Central) and load_mw."""
    from data.fetch_prices import _api_client, _throttle
    from gridstatus import Ercot

    api = _api_client()
    frames = []
    for m in MONTHS:
        start = pd.Timestamp(year=year, month=m, day=1)
        if start > pd.Timestamp.now():
            break
        end = start + pd.offsets.MonthEnd(0)
        _throttle()
        raw = api.hit_ercot_api(
            LOAD_ENDPOINT, operatingDayFrom=start.strftime("%Y-%m-%d"), operatingDayTo=end.strftime("%Y-%m-%d")
        )
        if raw.empty:
            continue
        raw = raw.rename(columns={"OperatingDay": "DeliveryDate"})
        doc = Ercot().parse_doc(raw)
        frames.append(pd.DataFrame({"interval_start": doc["Interval Start"], "load_mw": doc["Total"].astype(float)}))
    if not frames:
        return pd.DataFrame(columns=["interval_start", "load_mw"])
    return pd.concat(frames, ignore_index=True)


def fetch_hourly_load(year: int, refresh: bool = False) -> tuple[pd.DataFrame, str]:
    """Hourly ERCOT load for the whole year: (frame, source key). Cached as parquet."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache = RAW_DIR / f"load_{year}.parquet"
    meta = RAW_DIR / f"load_{year}.source"
    if cache.exists() and meta.exists() and not refresh:
        return pd.read_parquet(cache), meta.read_text().strip()
    df, source = None, ""
    for attempt in range(2):  # the archive page sometimes answers 403 once
        try:
            from gridstatus import Ercot

            raw = Ercot().get_hourly_load_post_settlements(f"{year}-01-01")
            df = pd.DataFrame({"interval_start": raw["Interval Start"], "load_mw": raw["ERCOT"].astype(float)})
            source = "hourly_load_archive"
            break
        except Exception as err:  # noqa: BLE001 - no archive yet, or a transient refusal
            log.info("hourly load archive for %s failed (attempt %d: %s)", year, attempt + 1, str(err)[:80])
    if df is None or df.empty:
        df, source = _api_load(year), "hourly_load_api"
    df = df.dropna(subset=["load_mw"]).reset_index(drop=True)
    df.to_parquet(cache)
    meta.write_text(source)
    return df, source


# --- peaks -------------------------------------------------------------------------------------


def hours_in_month(year: int, month: int) -> int:
    start = pd.Timestamp(year=year, month=month, day=1).tz_localize(TZ)
    end = (start + pd.offsets.MonthBegin(1)).tz_localize(None).tz_localize(TZ)
    return int(round((end - start) / ONE_HOUR))


def finished_months(load: pd.DataFrame, year: int, now: pd.Timestamp | None = None) -> list[int]:
    """Months that have ended (US/Central) and whose hourly load is all there."""
    now = now if now is not None else pd.Timestamp.now(tz=TZ)
    starts = load["interval_start"]
    out = []
    for m in MONTHS:
        month_end = (pd.Timestamp(year=year, month=m, day=1) + pd.offsets.MonthBegin(1)).tz_localize(TZ)
        if month_end > now:
            break
        n = int(((starts.dt.year == year) & (starts.dt.month == m)).sum())
        if n >= hours_in_month(year, m) - MAX_MISSING_HOURS:
            out.append(m)
    return out


def twelvecp_year(year: int, month: int) -> int:
    """The proposal's 12CP year (October 1 to September 30) that a calendar month falls in."""
    return year + 1 if month >= 10 else year


def monthly_peaks(load: pd.DataFrame, year: int, months: list[int]) -> list[dict]:
    """Peak hour of each month, as an hour-long interval (the proposal's interval is 30 minutes)."""
    out = []
    starts = load["interval_start"]
    for m in months:
        f = load[(starts.dt.year == year) & (starts.dt.month == m)]
        i = f["load_mw"].idxmax()
        start = pd.Timestamp(f.at[i, "interval_start"])
        end = start + ONE_HOUR
        end_local = end.tz_convert(TZ)
        out.append(
            {
                "month": m,
                "label": f"peak hour ending {end_local.strftime('%m/%d/%Y %H:%M')} (computed from hourly load)",
                "interval_ending_local": end_local.strftime("%Y-%m-%dT%H:%M"),
                "start_utc": start.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end_utc": end.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
                "resolution_minutes": 60,
                "ercot_peak_mw": round(float(f.at[i, "load_mw"]), 1),
                "twelvecp_year": twelvecp_year(year, m),
            }
        )
    return out


def daily_peaks(load: pd.DataFrame, year: int, months: list[int]) -> list[dict]:
    """Daily system peak (MW) and its hour ending (1-24, local) for each day of the given months."""
    f = load[(load["interval_start"].dt.year == year) & (load["interval_start"].dt.month.isin(months))].copy()
    if f.empty:
        return []
    f["date"] = f["interval_start"].dt.strftime("%Y-%m-%d")
    f["hour_ending"] = f["interval_start"].dt.hour + 1
    idx = f.groupby("date")["load_mw"].idxmax()
    return [
        {"date": r.date, "peak_mw": round(float(r.load_mw), 1), "hour_ending": int(r.hour_ending)}
        for r in f.loc[idx].sort_values("date").itertuples()
    ]


def fourcp_check(intervals: list[dict], year: int) -> list[dict]:
    """June to September: the hourly monthly peak next to ERCOT's official 4CP interval (for review)."""
    path = FOURCP_DIR / f"{year}.json"
    if not path.exists():
        return []
    four = json.loads(path.read_text())
    if four.get("status") != "official":
        return []
    mine = {i["month"]: i for i in intervals}
    out = []
    for iv in four["intervals"]:
        m = mine.get(iv["month"])
        if not m:
            continue
        end = pd.Timestamp(iv["end_utc"])
        out.append(
            {
                "month": iv["month"],
                "official_4cp_interval_ending_local": iv["interval_ending_local"],
                "hourly_peak_interval_ending_local": m["interval_ending_local"],
                "same_day": iv["interval_ending_local"][:10] == m["interval_ending_local"][:10],
                "official_interval_in_peak_hour": bool(pd.Timestamp(m["start_utc"]) < end <= pd.Timestamp(m["end_utc"])),
            }
        )
    return out


# --- hold windows for the realistic strategy ---------------------------------------------------


def peak_hours_by_month(years: list[dict]) -> dict[int, list[int]]:
    """Local start hour of each monthly peak hour, by month, across the given year files."""
    out: dict[int, list[int]] = {}
    for y in years:
        for iv in y["intervals"]:
            start_local = pd.Timestamp(iv["start_utc"]).tz_convert(TZ)
            out.setdefault(iv["month"], []).append(int(start_local.hour))
    return out


def derive_windows(years: list[dict], seasons: list[dict], split_gap_hours: int = 4) -> list[dict]:
    """Hold windows per season: each block starts one hour before the earliest peak hour in it and
    ends at the end of the latest one (the rule the 4CP window follows). Peak hours further apart
    than split_gap_hours form separate blocks (winter has morning and evening peaks)."""
    by_month = peak_hours_by_month(years)
    out = []
    for s in seasons:
        hours = sorted({h for m in s["months"] for h in by_month.get(m, [])})
        blocks: list[list[int]] = []
        for h in hours:
            if blocks and h - blocks[-1][-1] < split_gap_hours:
                blocks[-1].append(h)
            else:
                blocks.append([h])
        out.append({"season": s["season"], "months": s["months"], "hours": [[max(0, b[0] - 1), b[-1] + 1] for b in blocks]})
    return out


# --- build -------------------------------------------------------------------------------------


def build_year(year: int, refresh: bool = False, now: pd.Timestamp | None = None, load: pd.DataFrame | None = None,
               load_source: str = "hourly_load_archive") -> dict:
    if load is None:
        load, load_source = fetch_hourly_load(year, refresh)
    months = finished_months(load, year, now)
    intervals = monthly_peaks(load, year, months)
    complete = months == list(MONTHS)
    peaks_mw = [i["ercot_peak_mw"] for i in intervals]
    notes = [
        "Each interval is the month's peak hour of hourly ERCOT system load (US/Central, interval ending). "
        "The proposal measures each monthly peak on a 30-minute interval; hourly data cannot locate it more "
        "closely than the hour, so resolution_minutes is 60.",
        "Calendar-year file. The proposal's 12CP year runs October 1 to September 30; twelvecp_year names the "
        "12CP year each month falls in.",
        "ercot_peak_mw is total ERCOT hourly load. The proposal's ERCOT 12CP load excludes export flows and "
        "wholesale storage load, so its peak interval can differ.",
        "daily_peaks are hourly ERCOT system load (MW) for every day of the finished months, used by the "
        "realistic 12CP strategy.",
        "Screening data computed from hourly load, not an ERCOT 12CP report (none exists; 12CP is proposed).",
    ]
    if not complete:
        notes.append(f"Incomplete year: {len(months)} of 12 months finished when this file was built.")
    return {
        "year": year,
        "status": "computed",
        "complete": complete,
        "source": SOURCES[load_source],
        "asOf": (now or pd.Timestamp.now(tz=TZ)).strftime("%Y-%m-%d"),
        "months_finished": months,
        "mean_monthly_peak_mw": round(sum(peaks_mw) / len(peaks_mw), 1) if peaks_mw else None,
        "intervals": intervals,
        "daily_peaks": daily_peaks(load, year, months),
        "checks": {"hourly_peak_vs_official_4cp": fourcp_check(intervals, year)},
        "sources": {
            "intervals": SOURCES[load_source],
            "daily_peaks": SOURCES[load_source],
            "proposal": SOURCES["proposal"],
        },
        "notes": notes,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--year", type=int, action="append", help="year(s); default 2023 to the current year")
    p.add_argument("--refresh", action="store_true", help="re-download cached files")
    a = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    years = a.year or list(range(2023, datetime.now().year + 1))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for y in years:
        data = build_year(y, a.refresh)
        path = OUT_DIR / f"{y}.json"
        path.write_text(json.dumps(data, indent=1) + "\n")
        log.info("%s: complete %s, %d intervals, %d daily peaks -> %s", y, data["complete"], len(data["intervals"]),
                 len(data["daily_peaks"]), path)
    if RULES.exists():
        rules = json.loads(RULES.read_text())
        rs = rules["realisticStrategy"]
        hist = [json.loads((OUT_DIR / f"{y}.json").read_text()) for y in rs["derivedFromYears"] if (OUT_DIR / f"{y}.json").exists()]
        derived = derive_windows(hist, [{"season": w["season"], "months": w["months"]} for w in rs["windows"]])
        stored = [{"season": w["season"], "months": w["months"], "hours": w["hours"]} for w in rs["windows"]]
        if derived != stored:
            log.warning("hold windows in %s differ from the ones derived from the data: %s", RULES, derived)


if __name__ == "__main__":
    main()
