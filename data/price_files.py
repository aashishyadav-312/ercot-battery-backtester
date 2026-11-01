"""Compact per-location-year price files for the in-browser custom run.

One gzip file per location and year holds both price series the custom run
needs: real-time 15-minute and day-ahead hourly settlement point prices, exactly
as data.fetch_prices.fetch returns them (complete UTC grids, single missing
intervals already forward-filled, longer gaps left missing). The browser
(web/src/custom/prices.ts) and the Python parity reference read the same bytes.

Layout before gzip ("EBP1"), little-endian:

    4 bytes   b"EBP1"
    uint32    header length H (a multiple of 4)
    H bytes   UTF-8 JSON header, padded with spaces
    int32[n]  RT prices in cents, n = header["rt"]["count"]
    int32[m]  DA prices in cents, m = header["da"]["count"]

Prices are stored as whole cents: ERCOT publishes settlement point prices to two
decimals, so this is exact (write() checks it). Missing prices are INT32_MIN.
Each series starts at header[...]["start_utc"] and steps by "step_minutes".
"""

from __future__ import annotations

import gzip
import json
import struct
from pathlib import Path

import numpy as np
import pandas as pd

MAGIC = b"EBP1"
SCALE = 100
MISSING = np.iinfo(np.int32).min
STEP_MINUTES = {"RT15": 15, "DA": 60}


def _series(df: pd.DataFrame, market: str) -> tuple[dict, np.ndarray]:
    t = pd.DatetimeIndex(df["interval_start_utc"])
    step = pd.Timedelta(minutes=STEP_MINUTES[market])
    if len(t) == 0:
        raise ValueError(f"{market}: no prices")
    if len(t) > 1 and not (np.diff(t.asi8) == step.value).all():
        raise ValueError(f"{market}: timestamps are not a regular {step} grid")
    price = df["price"].to_numpy(dtype=float)
    cents = np.round(price * SCALE)
    ok = np.isfinite(price)
    if (np.abs(cents[ok] - price[ok] * SCALE) > 1e-6).any():
        raise ValueError(f"{market}: prices have more than two decimals")
    if ok.any() and np.abs(cents[ok]).max() >= 2**31 - 1:
        raise ValueError(f"{market}: price out of int32 range")
    values = np.where(ok, cents, MISSING).astype("<i4")
    meta = {"start_utc": t[0].strftime("%Y-%m-%dT%H:%M:%SZ"), "step_minutes": STEP_MINUTES[market], "count": len(t)}
    return meta, values


def encode(location: str, year: int, rt: pd.DataFrame, da: pd.DataFrame, sources: dict | None = None) -> bytes:
    """Bytes of one price file (gzip-compressed, deterministic: no timestamp in the gzip header)."""
    rt_meta, rt_values = _series(rt, "RT15")
    da_meta, da_values = _series(da, "DA")
    header = {
        "format": "EBP1",
        "location": location,
        "year": year,
        "units": "$/MWh x 100 (int32 cents); missing = -2147483648",
        "rt": rt_meta,
        "da": da_meta,
        "sources": sources or {},
    }
    h = json.dumps(header, separators=(",", ":")).encode()
    h += b" " * (-len(h) % 4)
    raw = MAGIC + struct.pack("<I", len(h)) + h + rt_values.tobytes() + da_values.tobytes()
    return gzip.compress(raw, compresslevel=9, mtime=0)


def write(path: Path, location: str, year: int, rt: pd.DataFrame, da: pd.DataFrame, sources: dict | None = None) -> int:
    data = encode(location, year, rt, da, sources)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data)


def _frame(meta: dict, values: np.ndarray, location: str, market: str) -> pd.DataFrame:
    start = pd.Timestamp(meta["start_utc"])
    utc = pd.date_range(start, periods=meta["count"], freq=f"{meta['step_minutes']}min")
    price = np.where(values == MISSING, np.nan, values / SCALE)
    return pd.DataFrame(
        {
            "interval_start_utc": utc,
            "interval_start_local": utc.tz_convert("US/Central"),
            "location": location,
            "market": market,
            "price": price,
        }
    )


def read(path: Path) -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    """(header, rt, da) with the same columns as data.fetch_prices.fetch."""
    raw = gzip.decompress(Path(path).read_bytes())
    if raw[:4] != MAGIC:
        raise ValueError(f"{path}: not an EBP1 price file")
    (h_len,) = struct.unpack_from("<I", raw, 4)
    header = json.loads(raw[8 : 8 + h_len])
    body = np.frombuffer(raw, dtype="<i4", offset=8 + h_len)
    n_rt, n_da = header["rt"]["count"], header["da"]["count"]
    if len(body) != n_rt + n_da:
        raise ValueError(f"{path}: expected {n_rt + n_da} prices, found {len(body)}")
    loc = header["location"]
    return header, _frame(header["rt"], body[:n_rt], loc, "RT15"), _frame(header["da"], body[n_rt:], loc, "DA")
