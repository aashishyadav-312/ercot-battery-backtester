"""ERCOT 4CP intervals and June-September daily system peaks, one JSON file per year.

Sources (no guessed report IDs; all checked on ercot.com on 2026-11-05):

- Official 4CP intervals: ERCOT "Four Coincident Peak Calculations", report type 13037
  (https://www.ercot.com/mktinfo/data_agg/4cp). One xlsx a year, published late November.
  Its header row names the June, July, August and September intervals (for example
  "June 6/19/2025 17:00"); the rows are each distribution service provider's (DSP) load at
  those intervals. Their sum is the ERCOT 4CP load for that month.
- Hourly system load: ERCOT hourly load data archives (https://www.ercot.com/gridinfo/load/load_hist),
  read with gridstatus Ercot.get_hourly_load_post_settlements, for full years. For a year with no
  archive yet, the ERCOT public API report NP6-345-CD "Actual System Load by Weather Zone"
  (hour ending, needs the ERCOT_API_* credentials used by data/fetch_prices.py).

When ERCOT has not yet published a year's 4CP report (2026 until late November 2026), the 4CP
"interval" is computed as the peak hour of each month from hourly load and marked
status "computed", resolution_minutes 60. ERCOT measures 4CP on 15-minute intervals, so a
computed year is an approximation; re-run this script after ERCOT publishes.

Times in ERCOT reports are interval ending, US/Central (ERCOT convention). The script checks this
against hourly load on each official year and stores the result in `checks.hourly_peak_vs_official`.
On 2023-2025 the hourly peak is on the official day in 9 of 12 months, but hourly data cannot settle
interval ending against interval beginning (the hourly peak sits in the hour before or after the label
about equally often). The engine therefore covers both readings (see datacenter_rules.json).

CLI:
    python -m data.fetch_fourcp                 # 2023 to the current year
    python -m data.fetch_fourcp --year 2026 --refresh
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

log = logging.getLogger(__name__)

REPORT_TYPE_ID = 13037
LIST_URL = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId={rtid}"
DOWNLOAD_URL = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={doc_id}"
LOAD_ENDPOINT = "/np6-345-cd/act_sys_load_by_wzn"
TZ = "US/Central"
MONTHS = (6, 7, 8, 9)
RAW_DIR = Path(__file__).resolve().parent / "raw" / "fourcp"
OUT_DIR = Path(__file__).resolve().parent.parent / "results" / "v4" / "fourcp"

SOURCES = {
    "fourcp_report": "https://www.ercot.com/mktinfo/data_agg/4cp",
    "fourcp_report_list": LIST_URL.format(rtid=REPORT_TYPE_ID),
    "hourly_load_archive": "https://www.ercot.com/gridinfo/load/load_hist",
    "hourly_load_api": "https://apiexplorer.ercot.com/ (NP6-345-CD act_sys_load_by_wzn)",
}

_HEADER = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})")


# --- official report ---------------------------------------------------------------------------


def list_reports(session=requests) -> list[dict]:
    """ERCOT's document list for report type 13037, newest first."""
    r = session.get(LIST_URL.format(rtid=REPORT_TYPE_ID), timeout=(10, 60))
    r.raise_for_status()
    docs = r.json()["ListDocsByRptTypeRes"]["DocumentList"]
    return [d["Document"] for d in docs]


def report_for_year(docs: list[dict], year: int) -> dict | None:
    """The report for a 4CP year: the latest document named 4CP<year>MMDD."""
    mine = [d for d in docs if re.fullmatch(rf"4CP{year}\d{{4}}", d.get("FriendlyName", ""))]
    return max(mine, key=lambda d: d["PublishDate"]) if mine else None


def parse_interval_label(label: str) -> pd.Timestamp:
    """'June \\n6/19/2025 17:00 ' -> tz-aware interval END in US/Central."""
    m = _HEADER.search(str(label))
    if not m:
        raise ValueError(f"no date and time in 4CP header {label!r}")
    mo, d, y, h, mi = (int(x) for x in m.groups())
    return pd.Timestamp(year=y, month=mo, day=d, hour=h, minute=mi).tz_localize(TZ)


def parse_report(blob: bytes) -> list[dict]:
    """Official 4CP intervals and the ERCOT 4CP load (sum of DSP rows) for each month."""
    import openpyxl

    ws = openpyxl.load_workbook(io.BytesIO(blob), read_only=True, data_only=False).worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    header_i = next(i for i, r in enumerate(rows) if r and r[0] == "TDSP Code")
    header = rows[header_i]
    cols = [j for j, c in enumerate(header) if isinstance(c, str) and _HEADER.search(c)]
    if len(cols) != 4:
        raise ValueError(f"expected 4 interval columns, found {len(cols)}")
    sums = [0.0] * 4
    for r in rows[header_i + 1 :]:
        # DSP rows have a numeric TDSP code; the Total row and notes do not.
        if not r or not isinstance(r[0], (int, float)):
            continue
        for k, j in enumerate(cols):
            if isinstance(r[j], (int, float)):
                sums[k] += float(r[j])
    out = []
    for k, j in enumerate(cols):
        end = parse_interval_label(header[j])
        start = end - pd.Timedelta(minutes=15)
        out.append(
            {
                "month": int(end.month),
                "label": re.sub(r"\s+", " ", str(header[j])).strip(),
                "interval_ending_local": end.strftime("%Y-%m-%dT%H:%M"),
                "start_utc": start.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end_utc": end.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
                "resolution_minutes": 15,
                "ercot_4cp_mw": round(sums[k], 3),
            }
        )
    if [x["month"] for x in out] != list(MONTHS):
        raise ValueError(f"4CP months are {[x['month'] for x in out]}, expected June to September")
    return out


def fetch_report(year: int, refresh: bool = False, docs: list[dict] | None = None) -> bytes | None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache = RAW_DIR / f"4CP_{year}.xlsx"
    if cache.exists() and not refresh:
        return cache.read_bytes()
    doc = report_for_year(docs if docs is not None else list_reports(), year)
    if doc is None:
        return None
    r = requests.get(DOWNLOAD_URL.format(doc_id=doc["DocID"]), timeout=(10, 120))
    r.raise_for_status()
    cache.write_bytes(r.content)
    return r.content


# --- hourly load -------------------------------------------------------------------------------


def _api_load(year: int) -> pd.DataFrame:
    """NP6-345-CD for June to September, normalized to interval_start (US/Central) and load_mw."""
    from data.fetch_prices import _api_client, _throttle
    from gridstatus import Ercot

    api = _api_client()
    frames = []
    for m in MONTHS:
        start = pd.Timestamp(year=year, month=m, day=1)
        end = start + pd.offsets.MonthEnd(0)
        _throttle()
        raw = api.hit_ercot_api(
            LOAD_ENDPOINT, operatingDayFrom=start.strftime("%Y-%m-%d"), operatingDayTo=end.strftime("%Y-%m-%d")
        )
        if raw.empty:
            continue
        raw = raw.rename(columns={"OperatingDay": "DeliveryDate", "HourEnding": "HourEnding"})
        doc = Ercot().parse_doc(raw)
        frames.append(pd.DataFrame({"interval_start": doc["Interval Start"], "load_mw": doc["Total"].astype(float)}))
    if not frames:
        return pd.DataFrame(columns=["interval_start", "load_mw"])
    return pd.concat(frames, ignore_index=True)


def fetch_hourly_load(year: int, refresh: bool = False) -> tuple[pd.DataFrame, str]:
    """Hourly ERCOT load for June to September: (frame, source key). Cached as parquet."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache = RAW_DIR / f"load_{year}.parquet"
    meta = RAW_DIR / f"load_{year}.source"
    if cache.exists() and meta.exists() and not refresh:
        return pd.read_parquet(cache), meta.read_text().strip()
    df, source = None, ""
    try:
        from gridstatus import Ercot

        raw = Ercot().get_hourly_load_post_settlements(f"{year}-01-01")
        df = pd.DataFrame({"interval_start": raw["Interval Start"], "load_mw": raw["ERCOT"].astype(float)})
        source = "hourly_load_archive"
    except Exception as err:  # noqa: BLE001 - no archive yet for the current year
        log.info("no hourly load archive for %s (%s); using the ERCOT API", year, str(err)[:80])
    if df is None or not (df["interval_start"].dt.month == 9).any():
        df, source = _api_load(year), "hourly_load_api"
    df = df[df["interval_start"].dt.month.isin(MONTHS)].reset_index(drop=True)
    df.to_parquet(cache)
    meta.write_text(source)
    return df, source


def daily_peaks(load: pd.DataFrame) -> list[dict]:
    """Daily system peak (MW) and its hour ending (1-24, local) for each June-September day."""
    f = load.copy()
    f["date"] = f["interval_start"].dt.strftime("%Y-%m-%d")
    f["hour_ending"] = f["interval_start"].dt.hour + 1
    idx = f.groupby("date")["load_mw"].idxmax()
    return [
        {"date": r.date, "peak_mw": round(float(r.load_mw), 1), "hour_ending": int(r.hour_ending)}
        for r in f.loc[idx].sort_values("date").itertuples()
    ]


def computed_intervals(load: pd.DataFrame) -> list[dict]:
    """Peak hour of each month, as an hour-long 4CP interval (an approximation of the 15-minute one)."""
    out = []
    for m in MONTHS:
        f = load[load["interval_start"].dt.month == m]
        if f.empty:
            continue
        r = f.loc[f["load_mw"].idxmax()]
        start = pd.Timestamp(r["interval_start"])
        end = start + pd.Timedelta(hours=1)
        out.append(
            {
                "month": m,
                "label": f"peak hour ending {end.strftime('%m/%d/%Y %H:%M')} (computed from hourly load)",
                "interval_ending_local": end.strftime("%Y-%m-%dT%H:%M"),
                "start_utc": start.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end_utc": end.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
                "resolution_minutes": 60,
                "hourly_load_mw": round(float(r["load_mw"]), 1),
            }
        )
    return out


def hourly_peak_check(interval: dict, load: pd.DataFrame) -> dict:
    """Where the month's hourly peak fell, next to the official 15-minute interval (for review)."""
    f = load[load["interval_start"].dt.month == interval["month"]]
    peak_start = pd.Timestamp(f.loc[f["load_mw"].idxmax(), "interval_start"])
    s = pd.Timestamp(interval["start_utc"])
    return {
        "month": interval["month"],
        "official_interval_ending_local": interval["interval_ending_local"],
        "hourly_peak_hour_start_local": peak_start.strftime("%Y-%m-%dT%H:%M"),
        "same_day": peak_start.strftime("%Y-%m-%d") == interval["interval_ending_local"][:10],
        "interval_in_peak_hour": bool(peak_start.tz_convert("UTC") <= s < peak_start.tz_convert("UTC") + pd.Timedelta(hours=1)),
    }


# --- build -------------------------------------------------------------------------------------


def build_year(year: int, refresh: bool = False, docs: list[dict] | None = None) -> dict:
    load, load_source = fetch_hourly_load(year, refresh)
    blob = fetch_report(year, refresh, docs)
    peaks = daily_peaks(load)
    notes = [
        "Times are US/Central, interval ending (ERCOT convention). start_utc and end_utc bound each 4CP interval.",
        "daily_peaks are hourly ERCOT system load (MW), June to September, used by the realistic 4CP strategy.",
    ]
    if blob is not None:
        intervals = parse_report(blob)
        status = "official"
        checks = {"hourly_peak_vs_official": [hourly_peak_check(i, load) for i in intervals]}
        notes.append(
            "ercot_4cp_mw is the sum of the DSP rows in ERCOT's report; it excludes DC tie exports, block load "
            "transfer exports and wholesale storage load (note in the report)."
        )
    else:
        intervals = computed_intervals(load)
        status = "computed"
        checks = {}
        notes.append(
            "ERCOT has not published this year's 4CP report yet. Each interval is the month's peak hour from hourly "
            "load, an approximation of ERCOT's 15-minute 4CP interval. Re-run data/fetch_fourcp.py after ERCOT publishes."
        )
    complete = [i["month"] for i in intervals] == list(MONTHS)
    return {
        "year": year,
        "status": status,
        "complete": complete,
        "intervals": intervals,
        "daily_peaks": peaks,
        "checks": checks,
        "sources": {
            "intervals": SOURCES["fourcp_report"] if status == "official" else SOURCES[load_source],
            "daily_peaks": SOURCES[load_source],
            "report_list": SOURCES["fourcp_report_list"],
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
    docs = list_reports()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for y in years:
        data = build_year(y, a.refresh, docs)
        path = OUT_DIR / f"{y}.json"
        path.write_text(json.dumps(data, indent=1) + "\n")
        log.info(
            "%s: %s, %d intervals, %d daily peaks, checks %s -> %s",
            y, data["status"], len(data["intervals"]), len(data["daily_peaks"]), data["checks"], path,
        )


if __name__ == "__main__":
    main()
