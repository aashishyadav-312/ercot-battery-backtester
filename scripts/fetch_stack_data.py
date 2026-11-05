"""Fetch every input the v4 revenue stack runs need (re-runnable; caches in data/raw/).

* DAM AS clearing prices (MCPC), NP4-188-CD, hourly, 2023 to now:
  gridstatus.ErcotAPI.get_as_prices, normalized by data.fetch_ancillary.normalize_as.
  ECRS did not exist before June 2023. For 2023 the ECRS column is left missing
  before its first published price (never zero-filled); every other product
  must be complete. Cached as data/raw/ANCILLARY_DA_{year}.parquet.
* Settled RT AS prices from RTC+B (Dec 5, 2025), NP6-796-ER annual workbook,
  via data.fetch_ancillary.fetch_as(year, "RT"). data/raw/ANCILLARY_RT_{year}.parquet.
* Hub energy prices: 2023 from ERCOT's annual archives (data.fetch_prices.fetch,
  NP6-785-ER and NP4-180-ER); 2024 to 2026 are the committed results/prices/*.ebp
  files (same source, nothing to fetch).
* Every settlement point, 2025 and 2026: data.fetch_all_nodes (NP6-905-CD RT,
  NP4-190-CD DA), monthly caches data/raw/{RT15,DA}_ALLSP_{year}-{month}.parquet.

Needs ERCOT_API_USERNAME, ERCOT_API_PASSWORD, ERCOT_API_SUBSCRIPTION_KEY.

CLI:
    python -m scripts.fetch_stack_data                 # everything
    python -m scripts.fetch_stack_data --only as       # AS prices only
    python -m scripts.fetch_stack_data --only nodes --years 2025
"""

from __future__ import annotations

import argparse
import logging

import pandas as pd

from data.fetch_ancillary import DA_COLUMNS, fetch_as
from data.fetch_prices import RAW_DIR, _api_client, _throttle, fetch
from model.ancillary import PRODUCTS

log = logging.getLogger(__name__)

HUBS = ("HB_HOUSTON", "HB_NORTH", "HB_PAN", "HB_SOUTH", "HB_WEST")
YEARS = (2023, 2024, 2025, 2026)
NODE_YEARS = (2025, 2026)


def normalize_da_allow_ecrs_start(frame: pd.DataFrame) -> pd.DataFrame:
    """Like normalize_as(frame, "DA") but ECRS may be missing before its first price."""
    out = frame[["Interval Start", *DA_COLUMNS.values()]].rename(columns={v: k for k, v in DA_COLUMNS.items()})
    out = out.rename(columns={"Interval Start": "interval_start_utc"})
    out["interval_start_utc"] = pd.to_datetime(out["interval_start_utc"], utc=True)
    out = out[["interval_start_utc", *PRODUCTS]].sort_values("interval_start_utc").reset_index(drop=True)
    for k in PRODUCTS:
        out[k] = pd.to_numeric(out[k], errors="raise")
    if out["interval_start_utc"].duplicated().any():
        raise ValueError("Duplicate AS hours")
    others = [k for k in PRODUCTS if k != "ECRS"]
    if out[others].isna().any().any():
        raise ValueError("Missing AS prices for a product other than ECRS")
    ecrs = out["ECRS"]
    if ecrs.notna().any():
        first = ecrs.first_valid_index()
        if ecrs.loc[first:].isna().any():
            raise ValueError("ECRS prices missing after ECRS started")
    return out


def fetch_as_da(year: int, refresh: bool = False) -> pd.DataFrame:
    path = RAW_DIR / f"ANCILLARY_DA_{year}.parquet"
    if path.exists() and not refresh:
        return pd.read_parquet(path)
    try:
        return fetch_as(year, "DA", refresh=refresh)
    except ValueError as err:
        if "missing" not in str(err).lower():
            raise
    log.info("AS DA %d: ECRS missing early in the year; keeping it missing before its first price", year)
    end = min(pd.Timestamp(f"{year + 1}-01-01", tz="US/Central"), pd.Timestamp.now(tz="US/Central").normalize())
    _throttle()
    out = normalize_da_allow_ecrs_start(_api_client().get_as_prices(f"{year}-01-01", end=end))
    out.to_parquet(path, index=False)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", choices=["as", "hubs", "nodes"], nargs="*")
    ap.add_argument("--years", type=int, nargs="*")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from data.fetch_all_nodes import fetch_year, quiet_gridstatus

    quiet_gridstatus()
    only = set(args.only or ["as", "hubs", "nodes"])
    years = args.years or list(YEARS)
    if "as" in only:
        for y in years:
            df = fetch_as_da(y, args.refresh)
            log.info("AS DA %d: %d hours, %s to %s", y, len(df), df.interval_start_utc.min(), df.interval_start_utc.max())
            if y >= 2025:
                rt = fetch_as(y, "RT", refresh=args.refresh)
                log.info("AS RT %d: %d intervals to %s", y, len(rt), rt.interval_start_utc.max())
    if "hubs" in only and 2023 in years:
        for h in HUBS:
            for m in ("RT15", "DA"):
                fetch(h, 2023, m, args.refresh)
    if "nodes" in only:
        for y in [y for y in years if y in NODE_YEARS]:
            for m in ("RT15", "DA"):
                fetch_year(y, m, args.refresh)


if __name__ == "__main__":
    main()
