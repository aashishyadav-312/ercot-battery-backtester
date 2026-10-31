"""Download ERCOT settlement point prices with gridstatus and cache them as parquet.

Hubs and load zones come from ERCOT's public annual archives (no login needed):
NP6-785-ER for real-time 15-minute SPPs and NP4-180-ER for day-ahead hourly SPPs.
One download covers every hub and load zone for the year, so it is cached once
as data/raw/{market}_ALL_{year}.parquet and split per location from there.

Resource nodes are not in the annual archives. They come from the ERCOT public
API, which needs ERCOT_API_USERNAME, ERCOT_API_PASSWORD and
ERCOT_API_SUBSCRIPTION_KEY in the environment.

Output columns: interval_start_utc, interval_start_local (US/Central), location,
market, price ($/MWh). Timestamps are stored in UTC so DST days are unambiguous.

CLI:
    python -m data.fetch_prices --location HB_HOUSTON --year 2025 --market RT15
"""

from __future__ import annotations

import argparse
import logging
import os
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


def _download_archive(year: int, market: str) -> pd.DataFrame:
    from gridstatus import Ercot

    ercot = Ercot()
    raw = ercot.get_rtm_spp(year) if market == "RT15" else ercot.get_dam_spp(year)
    return _normalize(raw, market)


def _download_api(location: str, year: int, market: str) -> pd.DataFrame:
    from gridstatus.ercot_api.ercot_api import ErcotAPI

    env = ("ERCOT_API_USERNAME", "ERCOT_API_PASSWORD", "ERCOT_API_SUBSCRIPTION_KEY")
    missing = [k for k in env if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            f"{location} is a resource node, which needs the ERCOT public API. "
            f"Set {', '.join(missing)} (free account at apiexplorer.ercot.com)."
        )
    api = ErcotAPI(
        username=os.environ["ERCOT_API_USERNAME"],
        password=os.environ["ERCOT_API_PASSWORD"],
        public_subscription_key=os.environ["ERCOT_API_SUBSCRIPTION_KEY"],
    )
    start = pd.Timestamp(f"{year}-01-01", tz=TZ)
    end = min(pd.Timestamp(f"{year + 1}-01-01", tz=TZ), pd.Timestamp.now(tz=TZ).normalize())
    getter = api.get_spp_real_time_15_min if market == "RT15" else api.get_spp_day_ahead_hourly
    raw = getter(start, end=end)
    return _normalize(raw[raw["Location"] == location], market)


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
