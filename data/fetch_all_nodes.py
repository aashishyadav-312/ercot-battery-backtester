"""Bulk-download ERCOT settlement point prices for every settlement point at once.

The per-node path in data/fetch_prices.py asks the ERCOT API for one settlement
point at a time (12 requests per node-year). For all ~700 resource nodes that
would be ~17k requests. ERCOT publishes each report as one small file that
already holds *every* settlement point, so this module downloads those files
instead, through the ERCOT public API's archive endpoints:

* RT: NP6-905-CD "Settlement Point Prices at Resource Nodes, Hubs and Load
  Zones", one file per 15-minute interval (~990 points each, ~35k files a year).
* DA: NP4-190-CD "DAM Settlement Point Prices", one file per operating day
  (every settlement point, 24 hours).

Files are listed by post time (GET /archive/{report}) and fetched up to 1,000
at a time (POST /archive/{report}/download), so a month of RT prices is about
three listing pages and three downloads. Requests are spaced to the API's rate
limit and retried with backoff; with ERCOT_FAIL_FAST=1 a 403 stops at once,
exactly as in data/fetch_prices.py.

Each month is cached as data/raw/{market}_ALLSP_{year}-{month}.parquet with
columns interval_start_utc, location, location_type (RT only), price. A month is
written only once complete, so an interrupted run resumes where it stopped.

CLI:
    python -m data.fetch_all_nodes --year 2025              # RT and DA, all months
    python -m data.fetch_all_nodes --year 2025 --market DA
"""

from __future__ import annotations

import argparse
import io
import logging
import time
import zipfile

import pandas as pd

from data.fetch_prices import (
    RAW_DIR,
    _api_client,
    _blocked_error,
    _fail_fast,
    _is_403,
    _retryable,
    _throttle,
)

log = logging.getLogger(__name__)

BASE = "https://api.ercot.com/api/public-reports/archive"
REPORTS = {"RT15": "np6-905-cd", "DA": "np4-190-cd"}
# The download endpoint accepts up to 1,000 ids, but 1,000 RT files (~7 MB) can
# outrun gridstatus' 15 s read timeout; 250 files (~2 MB) download in a few seconds.
BATCH = 250
PAGE = 1000
COLUMNS = ["interval_start_utc", "location", "location_type", "price"]


def month_path(market: str, year: int, month: int):
    return RAW_DIR / f"{market}_ALLSP_{year}-{month:02d}.parquet"


def _call(fn, what: str, retries: int = 5):
    """Run one API call with the rate-limit spacing and backoff used by fetch_prices._hit_api."""
    for attempt in range(retries + 1):
        _throttle()
        try:
            return fn()
        except Exception as err:  # noqa: BLE001 - filtered by _retryable
            if not _retryable(err) or attempt == retries:
                raise
            if _fail_fast() and _is_403(err):
                raise _blocked_error(f"the ERCOT archive API ({what})") from err
            wait = 10 * 2**attempt
            log.warning("ERCOT archive refused %s (%s); retrying in %ds", what, str(err)[:60], wait)
            time.sleep(wait)


def list_docs(api, report: str, post_from: pd.Timestamp, post_to: pd.Timestamp) -> list[tuple[str, str]]:
    """(doc id, post time) for every archived file posted in [post_from, post_to)."""
    out, page, pages = [], 1, 1
    while page <= pages:
        params = {
            "postDatetimeFrom": f"{post_from:%Y-%m-%dT%H:%M:%S}",
            "postDatetimeTo": f"{post_to:%Y-%m-%dT%H:%M:%S}",
            "size": PAGE,
            "page": page,
        }
        resp = _call(lambda: api.make_api_call(f"{BASE}/{report}", api_params=params), f"{report} list page {page}")
        pages = resp["_meta"]["totalPages"]
        for a in resp["archives"]:
            out.append((str(a["docId"]), a["postDatetime"]))
        page += 1
    return out


def download_docs(api, report: str, doc_ids: list[str]) -> dict[str, bytes]:
    """Inner zip bytes for each doc id, fetched up to BATCH ids per request."""
    files: dict[str, bytes] = {}
    for i in range(0, len(doc_ids), BATCH):
        batch = doc_ids[i : i + BATCH]
        blob = _call(
            lambda: api.make_api_call(
                f"{BASE}/{report}/download", api_params={"docIds": batch}, parse_json=False, method="POST"
            ),
            f"{report} download {i // BATCH + 1}",
        )
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            for name in z.namelist():
                files[name.split(".")[0]] = z.read(name)
        log.info("%s: downloaded %d of %d files", report, min(i + BATCH, len(doc_ids)), len(doc_ids))
    missing = set(doc_ids) - set(files)
    if missing:
        raise RuntimeError(f"{report}: {len(missing)} documents missing from the bulk download")
    return files


def _read(blob: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(blob), compression="zip")


def _interval_starts(keys: pd.DataFrame) -> pd.Series:
    """UTC interval start for unique (DeliveryDate, hour[, interval], DSTFlag) rows.

    Uses gridstatus' Ercot.parse_doc, the same parser data/fetch_prices.py uses,
    so DST days are handled identically (the repeated fall-back hour is DSTFlag Y).
    parse_doc may reorder rows, so each row carries an id through it and the
    result is returned in the input order.
    """
    from gridstatus import Ercot

    doc = keys.copy().reset_index(drop=True)
    doc["_row"] = range(len(doc))
    parsed = Ercot().parse_doc(doc).set_index("_row").sort_index()
    if len(parsed) != len(doc):
        raise RuntimeError("time parsing changed the number of rows")
    return parsed["Interval Start"].dt.tz_convert("UTC")


def parse(market: str, blobs: list[tuple[bytes, str]], year: int, month: int) -> pd.DataFrame:
    """Turn archive files into tidy rows for delivery dates inside the month.

    `blobs` is [(zip bytes, post time)]. If ERCOT re-posted a file for the same
    interval, the latest post wins.
    """
    frames = []
    for blob, posted in blobs:
        df = _read(blob)
        df["posted"] = posted
        frames.append(df)
    raw = pd.concat(frames, ignore_index=True)
    raw = raw.rename(columns={"SettlementPointName": "SettlementPoint"})
    dates = pd.to_datetime(raw["DeliveryDate"], format="%m/%d/%Y")
    raw = raw[(dates.dt.year == year) & (dates.dt.month == month)]

    if market == "RT15":
        key_cols = ["DeliveryDate", "DeliveryHour", "DeliveryInterval", "DSTFlag"]
    else:
        key_cols = ["DeliveryDate", "HourEnding", "DSTFlag"]
    keys = raw[key_cols].drop_duplicates().reset_index(drop=True)
    keys["interval_start_utc"] = _interval_starts(keys[key_cols]).to_numpy()
    raw = raw.merge(keys, on=key_cols, how="left")

    out = pd.DataFrame(
        {
            "interval_start_utc": raw["interval_start_utc"],
            "location": raw["SettlementPoint"].astype(str),
            "location_type": raw["SettlementPointType"].astype(str) if "SettlementPointType" in raw else None,
            "price": raw["SettlementPointPrice"].astype(float),
            "posted": raw["posted"],
        }
    )
    out = out.sort_values("posted").drop_duplicates(["location", "interval_start_utc"], keep="last")
    out = out.drop(columns="posted").sort_values(["location", "interval_start_utc"]).reset_index(drop=True)
    out["location"] = out["location"].astype("category")
    out["location_type"] = out["location_type"].astype("category")
    return out[COLUMNS]


def _post_window(market: str, year: int, month: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Post-time range (ERCOT local time) that contains every file for the month's delivery dates.

    RT files post a few minutes after their interval, so the last interval of the
    month posts just after midnight. DA files post around 13:00 the day before.
    """
    first = pd.Timestamp(year=year, month=month, day=1)
    nxt = first + pd.offsets.MonthBegin(1)
    if market == "RT15":
        return first, nxt + pd.Timedelta(hours=2)
    return first - pd.Timedelta(days=2), nxt


def fetch_month(year: int, month: int, market: str = "RT15", refresh: bool = False, api=None) -> pd.DataFrame:
    """Every settlement point's prices for one month, from cache or the ERCOT archive."""
    path = month_path(market, year, month)
    if path.exists() and not refresh:
        return pd.read_parquet(path)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    api = api or _api_client()
    report = REPORTS[market]
    t0 = time.monotonic()
    docs = list_docs(api, report, *_post_window(market, year, month))
    if not docs:
        raise RuntimeError(f"No {report} archive files for {year}-{month:02d}")
    files = download_docs(api, report, [d for d, _ in docs])
    df = parse(market, [(files[d], posted) for d, posted in docs], year, month)
    df.to_parquet(path, index=False)
    log.info(
        "%s %d-%02d: %d files, %d points, %d rows in %.0fs -> %s (%.1f MB)",
        market, year, month, len(docs), df["location"].nunique(), len(df), time.monotonic() - t0,
        path.name, path.stat().st_size / 1e6,
    )
    return df


def months_available(year: int) -> list[int]:
    """Months of `year` whose last day is complete (yesterday or earlier, Central time)."""
    yesterday = pd.Timestamp.now(tz="US/Central").tz_localize(None).normalize() - pd.Timedelta(days=1)
    return [m for m in range(1, 13) if pd.Timestamp(year=year, month=m, day=1) + pd.offsets.MonthEnd(0) <= yesterday]


def fetch_year(year: int, market: str = "RT15", refresh: bool = False) -> pd.DataFrame:
    """Concatenate the monthly caches for a year, downloading missing months first."""
    api = None
    parts = []
    for m in months_available(year):
        if not month_path(market, year, m).exists() or refresh:
            api = api or _api_client()
        parts.append(fetch_month(year, m, market, refresh, api))
    return pd.concat(parts, ignore_index=True)


def quiet_gridstatus() -> None:
    """gridstatus logs every request at INFO, including all 1,000 document ids."""
    import gridstatus.ercot_api.ercot_api  # noqa: F401 - registers its loggers

    for name in list(logging.root.manager.loggerDict):
        if name.startswith("gridstatus"):
            logging.getLogger(name).setLevel(logging.WARNING)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--market", choices=["RT15", "DA", "both"], default="both")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    quiet_gridstatus()
    t0 = time.monotonic()
    for market in (["RT15", "DA"] if args.market == "both" else [args.market]):
        for m in months_available(args.year):
            fetch_month(args.year, m, market, args.refresh)
    size = sum(p.stat().st_size for p in RAW_DIR.glob(f"*_ALLSP_{args.year}-*.parquet"))
    log.info("Done in %.1f min; cache %.0f MB", (time.monotonic() - t0) / 60, size / 1e6)


if __name__ == "__main__":
    main()
