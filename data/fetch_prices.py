"""Download ERCOT settlement point prices with gridstatus and cache them as parquet.

Hubs and load zones come from ERCOT's public annual archives (no login needed):
NP6-785-ER for real-time 15-minute SPPs and NP4-180-ER for day-ahead hourly SPPs.
One download covers every hub and load zone for the year, so it is cached once
as data/raw/{market}_ALL_{year}.parquet and split per location from there.

Resource nodes are not in the annual archives. They come from the ERCOT public
API (RT: NP6-905-CD, DA: NP4-190-CD), filtered server-side by settlementPoint and
requested a month at a time, so a node-year is 12 small requests. This needs
ERCOT_API_USERNAME, ERCOT_API_PASSWORD and ERCOT_API_SUBSCRIPTION_KEY in the
environment. fetch_node_sample() pulls one month of every resource node, which
scripts/rank_nodes.py uses to pick volatile and typical nodes.

Output columns: interval_start_utc, interval_start_local (US/Central), location,
market, price ($/MWh). Timestamps are stored in UTC so DST days are unambiguous.

CLI:
    python -m data.fetch_prices --location HB_HOUSTON --year 2025 --market RT15
"""

from __future__ import annotations

import argparse
import logging
import os
import time
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

RAW_DIR = Path(__file__).resolve().parent / "raw"
TZ = "US/Central"
MARKETS = {"RT15": "15min", "DA": "1h"}
COLUMNS = ["interval_start_utc", "interval_start_local", "location", "market", "price"]


def is_hub_or_zone(location: str) -> bool:
    return location.startswith(("HB_", "LZ_"))


def _normalize(raw: pd.DataFrame, market: str) -> pd.DataFrame:
    """Map a gridstatus SPP frame to our columns and drop duplicate intervals."""
    start = raw["Interval Start"]
    df = pd.DataFrame(
        {
            "interval_start_utc": start.dt.tz_convert("UTC"),
            "location": raw["Location"].astype(str),
            "market": market,
            "price": raw["SPP"].astype(float),
        }
    )
    # Load zones appear twice in the annual archives (load-weighted and
    # energy-weighted), and gridstatus labels both "Load Zone". A location whose
    # duplicate rows disagree on price can't be resolved, so drop it rather than
    # guess. Identical duplicates are collapsed.
    key = ["location", "interval_start_utc"]
    conflicting = df[df.duplicated(key, keep=False)].groupby(key)["price"].nunique()
    bad = sorted(conflicting[conflicting > 1].index.get_level_values("location").unique())
    if bad:
        log.warning("Excluding locations with conflicting duplicate prices: %s", ", ".join(bad))
        df = df[~df["location"].isin(bad)]
    before = len(df)
    df = df.drop_duplicates(key)
    if len(df) < before:
        log.info("Collapsed %d identical duplicate rows", before - len(df))
    return df.sort_values(key).reset_index(drop=True)


def _fail_fast() -> bool:
    """CI sets ERCOT_FAIL_FAST=1 so a blocked runner stops instead of backing off."""
    return os.environ.get("ERCOT_FAIL_FAST") == "1"


class ErcotBlockedError(RuntimeError):
    """ERCOT refused with HTTP 403 and ERCOT_FAIL_FAST is set; callers should abort."""


def _blocked_error(where: str) -> ErcotBlockedError:
    return ErcotBlockedError(
        f"ERCOT answered HTTP 403 on {where}. ERCOT's bot protection often blocks cloud and "
        "GitHub-hosted runner IP ranges, so retrying will not help. Run the refresh from a "
        "machine that can reach ERCOT (python -m scripts.run_grid ...) and commit the results."
    )


def _download_archive(year: int, market: str, retries: int = 4) -> pd.DataFrame:
    """Download one annual archive, backing off when ERCOT rate-limits (HTTP 403)."""
    import requests
    from gridstatus import Ercot

    ercot = Ercot()
    for attempt in range(retries + 1):
        try:
            raw = ercot.get_rtm_spp(year) if market == "RT15" else ercot.get_dam_spp(year)
            return _normalize(raw, market)
        except requests.HTTPError as err:
            if err.response is None or err.response.status_code != 403:
                raise
            if _fail_fast():
                raise _blocked_error("the public archive download") from err
            if attempt == retries:
                raise
            wait = 30 * 2**attempt
            log.warning("ERCOT returned 403 (rate limit); retrying in %ds", wait)
            time.sleep(wait)


API_ENV = ("ERCOT_API_USERNAME", "ERCOT_API_PASSWORD", "ERCOT_API_SUBSCRIPTION_KEY")
# ERCOT public API report endpoints. Both accept a settlementPoint filter, so
# one node-year is a single ~35k-row request rather than the all-node bulk data.
API_ENDPOINTS = {
    "RT15": "/np6-905-cd/spp_node_zone_hub",  # RT 15-min SPPs, every settlement point
    "DA": "/np4-190-cd/dam_stlmnt_pnt_prices",  # DA hourly SPPs
}


def _api_client():
    from gridstatus.ercot_api.ercot_api import ErcotAPI

    missing = [k for k in API_ENV if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            f"Resource nodes need the ERCOT public API. Set {', '.join(missing)} "
            "(free account at apiexplorer.ercot.com)."
        )
    return ErcotAPI(
        username=os.environ["ERCOT_API_USERNAME"],
        password=os.environ["ERCOT_API_PASSWORD"],
        public_subscription_key=os.environ["ERCOT_API_SUBSCRIPTION_KEY"],
    )


def _api_to_raw(df: pd.DataFrame) -> pd.DataFrame:
    """Turn an ERCOT API report frame into the gridstatus shape _normalize reads.

    API rows carry DeliveryDate + DeliveryHour (hour ending) [+ DeliveryInterval]
    and a DSTFlag for the repeated fall-back hour. gridstatus' parse_doc turns
    those into a tz-aware "Interval Start".
    """
    from gridstatus import Ercot

    doc = Ercot().parse_doc(df.copy())
    return doc.rename(columns={"SettlementPoint": "Location", "SettlementPointPrice": "SPP"})


API_MIN_INTERVAL_S = 2.1  # ERCOT's public API allows 30 requests a minute
_last_api_call = 0.0


def _throttle() -> None:
    global _last_api_call
    wait = _last_api_call + API_MIN_INTERVAL_S - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_api_call = time.monotonic()


def _is_403(err: Exception) -> bool:
    response = getattr(err, "response", None)
    return response is not None and response.status_code == 403


def _retryable(err: Exception) -> bool:
    """403 (bot protection), 429 (rate limit), or gridstatus giving up on 429s/timeouts."""
    import requests

    if isinstance(err, requests.HTTPError):
        return err.response is not None and err.response.status_code in (403, 429)
    return isinstance(err, RuntimeError) and "Failed after" in str(err)


def _hit_api(api, market: str, start: str, end: str, retries: int = 5, **filters) -> pd.DataFrame:
    """One filtered API query over delivery dates [start, end] (inclusive), normalized.

    Requests are spaced to stay under the API rate limit. ERCOT's bot
    protection still answers some requests (e.g. a full-year range) with HTTP
    403, and gridstatus raises RuntimeError once its own quick 429 retries run
    out; both are retried here with a longer backoff.
    """
    for attempt in range(retries + 1):
        _throttle()
        try:
            raw = api.hit_ercot_api(API_ENDPOINTS[market], deliveryDateFrom=start, deliveryDateTo=end, **filters)
            break
        except Exception as err:  # noqa: BLE001 - filtered by _retryable
            if not _retryable(err) or attempt == retries:
                raise
            if _fail_fast() and _is_403(err):
                raise _blocked_error("the ERCOT public API") from err
            wait = 10 * 2**attempt
            log.warning("ERCOT API refused (%s); retrying in %ds", str(err)[:60], wait)
            time.sleep(wait)
    if raw.empty:
        return pd.DataFrame(columns=["interval_start_utc", "location", "market", "price"])
    return _normalize(_api_to_raw(raw), market)


def _download_api(location: str, year: int, market: str, api=None) -> pd.DataFrame:
    """One settlement point's prices for a year (or year to date) from the ERCOT API.

    Requested one month at a time: a single full-year range is refused (HTTP 403).
    The current year stops at yesterday, the last complete operating day.
    """
    api = api or _api_client()
    yesterday = pd.Timestamp.now(tz=TZ).tz_localize(None).normalize() - pd.Timedelta(days=1)
    parts = []
    for first in pd.date_range(f"{year}-01-01", f"{year}-12-01", freq="MS"):
        if first > yesterday:
            break
        last = min(first + pd.offsets.MonthEnd(0), yesterday)
        parts.append(_hit_api(api, market, f"{first:%Y-%m-%d}", f"{last:%Y-%m-%d}", settlementPoint=location))
    df = pd.concat(parts, ignore_index=True)
    df = df[df["location"] == location].drop_duplicates(["location", "interval_start_utc"])
    return df.sort_values("interval_start_utc").reset_index(drop=True)


def fetch_node_sample(year: int, month: int, refresh: bool = False, api=None) -> pd.DataFrame:
    """RT 15-min prices for every resource node (settlement point type RN) for one month.

    Used to rank nodes by volatility. One day of all resource nodes is ~67k rows,
    a single API page, so the month is requested a day at a time: month-long
    all-node queries need ~20 pages and ERCOT tends to time out and then refuse
    (HTTP 403) partway through. Cached as data/raw/RT15_RN_{year}-{month}.parquet.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"RT15_RN_{year}-{month:02d}.parquet"
    if path.exists() and not refresh:
        return pd.read_parquet(path)
    api = api or _api_client()
    first = pd.Timestamp(year=year, month=month, day=1)
    parts = []
    for day in pd.date_range(first, first + pd.offsets.MonthEnd(0), freq="D"):
        d = f"{day:%Y-%m-%d}"
        log.info("All resource nodes, %s", d)
        parts.append(_hit_api(api, "RT15", d, d, settlementPointType="RN"))
    df = pd.concat(parts, ignore_index=True)
    df.to_parquet(path, index=False)
    return df


def _fill_gaps(df: pd.DataFrame, market: str, year: int) -> pd.DataFrame:
    """Reindex to a complete interval grid, forward-fill single missing intervals.

    The grid runs from the year's first interval to the last observed one, so a
    year-to-date file isn't padded into the future. Longer gaps stay NaN and
    downstream code decides whether to skip those days.
    """
    freq = MARKETS[market]
    first = pd.Timestamp(f"{year}-01-01", tz=TZ).tz_convert("UTC")
    grid = pd.date_range(first, df["interval_start_utc"].max(), freq=freq, name="interval_start_utc")
    out = df.set_index("interval_start_utc").reindex(grid)
    missing = int(out["price"].isna().sum())
    out["price"] = out["price"].ffill(limit=1)
    still_missing = int(out["price"].isna().sum())
    if missing:
        log.warning("%d missing intervals; %d remain after 1-interval forward fill", missing, still_missing)
    out["location"] = df["location"].iloc[0]
    out["market"] = market
    out = out.reset_index()
    out["interval_start_local"] = out["interval_start_utc"].dt.tz_convert(TZ)
    out.attrs["missing_intervals"] = missing
    out.attrs["unfilled_intervals"] = still_missing
    return out[COLUMNS]


def fetch(location: str, year: int, market: str = "RT15", refresh: bool = False) -> pd.DataFrame:
    """Return one location's prices for a year, downloading and caching as needed."""
    if market not in MARKETS:
        raise ValueError(f"market must be one of {sorted(MARKETS)}")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{market}_{location}_{year}.parquet"
    if path.exists() and not refresh:
        return pd.read_parquet(path)

    if is_hub_or_zone(location):
        archive = RAW_DIR / f"{market}_ALL_{year}.parquet"
        if archive.exists() and not refresh:
            all_locs = pd.read_parquet(archive)
        else:
            log.info("Downloading ERCOT %s archive for %d", market, year)
            all_locs = _download_archive(year, market)
            all_locs.to_parquet(archive, index=False)
        df = all_locs[all_locs["location"] == location]
        if df.empty:
            raise ValueError(f"{location} not in archive; available: {sorted(all_locs['location'].unique())}")
    else:
        df = _download_api(location, year, market)
        if df.empty:
            raise ValueError(f"No ERCOT API data for {location} in {year}")

    df = _fill_gaps(df, market, year)
    df.to_parquet(path, index=False)
    return df


def summarize(df: pd.DataFrame) -> str:
    p = df["price"]
    top = df.nlargest(5, "price")[["interval_start_local", "price"]]
    return "\n".join(
        [
            f"{df['location'].iloc[0]} {df['market'].iloc[0]}: {len(df):,} intervals, "
            f"{df['interval_start_local'].min()} to {df['interval_start_local'].max()}",
            f"missing intervals: {df.attrs.get('missing_intervals', 'n/a')}, "
            f"unfilled: {int(p.isna().sum())}",
            f"price $/MWh: min {p.min():.2f}, max {p.max():.2f}, mean {p.mean():.2f}",
            "top 5 intervals:",
            top.to_string(index=False),
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--location", required=True)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--market", choices=sorted(MARKETS), default="RT15")
    parser.add_argument("--refresh", action="store_true", help="ignore the cache and download again")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    print(summarize(fetch(args.location, args.year, args.market, refresh=args.refresh)))


if __name__ == "__main__":
    main()
