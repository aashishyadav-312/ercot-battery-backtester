"""Texas battery storage from the EIA-860M monthly generator inventory, for the nearby-batteries card.

Source: EIA-860M, https://www.eia.gov/electricity/data/eia860m/ (checked 2026-11-13). One xlsx a month. The
page lists links for months that are not published yet; those links return an HTML page instead of a
workbook, so this script walks the links newest first and takes the first real workbook.

From the Operating and Planned sheets it keeps rows with Technology "Batteries" in Texas. The workbook has a
Balancing Authority Code column, so only ERCOT ("ERCO") rows are kept. Rows without coordinates are dropped
and counted. Operating keeps only status (OP); out-of-service rows are counted and left out. Planned keeps
every planned status (permit pending through construction complete), because EIA does not say which will be
built.

Decisions:
- mw is Net Summer Capacity (MW), falling back to Nameplate when blank. mwh is Nameplate Energy Capacity
  (MWh) on the Operating sheet; the Planned sheet has no energy column, so planned mwh is null.
- EIA lists one row per generator. Rows of one plant with the same status are summed into one unit, so one
  site is not counted as several neighbours. Its online month is the earliest in the group.

CLI:
    python -m data.fetch_eia860m                       # download the latest release
    python -m data.fetch_eia860m --file data/raw/x.xlsx  # use a workbook downloaded by hand
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

log = logging.getLogger(__name__)

PAGE_URL = "https://www.eia.gov/electricity/data/eia860m/"
RAW_DIR = Path(__file__).resolve().parent / "raw"
OUT_PATH = Path(__file__).resolve().parent.parent / "results" / "v5" / "batteries" / "tx_batteries.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
LINK_RE = re.compile(r'href="(/electricity/data/eia860m/(?:archive/)?xls/([a-z]+)_generator(\d{4})\.xlsx)"')
MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
BA = "ERCO"
OPERATING_STATUS = "(OP)"


def _get(url: str) -> requests.Response:
    """GET with one retry."""
    last: Exception | None = None
    for _ in range(2):
        try:
            r = requests.get(url, headers=HEADERS, timeout=120)
            r.raise_for_status()
            return r
        except requests.RequestException as e:  # noqa: PERF203
            last = e
            log.warning("retrying %s: %s", url, e)
    raise RuntimeError(f"could not download {url}: {last}")


def _is_xlsx(content: bytes) -> bool:
    return zipfile.is_zipfile(io.BytesIO(content))


def release_links(page_html: str) -> list[tuple[str, str]]:
    """(release 'YYYY-MM', absolute url), newest first, from the EIA-860M page."""
    seen: dict[str, str] = {}
    for path, month, year in LINK_RE.findall(page_html):
        if month in MONTH_NAMES:
            seen[f"{int(year):04d}-{MONTH_NAMES.index(month) + 1:02d}"] = "https://www.eia.gov" + path
    return sorted(seen.items(), reverse=True)


def download_latest() -> tuple[bytes, str, str]:
    """Return (workbook bytes, release 'YYYY-MM', url) for the newest published workbook."""
    links = release_links(_get(PAGE_URL).text)
    if not links:
        raise RuntimeError("no EIA-860M workbook links found on " + PAGE_URL)
    for release, url in links:
        r = _get(url)
        if _is_xlsx(r.content):
            return r.content, release, url
        log.info("%s is not published yet (got an HTML page)", release)
    raise RuntimeError("none of the EIA-860M links returned a workbook")


def _read_sheet(source, sheet: str) -> pd.DataFrame:
    """Read a sheet whose header sits on the row that starts with 'Entity ID'."""
    raw = pd.read_excel(source, sheet_name=sheet, header=None)
    hdr = raw.index[raw.iloc[:, 0].astype(str).str.strip() == "Entity ID"]
    if len(hdr) == 0:
        raise ValueError(f"sheet {sheet!r}: no 'Entity ID' header row")
    df = raw.iloc[hdr[0] + 1 :].copy()
    df.columns = [str(c).strip() for c in raw.iloc[hdr[0]]]
    return df.reset_index(drop=True)


def release_from_workbook(source) -> str | None:
    """'YYYY-MM' from the title row, for example 'Inventory of Operating Generators as of September 2026'."""
    title = str(pd.read_excel(source, sheet_name="Operating", header=None, nrows=1).iloc[0, 0])
    m = re.search(r"as of ([A-Za-z]+) (\d{4})", title)
    if m and m.group(1).lower() in MONTH_NAMES:
        return f"{int(m.group(2)):04d}-{MONTH_NAMES.index(m.group(1).lower()) + 1:02d}"
    return None


def _num(v) -> float | None:
    x = pd.to_numeric(v, errors="coerce")
    return None if pd.isna(x) else float(x)


def _online(month, year) -> str | None:
    y, m = _num(year), _num(month)
    if y is None:
        return None
    return f"{int(y):04d}-{int(m):02d}" if m else f"{int(y):04d}-01"


def parse_units(df: pd.DataFrame, status: str) -> tuple[list[dict], dict]:
    """Battery rows in Texas -> one unit per plant. `status` is 'operating' or 'planned'. Returns (units, counts)."""
    counts = {"rows_in": 0, "dropped_no_coords": 0, "dropped_other_ba": 0, "dropped_not_in_service": 0}
    d = df[(df["Technology"].astype(str).str.strip() == "Batteries") & (df["Plant State"].astype(str).str.strip() == "TX")]
    counts["rows_in"] = len(d)
    has_ba = "Balancing Authority Code" in d.columns
    if has_ba:
        keep_ba = d["Balancing Authority Code"].astype(str).str.strip() == BA
        counts["dropped_other_ba"] = int((~keep_ba).sum())
        d = d[keep_ba]
    if status == "operating":
        ok = d["Status"].astype(str).str.strip().str.startswith(OPERATING_STATUS)
        counts["dropped_not_in_service"] = int((~ok).sum())
        d = d[ok]
    month_col, year_col = ("Operating Month", "Operating Year") if status == "operating" else ("Planned Operation Month", "Planned Operation Year")
    groups: dict[tuple, dict] = {}
    for _, r in d.iterrows():
        lat, lon = _num(r["Latitude"]), _num(r["Longitude"])
        if lat is None or lon is None:
            counts["dropped_no_coords"] += 1
            continue
        mw = _num(r["Net Summer Capacity (MW)"])
        if mw is None:
            mw = _num(r["Nameplate Capacity (MW)"])
        if mw is None or mw <= 0:
            continue
        mwh = _num(r["Nameplate Energy Capacity (MWh)"]) if "Nameplate Energy Capacity (MWh)" in d.columns else None
        key = (str(r["Plant ID"]).strip(), str(r["Plant Name"]).strip())
        g = groups.setdefault(key, {"name": key[1], "owner": str(r["Entity Name"]).strip(), "county": str(r["County"]).strip(), "lat": lat, "lon": lon,
                                    "mw": 0.0, "mwh": None, "status": status, "online": None, "ba": BA if has_ba else None})
        g["mw"] += mw
        if mwh is not None:
            g["mwh"] = (g["mwh"] or 0.0) + mwh
        on = _online(r[month_col], r[year_col])
        if on and (g["online"] is None or on < g["online"]):
            g["online"] = on
    units = []
    for g in groups.values():
        units.append({**g, "lat": round(g["lat"], 4), "lon": round(g["lon"], 4), "mw": round(g["mw"], 1),
                      "mwh": None if g["mwh"] is None else round(g["mwh"], 1)})
    return units, counts


def build(source, release: str, source_url: str) -> dict:
    op, op_counts = parse_units(_read_sheet(source, "Operating"), "operating")
    pl, pl_counts = parse_units(_read_sheet(source, "Planned"), "planned")
    units = sorted(op + pl, key=lambda u: (u["status"] != "operating", u["name"]))
    has_ba = "Balancing Authority Code" in _read_sheet(source, "Operating").columns
    y, m = int(release[:4]), int(release[5:])
    return {
        "source": "EIA-860M Monthly Update to Annual Electric Generator Report, batteries in Texas",
        "sourceUrl": source_url,
        "release": release,
        "asOf": f"{release}-{pd.Period(f'{y}-{m:02d}').days_in_month:02d}",
        "scope": ("ERCOT units only (balancing authority code ERCO). " if has_ba else "All Texas units; the workbook has no balancing authority column. ")
        + "One entry per plant. Capacity is net summer MW. Planned includes every planned status from permit pending to construction complete.",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dropped": {"operating": op_counts, "planned": pl_counts},
        "count": len(units),
        "units": units,
    }


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--file", help="use this workbook instead of downloading (put hand-downloaded files in data/raw/)")
    ap.add_argument("--url", help="source URL to record with --file")
    ap.add_argument("--out", default=str(OUT_PATH))
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if a.file:
        path = Path(a.file)
        source: object = path
        release = release_from_workbook(path)
        url = a.url or PAGE_URL
    else:
        content, release, url = download_latest()
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        (RAW_DIR / f"eia860m_{release}.xlsx").write_bytes(content)
        source = io.BytesIO(content)
        release = release_from_workbook(io.BytesIO(content)) or release
    if not release:
        raise SystemExit("could not read the release month from the workbook title")
    out = build(source, release, url)
    p = Path(a.out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    op = [u for u in out["units"] if u["status"] == "operating"]
    pl = [u for u in out["units"] if u["status"] == "planned"]
    d = out["dropped"]
    print(f"release {out['release']}: {out['count']} units ({len(op)} operating, {len(pl)} planned)")
    print(f"operating {sum(u['mw'] for u in op):,.1f} MW, planned {sum(u['mw'] for u in pl):,.1f} MW")
    print(f"dropped (no coordinates): operating {d['operating']['dropped_no_coords']}, planned {d['planned']['dropped_no_coords']}")
    print(f"dropped (other balancing authority): operating {d['operating']['dropped_other_ba']}, planned {d['planned']['dropped_other_ba']}")
    print(f"dropped (operating, not in service): {d['operating']['dropped_not_in_service']}")
    print(f"wrote {p}")
    return out


if __name__ == "__main__":
    main()
