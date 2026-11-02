"""Context layers for the site (Phase 17): why revenue moves.

Builds ``results/context.json`` from four public sources. Everything here is descriptive context
shown beside the backtest results; none of it enters the optimizer.

1. ERCOT battery fleet by month: the EIA-860M monthly generator workbook (operating + retired sheets,
   Texas batteries on the ERCO balancing authority). Same dataset the EIA API serves, read from the
   keyless workbook so no API key is needed.
2. Planned storage by county: the newest ERCOT Generator Interconnection Status (GIS) monthly report,
   large-generator sheet, technology BA (battery).
3. Weather: Open-Meteo archive daily high/low temperature at each hub city.
4. Solar and wind share of generation by hour and month: ERCOT's published Fuel Mix Report
   (``IntGenbyFuel{year}.xlsx``, the 15-minute settled generation by fuel). gridstatus's own fuel-mix
   call only serves today and yesterday, so it cannot give a history; ERCOT's file is the same series.

Usage:  python -m scripts.build_context            (downloads are cached in data/raw/context/)
        python -m scripts.build_context --refresh  (re-download everything)
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import re
import time
import zipfile
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "context"
OUT = ROOT / "results" / "context.json"

EIA860M_URL = "https://www.eia.gov/electricity/data/eia860m/xls/{month}_generator{year}.xlsx"
GIS_DOC_LIST = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId=15933"
ERCOT_DOWNLOAD = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={}"
FUEL_PAGE = "https://www.ercot.com/gridinfo/generation"
FUEL_PREVIOUS_ZIP = "https://www.ercot.com/files/docs/2021/03/10/FuelMixReport_PreviousYears.zip"
OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive"

MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FLEET_FIRST_YEAR = 2018
WEATHER_FIRST_DAY = "2024-01-01"  # earliest backtest year
FUEL_YEARS = (2024, 2025, 2026)
# The five hub cities as already drawn on the Map page (results/locations.json).
HUB_CITIES = {"HB_HOUSTON": "Houston", "HB_NORTH": "Dallas", "HB_SOUTH": "San Antonio", "HB_WEST": "Midland", "HB_PAN": "Amarillo"}


def _get(url: str, **kw) -> bytes:
    r = requests.get(url, timeout=180, **kw)  # ERCOT answers custom User-Agents with 403; keep the default
    r.raise_for_status()
    return r.content


def _cached(name: str, url: str, refresh: bool) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if refresh or not path.exists():
        path.write_bytes(_get(url))
        time.sleep(1)
    return path


# ----------------------------------------------------------------------------- 1. fleet (EIA-860M)
def fetch_eia860m(refresh: bool = False) -> tuple[Path, str]:
    """Newest EIA-860M workbook (EIA posts it about a month after the month it covers)."""
    cached = sorted(CACHE.glob("eia860m_*.xlsx"), key=lambda p: p.stat().st_mtime) if CACHE.exists() else []
    if cached and not refresh:
        return cached[-1], cached[-1].stem.removeprefix("eia860m_")
    today = dt.date.today()
    for back in range(0, 7):
        y, m = today.year, today.month - back
        while m < 1:
            y, m = y - 1, m + 12
        blob = requests.get(EIA860M_URL.format(month=MONTH_NAMES[m - 1], year=y), timeout=180).content
        if blob[:2] != b"PK":  # EIA answers a missing month with an HTML page
            continue
        CACHE.mkdir(parents=True, exist_ok=True)
        path = CACHE / f"eia860m_{MONTH_NAMES[m - 1]}_{y}.xlsx"
        path.write_bytes(blob)
        return path, f"{MONTH_NAMES[m - 1]}_{y}"
    raise RuntimeError("No EIA-860M workbook found for the last 7 months")


def _ym(year, month) -> int | None:
    try:
        return int(float(year)) * 12 + int(float(month)) - 1
    except (TypeError, ValueError):
        return None


def fleet_series(operating: pd.DataFrame, retired: pd.DataFrame, first_year: int, last_ym: int) -> list[dict]:
    """Cumulative Texas (ERCO) battery MW and MWh at the end of each month: operating units whose start
    month has passed, plus retired units from their start month until their retirement month."""
    def batteries(df: pd.DataFrame) -> pd.DataFrame:
        return df[(df["Technology"] == "Batteries") & (df["Plant State"] == "TX") & (df["Balancing Authority Code"] == "ERCO")]

    ops = batteries(operating)
    rets = batteries(retired)
    units = []
    for _, r in ops.iterrows():
        units.append((_ym(r["Operating Year"], r["Operating Month"]), None, r["Nameplate Capacity (MW)"], r.get("Nameplate Energy Capacity (MWh)")))
    for _, r in rets.iterrows():
        units.append((_ym(r["Operating Year"], r["Operating Month"]), _ym(r["Retirement Year"], r["Retirement Month"]), r["Nameplate Capacity (MW)"], r.get("Nameplate Energy Capacity (MWh)")))
    out = []
    for ym in range(first_year * 12, last_ym + 1):
        mw = mwh = n = 0.0
        for start, end, cap, energy in units:
            if start is None or start > ym or (end is not None and end <= ym):
                continue
            n += 1
            mw += float(cap) if pd.notna(cap) else 0.0
            mwh += float(energy) if pd.notna(pd.to_numeric(energy, errors="coerce")) else 0.0
        out.append({"month": f"{ym // 12}-{ym % 12 + 1:02d}", "mw": round(mw, 1), "mwh": round(mwh, 1), "units": int(n)})
    return out


def build_fleet(refresh: bool) -> dict:
    path, tag = fetch_eia860m(refresh)
    xl = pd.ExcelFile(path)
    operating = pd.read_excel(xl, "Operating", header=2)
    retired = pd.read_excel(xl, "Retired", header=2)
    month, year = tag.split("_")
    last_ym = int(year) * 12 + MONTH_NAMES.index(month)
    series = fleet_series(operating, retired, FLEET_FIRST_YEAR, last_ym)
    return {
        "source": "EIA-860M monthly generator inventory (Operating and Retired sheets)",
        "as_of": f"{year}-{MONTH_NAMES.index(month) + 1:02d}",
        "filter": "Plant State = TX, Balancing Authority = ERCO, Technology = Batteries; nameplate MW",
        "note": "Fleet MW is rebuilt from each unit's start and retirement month in the latest inventory, so it can differ slightly from what past monthly editions reported.",
        "monthly": series,
    }


# ----------------------------------------------------------------------------- 2. planned storage (ERCOT GIS)
def fetch_gis(refresh: bool = False) -> tuple[Path, dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    meta_path = CACHE / "gis_latest.json"
    path = CACHE / "gis_latest.xlsx"
    if path.exists() and meta_path.exists() and not refresh:
        return path, json.loads(meta_path.read_text())
    docs = json.loads(_get(GIS_DOC_LIST))["ListDocsByRptTypeRes"]["DocumentList"]
    gis = [d["Document"] for d in docs if re.fullmatch(r"GIS_Report_[A-Za-z]+\d{4}", d["Document"]["FriendlyName"])]
    newest = max(gis, key=lambda d: d["PublishDate"])
    path.write_bytes(_get(ERCOT_DOWNLOAD.format(newest["DocID"])))
    meta = {"report": newest["FriendlyName"], "published": newest["PublishDate"][:10]}
    meta_path.write_text(json.dumps(meta))
    return path, meta


def read_gis_storage(path: Path) -> pd.DataFrame:
    """Battery projects (technology BA) from the large-generator sheet."""
    xl = pd.ExcelFile(path)
    sheet = next(s for s in xl.sheet_names if "Project Details" in s and "Large" in s)
    raw = pd.read_excel(xl, sheet, header=None)
    hdr = next(i for i in range(min(60, len(raw))) if {"INR", "County", "Capacity (MW)"} <= set(raw.iloc[i].astype(str).str.strip()))
    df = raw.iloc[hdr + 1:].copy()
    df.columns = [str(c).strip() for c in raw.iloc[hdr]]
    df = df[df["INR"].astype(str).str.match(r"^\d{2}INR\d{4}")]
    return df[df["Technology"].astype(str).str.strip() == "BA"]


def queue_by_county(storage: pd.DataFrame) -> dict[str, dict]:
    """Planned storage MW by county, with the part that already has a signed interconnection agreement."""
    df = storage.copy()
    df["County"] = df["County"].astype(str).str.strip().str.title()
    df = df[df["County"].ne("") & df["County"].ne("Nan")]
    df["mw"] = pd.to_numeric(df["Capacity (MW)"], errors="coerce").fillna(0.0)
    df["ia"] = df["IA Signed"].notna() if "IA Signed" in df.columns else False
    out = {}
    for county, g in df.groupby("County"):
        out[county] = {"mw": round(float(g["mw"].sum()), 1), "projects": int(len(g)), "mw_ia_signed": round(float(g.loc[g["ia"], "mw"].sum()), 1)}
    return dict(sorted(out.items(), key=lambda kv: -kv[1]["mw"]))


def build_queue(refresh: bool) -> dict:
    path, meta = fetch_gis(refresh)
    counties = queue_by_county(read_gis_storage(path))
    return {
        "source": f"ERCOT Generator Interconnection Status report, {meta['report']} (published {meta['published']}), large-generator sheet, technology BA",
        "published": meta["published"],
        "note": "Projects under 10 MW (small-generator sheet) are not included. A project in the queue may never be built; \"IA signed\" means an interconnection agreement is signed, not that construction has started.",
        "total_mw": round(sum(c["mw"] for c in counties.values()), 1),
        "total_projects": sum(c["projects"] for c in counties.values()),
        "counties": counties,
    }


# ----------------------------------------------------------------------------- 3. weather (Open-Meteo)
def fetch_weather_city(lat: float, lon: float, start: str, end: str, refresh: bool, tag: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"weather_{tag}_{start}_{end}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    params = {
        "latitude": lat, "longitude": lon, "start_date": start, "end_date": end,
        "daily": "temperature_2m_max,temperature_2m_min", "temperature_unit": "fahrenheit", "timezone": "America/Chicago",
    }
    r = requests.get(OPEN_METEO, params=params, timeout=120)
    r.raise_for_status()
    path.write_text(r.text)
    time.sleep(1)
    return r.json()


def build_weather(refresh: bool) -> dict:
    locs = {l["code"]: l for l in json.loads((ROOT / "results" / "locations.json").read_text())["locations"]}
    end = (dt.date.today() - dt.timedelta(days=7)).isoformat()  # the archive lags a few days
    cities = {}
    for code, city in HUB_CITIES.items():
        l = locs[code]
        d = fetch_weather_city(l["lat"], l["lon"], WEATHER_FIRST_DAY, end, refresh, city.replace(" ", "_"))["daily"]
        cities[city] = {
            "hub": code, "lat": l["lat"], "lon": l["lon"],
            "tmax_f": [None if v is None else round(v) for v in d["temperature_2m_max"]],
            "tmin_f": [None if v is None else round(v) for v in d["temperature_2m_min"]],
        }
        n = len(d["time"])
    return {
        "source": "Open-Meteo historical weather API (ERA5 reanalysis), daily 2 m temperature at the hub city, degrees F, US/Central days",
        "first_day": WEATHER_FIRST_DAY,
        "days": n,
        "note": "Reanalysis at a grid cell near the city, not a weather-station reading, and not the weather at a specific node.",
        "cities": cities,
    }


# ----------------------------------------------------------------------------- 4. solar and wind share (ERCOT fuel mix)
def fuel_urls() -> dict[int, str]:
    """Annual IntGenbyFuel workbooks linked from ERCOT's generation page (2025 onward)."""
    html = requests.get(FUEL_PAGE, timeout=120).text
    return {int(y): u for u, y in re.findall(r"(https://www\.ercot\.com/files/docs/[\d/]+/IntGenbyFuel(\d{4})\.xlsx)", html)}


def fuel_workbook(year: int, refresh: bool) -> pd.ExcelFile:
    path = CACHE / f"IntGenbyFuel{year}.xlsx"
    if refresh or not path.exists():
        urls = fuel_urls()
        if year in urls:
            _cached(path.name, urls[year], True)
        else:  # older years only ship inside the "previous years" zip
            zpath = _cached("FuelMixReport_PreviousYears.zip", FUEL_PREVIOUS_ZIP, refresh)
            with zipfile.ZipFile(zpath) as z:
                name = next(n for n in z.namelist() if n.lower() == f"intgenbyfuel{year}.xlsx")
                path.write_bytes(z.read(name))
    return pd.ExcelFile(path)


def hourly_shares(sheets: dict[int, pd.DataFrame]) -> dict:
    """Solar and wind share of generation, by month (1-12) and hour of day (0-23, Central time).

    Each sheet row is one fuel on one day, with 96 fifteen-minute columns. Share = summed solar (or wind)
    over all days in the month / summed generation over the same hours. The denominator is every fuel
    except wholesale storage load, with fuels that go negative (storage charging) counted as zero."""
    out_solar, out_wind, months = [], [], []
    for m in range(1, 13):
        df = sheets.get(m)
        if df is None or df.empty:
            out_solar.append([None] * 24)
            out_wind.append([None] * 24)
            continue
        slots = [c for c in df.columns if re.fullmatch(r"\d{1,2}:\d{2}", str(c))]
        slots = slots[:96]
        vals = df[slots].apply(pd.to_numeric, errors="coerce")
        # columns are interval-ending times 0:15 ... 23:45, 0:00: hour h = columns 4h .. 4h+3
        hourly = pd.DataFrame({h: vals.iloc[:, 4 * h:4 * h + 4].sum(axis=1, min_count=1) for h in range(24)})
        fuel = df["Fuel"].astype(str).str.strip()
        gen = hourly[fuel.ne("WSL")].clip(lower=0).sum()
        solar = hourly[fuel.eq("Solar")].sum()
        wind = hourly[fuel.eq("Wind")].sum()
        out_solar.append([round(100 * float(solar[h] / gen[h]), 1) if gen[h] > 0 else None for h in range(24)])
        out_wind.append([round(100 * float(wind[h] / gen[h]), 1) if gen[h] > 0 else None for h in range(24)])
        months.append(m)
    return {"months": months, "solar_pct": out_solar, "wind_pct": out_wind}


def build_fuel(refresh: bool) -> dict:
    years = {}
    for y in FUEL_YEARS:
        xl = fuel_workbook(y, refresh)
        sheets = {i + 1: pd.read_excel(xl, MONTH_ABBR[i]) for i in range(12) if MONTH_ABBR[i] in xl.sheet_names}
        years[str(y)] = hourly_shares(sheets)
    return {
        "source": "ERCOT Fuel Mix Report (IntGenbyFuel annual workbooks): settled 15-minute generation by fuel",
        "definition": "Solar (or wind) generation divided by total generation in the same hour, summed over every day of the month; storage charging excluded. Hours are Central time.",
        "years": years,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download every source")
    ap.add_argument("--only", choices=["fleet", "queue", "weather", "fuel"], action="append", help="rebuild only these parts (others kept from the existing file)")
    a = ap.parse_args()
    build = {"fleet": build_fleet, "queue": build_queue, "weather": build_weather, "fuel": build_fuel}
    keep = json.loads(OUT.read_text()) if OUT.exists() and a.only else {}
    for name, fn in build.items():
        if not a.only or name in a.only:
            print(f"building {name} ...")
            keep[name] = fn(a.refresh)
    keep["generated"] = dt.date.today().isoformat()
    OUT.write_text(json.dumps(keep, separators=(",", ":")) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
