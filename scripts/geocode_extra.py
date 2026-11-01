"""Extra geocoding sources for resource nodes the EIA-860 annual rules cannot place.

Used by ``python -m scripts.build_locations --all-nodes``, after the EIA-860 annual
rules and the hand-reviewed overrides, in this order:

4. ``eia860m_name_match`` (medium, plant-level). The EIA-860M monthly generator
   inventory (Operating + Planned sheets, Texas, ERCOT balancing authority) lists
   plants too new for the annual file. The same name rules as the annual file
   (prefix or word-abbreviation match, battery check for storage units, all matching
   plants within 5 km) are applied, and coordinates are copied from the 860M plant row.

5. ``gis_queue_county`` (county-level). ERCOT's monthly Generator Interconnection
   Status (GIS) report lists every project in the interconnection queue with its
   point of interconnection (POI) and county. Reports from several months back to
   2019 are pooled so projects that have since reached operation are still found.
   A node matches a project when
     * the project name passes the same name rules (with the battery check), or
     * the node's substation name (at least 5 letters) appears as a whole word in
       the project's POI location (e.g. "59903 Bearkat 345kV"), unless the POI is a
       tap on a line between two substations (then the project is at neither).
   When the POI quotes a bus number it must be one of the PSS/E buses ERCOT lists at the node's
   substation, because substation names repeat across Texas.
   The name rule here requires the first abbreviated word to give at least 4 letters.
   All matching projects must lie in ONE county. The node is then drawn at that
   county's internal point from the US Census Gazetteer (a point inside the county
   near its centre) and is labelled county-level everywhere it is shown. It shows
   which county the node is in, not where in the county.

Nothing is estimated beyond that: a node that no source places stays unplaced.
"""

from __future__ import annotations

import io
import json
import logging
import re
import time
import zipfile
from pathlib import Path

import pandas as pd

from scripts.build_locations import CACHE, _get, abbreviation_match, match_node, norm, prefix_match

log = logging.getLogger(__name__)

EIA860M_URL = "https://www.eia.gov/electricity/data/eia860m/xls/{month}_generator{year}.xlsx"
GIS_DOC_LIST = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId=15933"
ERCOT_DOWNLOAD = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={}"
GAZETTEER_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{year}_Gazetteer/{year}_Gaz_counties_national.zip"
GIS_MONTHS = ("January", "July")  # one report every six months, plus the newest
GIS_FIRST_YEAR = 2019
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]


# ----------------------------------------------------------------------------- EIA-860M
def fetch_eia860m(refresh: bool = False) -> tuple[Path, str]:
    """Newest EIA-860M workbook (EIA publishes it about two months after the month it covers)."""
    cached = sorted(CACHE.glob("eia860m_*.xlsx"), key=lambda p: p.stat().st_mtime)
    if cached and not refresh:
        return cached[-1], cached[-1].stem.removeprefix("eia860m_")
    now = pd.Timestamp.now()
    for back in range(1, 8):
        t = now - pd.DateOffset(months=back)
        month, year = MONTHS[t.month - 1], t.year
        try:
            blob = _get(EIA860M_URL.format(month=month, year=year))
        except Exception:  # noqa: BLE001 - try the previous month
            continue
        if blob[:2] != b"PK":  # EIA answers missing months with an HTML page
            continue
        path = CACHE / f"eia860m_{month}_{year}.xlsx"
        path.write_bytes(blob)
        return path, f"{month}_{year}"
    raise RuntimeError("No EIA-860M workbook found for the last 7 months")


def read_eia860m(path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(plants, generators) in the column layout match_node expects. Texas, ERCOT only."""
    frames = []
    for sheet in ("Operating", "Planned"):
        d = pd.read_excel(path, sheet, header=2)
        frames.append(d[(d["Plant State"] == "TX") & (d["Balancing Authority Code"] == "ERCO")])
    g = pd.concat(frames, ignore_index=True).dropna(subset=["Plant ID", "Latitude", "Longitude"])
    g["Plant Code"] = g["Plant ID"].astype(int)
    plants = g.drop_duplicates("Plant Code")[["Plant Code", "Plant Name", "County", "Latitude", "Longitude"]].reset_index(drop=True)
    gens = g[["Plant Code", "Technology"]].copy()
    gens["RTO/ISO LMP Node Designation"] = None  # 860M has no LMP node column; only the name rules apply
    return plants, gens


def match_eia860m(node: str, units: list[tuple[str, str]], plants: pd.DataFrame, gens: pd.DataFrame) -> dict:
    res = match_node(node, units, plants, gens, None)
    if res["status"] == "matched":
        res["method"] = "eia860m_name_match"
        res["evidence"] = "EIA-860M " + res["evidence"]
    else:
        res["reason"] = res["reason"].replace("EIA-860 Texas plant", "EIA-860M ERCOT plant")
    return res


# ----------------------------------------------------------------------------- ERCOT GIS queue
def _get_retry(url: str, tries: int = 4) -> bytes:
    """ERCOT's website answers bursts with HTTP 403 (bot protection); back off and retry.
    With ERCOT_FAIL_FAST=1 the first 403 is raised, as everywhere else."""
    from data.fetch_prices import _fail_fast, _is_403

    for i in range(tries):
        try:
            return _get(url)
        except Exception as err:  # noqa: BLE001
            if not _is_403(err) or _fail_fast() or i == tries - 1:
                raise
            wait = 30 * 2**i
            log.warning("ERCOT website refused (403); retrying in %ds", wait)
            time.sleep(wait)
    raise AssertionError("unreachable")


def fetch_gis_reports(refresh: bool = False) -> list[tuple[str, Path]]:
    """January and July GIS reports since 2019 plus the newest one, cached (the list too)."""
    listing = CACHE / "gis_doc_list.json"
    if listing.exists() and not refresh:
        docs = json.loads(listing.read_text())
    else:
        docs = json.loads(_get_retry(GIS_DOC_LIST))["ListDocsByRptTypeRes"]["DocumentList"]
        listing.write_text(json.dumps(docs))
    gis = [d["Document"] for d in docs if d["Document"]["FriendlyName"].startswith("GIS_Report")]
    newest = max(gis, key=lambda d: d["PublishDate"])
    keep = {newest["DocID"]: newest}
    for d in gis:
        name = d["FriendlyName"]
        m = re.match(r"GIS_Report_([A-Za-z]+)_?(\d{4})$", name)  # skip "_revised" / "_Corrected" duplicates
        if m and m.group(1).capitalize() in GIS_MONTHS and int(m.group(2)) >= GIS_FIRST_YEAR:
            keep[d["DocID"]] = d
    out = []
    for d in sorted(keep.values(), key=lambda d: d["PublishDate"]):
        path = CACHE / f"gis_{d['FriendlyName']}.xlsx"
        if not path.exists() or refresh:
            path.write_bytes(_get_retry(ERCOT_DOWNLOAD.format(d["DocID"])))
            time.sleep(2)
        out.append((d["FriendlyName"], path))
    return out


def read_gis(reports: list[tuple[str, Path]]) -> pd.DataFrame:
    """Large-generator project rows (INR, name, POI, county, fuel, technology) pooled across reports."""
    rows = []
    for name, path in reports:
        try:
            xl = pd.ExcelFile(path)
        except Exception as err:  # noqa: BLE001 - an unreadable old report is skipped, not fatal
            log.warning("GIS report %s unreadable (%s); skipped", name, err)
            continue
        # "Project Details - Large Gen" since mid-2022; plain "Project Details" before that.
        sheet = next((s for s in xl.sheet_names if "Project Details" in s and "Large" in s), None) or (
            "Project Details" if "Project Details" in xl.sheet_names else None)
        if sheet is None:
            log.warning("GIS report %s has no large-generator sheet; skipped", name)
            continue
        raw = pd.read_excel(xl, sheet, header=None)
        hdr = next((i for i in range(min(60, len(raw))) if {"INR", "POI Location", "County"} <= set(raw.iloc[i].astype(str).str.strip())), None)
        if hdr is None:
            log.warning("GIS report %s: header row not found; skipped", name)
            continue
        df = raw.iloc[hdr + 1 :].copy()
        df.columns = [str(c).strip() for c in raw.iloc[hdr]]
        df = df[df["INR"].astype(str).str.match(r"^\d{2}INR\d{4}")]
        keep = [c for c in ("INR", "Project Name", "POI Location", "County", "Fuel", "Technology") if c in df.columns]
        df = df[keep].assign(report=name)
        rows.append(df)
    gis = pd.concat(rows, ignore_index=True)
    gis["County"] = gis["County"].astype(str).str.strip().str.title()
    return gis.drop_duplicates(["INR", "Project Name", "POI Location", "County"]).reset_index(drop=True)


def strict_abbreviation_match(key: str, name: str) -> bool:
    """abbreviation_match, but the first word must contribute at least 4 letters.

    Validation against nodes EIA already places showed short leads such as 'pin' + 'bess'
    matching the wrong project ('Pinewood BESS' for PIN_BESS_RN), so the queue rule is stricter.
    """
    w = re.findall(r"[a-z]+", name.lower())
    return bool(w) and len(key) >= 5 and any(key.startswith(w[0][:n]) for n in range(4, len(w[0]) + 1)) and abbreviation_match(key, name)


_LINE_POI = re.compile(r"\btap\b|\s[-–]\s?|\s?[-–]\s|\bto\b|\bckt\b", re.I)


def _is_battery(row: pd.Series) -> bool:
    text = f"{row.get('Fuel', '')} {row.get('Technology', '')} {row.get('Project Name', '')}".upper()
    return bool(re.search(r"\bBA\b|BATTER|BESS|STORAGE|\bESS\b", text))


def match_gis(node: str, substation: str | None, units: list[tuple[str, str]], gis: pd.DataFrame, centroids: dict,
              sub_buses: set[int] | None = None) -> dict:
    """sub_buses: PSS/E bus numbers at the node's substation (ERCOT settlement point list)."""
    keys = {re.sub(r"[^a-z]", "", s.lower()) for s, _ in units} | {re.sub(r"[^a-z]", "", node.split("_")[0].lower())}
    wants_battery = any(u.upper().startswith(("ESR", "ESS")) for _, u in units) or "ESS" in node.upper().split("_")[-1]
    sub = norm(substation or "")
    hits = []
    for _, p in gis.iterrows():
        name = str(p.get("Project Name", ""))
        rule = None
        for key in sorted(keys):
            if prefix_match(key, name) or strict_abbreviation_match(key, name):
                if wants_battery and not _is_battery(p):
                    continue
                rule = f"'{key}' name-matches project '{name.strip()}' ({p['INR']})"
                break
        poi = str(p.get("POI Location", ""))
        # A POI that taps a line between two substations is not at either one; skip those.
        if rule is None and len(sub) >= 5 and not _LINE_POI.search(poi):
            poi_words = {norm(w) for w in re.split(r"[\s\-–/,()]+", str(p.get("POI Location", ""))) if w}
            # Substation names repeat across Texas (LEON_CRK is in Bexar and in Pecos). When the POI quotes
            # bus numbers, one of them must be a bus at this node's substation.
            poi_buses = {int(b) for b in re.findall(r"\b(\d{3,6})\b", poi) if not re.search(rf"\b{b}\s*kv", poi, re.I)}
            bus_ok = not poi_buses or not sub_buses or bool(poi_buses & sub_buses)
            if sub in poi_words and bus_ok:
                rule = f"substation '{substation}' is the POI of project '{name.strip()}' ({p['INR']}: {p['POI Location']})"
        if rule:
            hits.append((p["County"], rule))
    if not hits:
        return {"status": "unmatched", "reason": "no ERCOT GIS queue project matches the node name or substation"}
    counties = sorted({c for c, _ in hits})
    if len(counties) > 1:
        return {"status": "unmatched", "reason": f"ambiguous: GIS queue matches lie in {len(counties)} counties ({', '.join(counties)})"}
    county = counties[0]
    if county not in centroids:
        return {"status": "unmatched", "reason": f"GIS county '{county}' not found in the Census Gazetteer"}
    lat, lon = centroids[county]
    rules = sorted({r for _, r in hits})
    evidence = "; ".join(rules[:3]) + (f"; +{len(rules) - 3} more" if len(rules) > 3 else "")
    return {
        "status": "matched", "method": "gis_queue_county", "confidence": "county-level", "lat": lat, "lon": lon,
        "county": county, "evidence": f"ERCOT GIS queue: {evidence}. Drawn at the {county} County internal point (Census Gazetteer); county-level only.",
    }


# ----------------------------------------------------------------------------- Census county points
def county_points(refresh: bool = False) -> tuple[dict, str]:
    """{'Reagan': (lat, lon), ...} for Texas counties from the Census Gazetteer."""
    cached = sorted(CACHE.glob("census_gazetteer_counties_*.zip"))
    if cached and not refresh:
        path = cached[-1]
    else:
        for year in (2025, 2024, 2023):
            try:
                blob = _get(GAZETTEER_URL.format(year=year))
            except Exception:  # noqa: BLE001
                continue
            path = CACHE / f"census_gazetteer_counties_{year}.zip"
            path.write_bytes(blob)
            break
    z = zipfile.ZipFile(path)
    df = pd.read_csv(io.BytesIO(z.read(z.namelist()[0])), sep="|", dtype=str)
    df.columns = [c.strip() for c in df.columns]
    tx = df[df["USPS"] == "TX"]
    pts = {
        re.sub(r" County$", "", r["NAME"]).title(): (round(float(r["INTPTLAT"]), 5), round(float(r["INTPTLONG"]), 5))
        for _, r in tx.iterrows()
    }
    return pts, path.stem.removeprefix("census_gazetteer_counties_")
