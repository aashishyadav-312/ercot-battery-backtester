"""Build results/locations.json: where each settlement point we show sits on the Texas map.

Inputs (both public, downloaded once and cached in data/raw/locations/):
  * ERCOT "Settlement Points List and Electrical Buses Mapping" (monthly zip). Gives each
    resource node's substation, settlement load zone and the units behind it.
  * EIA-860 (annual generator survey). Gives each plant's latitude/longitude.

Resource nodes are placed by matching them to an EIA-860 plant, in this order:
  1. ``eia860_lmp_node``  (high)    EIA's "RTO/ISO LMP Node Designation" column equals the node
                                    or one of its ERCOT resource names (substation_unit).
  2. ``manual_review``    (reviewed) scripts/location_overrides.json: a named plant plus the
                                    evidence for it. Used only where the rules below fail.
  3. ``name_match``       (medium)  The node's substation (or node) name matches exactly one
                                    plant name by prefix or by word abbreviation ("CAMWIND" =
                                    "Cameron Wind"), any storage unit has a battery at that
                                    plant, and all matching plants lie within 5 km of each other.
A node with no match is NOT placed: its coordinates stay null and it is listed in
results/geocoding_log.md with the reason. Coordinates are never estimated or interpolated.

Hubs are averages over many buses, so they have no single point. Each is drawn at a
representative city (HUB_CITIES), flagged ``coordinate_source = "representative_city"``.

Outputs: results/locations.json (read by the web Map page) and results/geocoding_log.md.
With --all-nodes (Phase 12): results/node_locations.json for every resource node in the ERCOT
list, merged into the all-node results by scripts/run_all_nodes.py, and
results/geocoding_log_all_nodes.md with the match rate.

CLI:
    python -m scripts.build_locations            # use cached downloads if present
    python -m scripts.build_locations --refresh  # re-download ERCOT and EIA files
    python -m scripts.build_locations --all-nodes  # every resource node (Phase 12)
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import math
import re
import zipfile
from pathlib import Path

import pandas as pd
import requests

from scripts.rank_nodes import HUBS, ZONE_HUB

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results"
CACHE = ROOT / "data" / "raw" / "locations"
NAMES_JSON = ROOT / "web" / "src" / "data" / "locations.json"
OVERRIDES_JSON = Path(__file__).with_name("location_overrides.json")

ERCOT_DOC_LIST = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId=10008"
ERCOT_DOWNLOAD = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={}"
EIA_YEAR = 2025
EIA_URL = f"https://www.eia.gov/electricity/data/eia860/xls/eia860{EIA_YEAR}.zip"

# Representative city for each hub. A hub is a price average over many buses, not a place;
# the marker only says "this hub's area". City-centre coordinates (public geographic facts).
HUB_CITIES = {
    "HB_HOUSTON": ("Houston", 29.7604, -95.3698),
    "HB_NORTH": ("Dallas", 32.7767, -96.7970),
    "HB_SOUTH": ("San Antonio", 29.4241, -98.4936),
    "HB_WEST": ("Midland", 31.9973, -102.0779),
    "HB_PAN": ("Amarillo", 35.2220, -101.8313),
}

MAX_CLUSTER_KM = 5.0
CONFLICT_KM = 100.0  # plant placement vs GIS queue county further apart than this: leave the node unplaced  # plants matched to one node must lie this close together
TEXAS_BBOX = (25.8, 36.6, -106.7, -93.5)  # lat_min, lat_max, lon_min, lon_max (sanity check)


# ----------------------------------------------------------------------------- helpers
def norm(text: str) -> str:
    """Lowercase letters only: 'Cameron Wind 1 LLC' -> 'cameronwindllc'."""
    return re.sub(r"[^a-z]", "", str(text).lower())


def words(text: str) -> list[str]:
    return re.findall(r"[a-z]+", str(text).lower())


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def in_texas(lat: float, lon: float) -> bool:
    return TEXAS_BBOX[0] <= lat <= TEXAS_BBOX[1] and TEXAS_BBOX[2] <= lon <= TEXAS_BBOX[3]


def prefix_match(key: str, plant_name: str) -> bool:
    """Rule R1: the plant name (letters only) starts with the key, or the key starts with it.

    Keys and plant names must be at least 5 letters, so 'ANSON' matches 'Anson Solar Center'
    but not 'Hanson', and 'RUSSEKST' (Russek St) matches the plant 'Russek'.
    """
    p = norm(plant_name)
    if len(key) < 5 or len(p) < 5:
        return False
    return p.startswith(key) or key.startswith(p)


def abbreviation_match(key: str, plant_name: str) -> bool:
    """Rule R2: the key is the first words of the plant name, each cut to a prefix.

    'camwind' = 'cam' (Cameron) + 'wind' (Wind). Needs at least two words and every word
    contributes at least two letters.
    """
    w = words(plant_name)

    def rec(rest: str, i: int, used: int) -> bool:
        if not rest:
            return used >= 2
        if i >= len(w):
            return False
        for n in range(min(len(w[i]), len(rest)), 1, -1):
            if rest.startswith(w[i][:n]) and rec(rest[n:], i + 1, used + 1):
                return True
        return False

    return len(key) >= 5 and rec(key, 0, 0)


# ----------------------------------------------------------------------------- downloads
def _get(url: str) -> bytes:
    r = requests.get(url, timeout=120)  # ERCOT returns 403 for custom User-Agent headers; keep the default
    r.raise_for_status()
    return r.content


def fetch_ercot(refresh: bool = False) -> tuple[bytes, dict]:
    """Newest Settlement Points List zip. Returns (zip bytes, document info)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = sorted(CACHE.glob("ercot_sp_list_*.zip"))
    if cached and not refresh:
        f = cached[-1]
        sidecar = f.with_suffix(".json")
        if sidecar.exists():
            return f.read_bytes(), json.loads(sidecar.read_text())
        log.warning("%s has no .json sidecar; run with --refresh to record the document name and date", f.name)
    docs = json.loads(_get(ERCOT_DOC_LIST))["ListDocsByRptTypeRes"]["DocumentList"]
    newest = max((d["Document"] for d in docs), key=lambda d: d["PublishDate"])
    blob = _get(ERCOT_DOWNLOAD.format(newest["DocID"]))
    doc = {"doc_id": newest["DocID"], "name": newest["FriendlyName"], "publish_date": newest["PublishDate"][:10]}
    (CACHE / f"ercot_sp_list_{newest['DocID']}.zip").write_bytes(blob)
    (CACHE / f"ercot_sp_list_{newest['DocID']}.json").write_text(json.dumps(doc))
    return blob, doc


def fetch_eia(refresh: bool = False) -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"eia860_{EIA_YEAR}.zip"
    if not f.exists() or refresh:
        f.write_bytes(_get(EIA_URL))
    return f.read_bytes()


def read_ercot(blob: bytes) -> tuple[pd.DataFrame, pd.DataFrame]:
    z = zipfile.ZipFile(io.BytesIO(blob))
    pick = lambda s: next(n for n in z.namelist() if s in n)  # noqa: E731
    points = pd.read_csv(z.open(pick("Settlement_Points_")))
    units = pd.read_csv(z.open(pick("Resource_Node_to_Unit")))
    return points, units


def read_eia(blob: bytes) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Texas plants (with lat/lon) and generators (operable + proposed)."""
    z = zipfile.ZipFile(io.BytesIO(blob))
    pick = lambda s: next(n for n in z.namelist() if s in n)  # noqa: E731
    plants = pd.read_excel(z.open(pick("2___Plant")), header=1)
    plants = plants[plants["State"] == "TX"].dropna(subset=["Latitude", "Longitude"])
    gens = pd.concat(
        pd.read_excel(z.open(pick("3_1_Generator")), sheet_name=s, header=1) for s in ("Operable", "Proposed")
    )
    return plants.reset_index(drop=True), gens[gens["State"] == "TX"].reset_index(drop=True)


# ----------------------------------------------------------------------------- matching
def _plant_record(plants: pd.DataFrame, code: int) -> dict:
    p = plants[plants["Plant Code"] == code].iloc[0]
    return {
        "eia_plant_code": int(p["Plant Code"]),
        "eia_plant_name": str(p["Plant Name"]),
        "county": str(p["County"]),
        "lat": float(p["Latitude"]),
        "lon": float(p["Longitude"]),
    }


def _plants_have_battery(plants: pd.DataFrame, gens: pd.DataFrame, code: int) -> bool:
    if (gens[(gens["Plant Code"] == code)]["Technology"] == "Batteries").any():
        return True
    return str(plants[plants["Plant Code"] == code].iloc[0].get("Energy Storage", "")).upper() == "Y"


def _finish(records: list[dict], method: str, confidence: str, evidence: str) -> dict:
    lat = sum(r["lat"] for r in records) / len(records)
    lon = sum(r["lon"] for r in records) / len(records)
    if not in_texas(lat, lon):
        return {"status": "unmatched", "reason": f"matched plant is outside Texas bounds ({lat:.3f}, {lon:.3f})"}
    return {
        "status": "matched", "method": method, "confidence": confidence, "lat": round(lat, 5), "lon": round(lon, 5),
        "plants": [{k: r[k] for k in ("eia_plant_code", "eia_plant_name", "county")} for r in records],
        "evidence": evidence,
    }


def match_node(
    node: str, units: list[tuple[str, str]], plants: pd.DataFrame, gens: pd.DataFrame, overrides: dict | None = None,
) -> dict:
    """Place one resource node. ``units`` are (unit substation, unit name) pairs from ERCOT."""
    overrides = overrides or {}

    # 1. Exact: EIA lists this ERCOT node or resource name as the plant's LMP node.
    names = {node} | {f"{s}_{u}" for s, u in units}
    lmp = gens[gens["RTO/ISO LMP Node Designation"].isin(names)]
    if len(lmp):
        codes = sorted(set(int(c) for c in lmp["Plant Code"]))
        recs = [_plant_record(plants, c) for c in codes if (plants["Plant Code"] == c).any()]
        if recs and max(haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) for a in recs for b in recs) <= MAX_CLUSTER_KM:
            return _finish(recs, "eia860_lmp_node", "high", "EIA-860 'RTO/ISO LMP Node Designation' equals " + ", ".join(sorted(set(lmp["RTO/ISO LMP Node Designation"]))))

    # 2. Hand review with cited evidence (checked against EIA so a stale code cannot slip through).
    if node in overrides:
        o = overrides[node]
        rec = _plant_record(plants, int(o["eia_plant_code"]))
        if rec["eia_plant_name"] != o["eia_plant_name"]:
            raise ValueError(f"{node}: override expects plant {o['eia_plant_name']!r} but EIA code {o['eia_plant_code']} is {rec['eia_plant_name']!r}")
        return _finish([rec], "manual_review", "reviewed", f"{o['evidence']} Source: {o['source']}")

    # 3. Name rules.
    keys = {re.sub(r"[^a-z]", "", s.lower()) for s, _ in units} | {re.sub(r"[^a-z]", "", node.split("_")[0].lower())}
    wants_battery = any(u.upper().startswith(("ESR", "ESS")) for _, u in units) or "ESS" in node.upper().split("_")[-1]
    found: dict[int, tuple[str, str]] = {}
    for _, p in plants.iterrows():
        for key in sorted(keys):
            rule = "prefix" if prefix_match(key, p["Plant Name"]) else "abbreviation" if abbreviation_match(key, p["Plant Name"]) else None
            if rule:
                found[int(p["Plant Code"])] = (key, rule)
                break
    rejected = [c for c in found if wants_battery and not _plants_have_battery(plants, gens, c)]
    for c in rejected:
        found.pop(c)
    if not found:
        why = "no EIA-860 Texas plant name matches the substation or node name"
        if rejected:
            why = "name matched only plants with no battery, but this node has a storage unit"
        return {"status": "unmatched", "reason": why}
    recs = [_plant_record(plants, c) for c in sorted(found)]
    spread = max(haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) for a in recs for b in recs)
    if spread > MAX_CLUSTER_KM:
        return {"status": "unmatched", "reason": f"ambiguous: {len(recs)} plants match, {spread:.0f} km apart ({', '.join(r['eia_plant_name'] for r in recs)})"}
    desc = "; ".join(f"'{key}' {rule}-matches plant '{recs[i]['eia_plant_name']}'" for i, (key, rule) in enumerate(found[c] for c in sorted(found)))
    storage = " Storage unit has a battery at the plant." if wants_battery else ""
    initials = {"".join(w[0] for w in words(r["eia_plant_name"])[:4]) for r in recs}
    unit_prefixes = {u.split("_")[0].lower() for _, u in units if "_" in u}
    corroborated = sorted(p.upper() for p in unit_prefixes & initials if len(p) >= 3)
    extra = f" ERCOT unit prefix '{corroborated[0]}' equals the plant name's initials." if corroborated else ""
    return _finish(recs, "name_match", "medium", f"Name rule: {desc}.{storage}{extra}")


# ----------------------------------------------------------------------------- build
def build(points: pd.DataFrame, unit_map: pd.DataFrame, plants: pd.DataFrame, gens: pd.DataFrame, shown: list[tuple[str, str]], overrides: dict, names: dict) -> list[dict]:
    out: list[dict] = []
    for code, kind in shown:
        meta = names.get(code, {})
        base = {"code": code, "name": meta.get("name", code), "region": meta.get("region"), "type": kind}
        if kind == "hub":
            city, lat, lon = HUB_CITIES[code]
            zones = points[points["HUB"] == code]["SETTLEMENT_LOAD_ZONE"].value_counts()
            out.append({
                **base, "load_zone": zones.index[0], "load_zone_share": round(float(zones.iloc[0] / zones.sum()), 2),
                "substation": None, "nearest_hub": code, "geocoded": True, "lat": lat, "lon": lon,
                "coordinate_source": "representative_city", "marker_city": city,
                "match": {"method": "representative_city", "confidence": None, "evidence": f"Hub is a price average, not a place. Drawn at {city}."},
            })
            continue
        rows = points[points["RESOURCE_NODE"] == code]
        if rows.empty:
            raise ValueError(f"{code} is not a resource node in the ERCOT settlement points list")
        zone, sub = rows.iloc[0]["SETTLEMENT_LOAD_ZONE"], rows.iloc[0]["SUBSTATION"]
        us = unit_map[unit_map["RESOURCE_NODE"] == code]
        res = match_node(code, list(zip(us["UNIT_SUBSTATION"], us["UNIT_NAME"])), plants, gens, overrides)
        rec = {**base, "load_zone": zone, "substation": sub, "nearest_hub": ZONE_HUB.get(zone), "ercot_units": [f"{s}_{u}" for s, u in zip(us["UNIT_SUBSTATION"], us["UNIT_NAME"])]}
        if res["status"] == "matched":
            rec |= {
                "geocoded": True, "lat": res["lat"], "lon": res["lon"], "coordinate_source": f"EIA-860 {EIA_YEAR} plant latitude/longitude",
                "match": {k: res[k] for k in ("method", "confidence", "plants", "evidence")},
            }
        else:
            rec |= {"geocoded": False, "lat": None, "lon": None, "coordinate_source": None, "match": {"method": None, "confidence": None, "evidence": res["reason"]}}
        out.append(rec)
    return out


def write_log(locs: list[dict], path: Path, meta: dict) -> None:
    placed = [l for l in locs if l["geocoded"] and l["type"] == "node"]
    missing = [l for l in locs if not l["geocoded"]]
    lines = [
        "# Geocoding log (Phase 11)",
        "",
        "Generated by `python -m scripts.build_locations`. Every settlement point on the Map page is listed here with how its",
        "coordinates were found. A coordinate is only ever copied from an EIA-860 plant record; nothing is estimated.",
        "",
        f"Sources: ERCOT Settlement Points List and Electrical Buses Mapping (`{meta['ercot_doc']}`, published {meta['ercot_publish_date']}); "
        f"EIA-860 {EIA_YEAR} plant file.",
        "",
        f"**Result: {len(placed)} of {sum(l['type'] == 'node' for l in locs)} resource nodes placed, {len(missing)} not geocoded; "
        f"{sum(l['type'] == 'hub' for l in locs)} hubs drawn at representative cities.**",
        "",
        "## Resource nodes",
        "",
        "| Node | Substation | Load zone | Result | Method | Confidence | EIA plant (county) | Lat, lon |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for l in (x for x in locs if x["type"] == "node"):
        if l["geocoded"]:
            plants = "; ".join(f"{p['eia_plant_name']} ({p['county']})" for p in l["match"]["plants"])
            lines.append(f"| `{l['code']}` | {l['substation']} | {l['load_zone']} | placed | {l['match']['method']} | {l['match']['confidence']} | {plants} | {l['lat']}, {l['lon']} |")
        else:
            lines.append(f"| `{l['code']}` | {l['substation']} | {l['load_zone']} | **NOT GEOCODED** | - | - | - | - |")
    lines += ["", "### Evidence", ""]
    for l in (x for x in locs if x["type"] == "node"):
        lines.append(f"- `{l['code']}` (units {', '.join(l['ercot_units'])}): {l['match']['evidence']}")
    lines += ["", "## Not geocoded", ""]
    if missing:
        lines.append("These are listed on the Map page with a \"not placed on the map\" note and have no marker.")
        lines.append("")
        for l in missing:
            lines.append(f"- `{l['code']}`: {l['match']['evidence']}")
    else:
        lines.append("None.")
    lines += ["", "## Hubs", "", "A hub is an average of prices across many buses, so it has no single location. Each marker sits at a representative city.", "",
              "| Hub | Marker city | Lat, lon | Load zone holding most of the hub's buses |", "|---|---|---|---|"]
    for l in (x for x in locs if x["type"] == "hub"):
        lines.append(f"| `{l['code']}` | {l['marker_city']} | {l['lat']}, {l['lon']} | {l['load_zone']} ({l['load_zone_share']:.0%}) |")
    path.write_text("\n".join(lines) + "\n")


def build_all_nodes(points: pd.DataFrame, unit_map: pd.DataFrame, plants: pd.DataFrame, gens: pd.DataFrame, overrides: dict,
                    extra: dict | None = None) -> list[dict]:
    """Phase 12: place every resource node in the ERCOT list.

    Stages, first match wins: EIA-860 annual LMP node, hand overrides, EIA-860 annual name rules
    (all three in ``match_node``), then, when ``extra`` holds them, EIA-860M monthly name rules and
    the ERCOT GIS queue (county-level). See scripts/geocode_extra.py.
    """
    from scripts.geocode_extra import match_eia860m, match_gis

    extra = extra or {}
    nodes = points.dropna(subset=["RESOURCE_NODE"]).drop_duplicates("RESOURCE_NODE")
    units_by = {k: list(zip(g["UNIT_SUBSTATION"], g["UNIT_NAME"])) for k, g in unit_map.groupby("RESOURCE_NODE")}
    buses_by = {k: set(pd.to_numeric(g["PSSE_BUS_NUMBER"], errors="coerce").dropna().astype(int)) for k, g in points.groupby("SUBSTATION")}
    out = []
    for i, row in enumerate(nodes.sort_values("RESOURCE_NODE").itertuples(), 1):
        code, units = row.RESOURCE_NODE, units_by.get(row.RESOURCE_NODE, [])
        res = match_node(code, units, plants, gens, overrides)
        reasons = [f"EIA-860: {res.get('reason')}"] if res["status"] != "matched" else []
        if res["status"] != "matched" and "m_plants" in extra:
            res = match_eia860m(code, units, extra["m_plants"], extra["m_gens"])
            if res["status"] != "matched":
                reasons.append(f"EIA-860M: {res['reason']}")
        if res["status"] != "matched" and "gis" in extra:
            res = match_gis(code, row.SUBSTATION, units, extra["gis"], extra["centroids"], buses_by.get(row.SUBSTATION))
            if res["status"] != "matched":
                reasons.append(f"GIS queue: {res['reason']}")
        rec = {"code": code, "load_zone": row.SETTLEMENT_LOAD_ZONE, "substation": row.SUBSTATION,
               "units": [f"{s}_{u}" for s, u in units]}
        if res["status"] == "matched" and res["method"] != "gis_queue_county" and "gis" in extra:
            # Cross-check plant-level placements against the GIS queue county (validates both sources).
            chk = match_gis(code, row.SUBSTATION, units, extra["gis"], extra["centroids"], buses_by.get(row.SUBSTATION))
            plant_counties = sorted({str(p["county"]).title() for p in res["plants"]})
            rec_check = None if chk["status"] != "matched" else {
                "gis_county": chk["county"], "plant_counties": plant_counties, "agrees": chk["county"] in plant_counties}
        else:
            rec_check = None
        rec["check"] = rec_check
        if rec_check and not rec_check["agrees"]:
            glat, glon = extra["centroids"][rec_check["gis_county"]]
            km = haversine_km(res["lat"], res["lon"], glat, glon)
            rec_check["km"] = round(km)
            if km > CONFLICT_KM:
                # Two public sources put the node far apart: neither is trusted, the node is left unplaced.
                res = {"status": "unmatched", "reason": f"conflict: {res['method']} placed it at {', '.join(p['eia_plant_name'] for p in res['plants'])} "
                       f"({', '.join(rec_check['plant_counties'])} County) but the GIS queue puts it in {rec_check['gis_county']} County, {km:.0f} km away"}
        if res["status"] == "matched":
            county_level = res["method"] == "gis_queue_county"
            plant = None if county_level else "; ".join(f"{p['eia_plant_name']} ({p['county']})" for p in res["plants"])
            rec |= {"lat": res["lat"], "lon": res["lon"], "method": res["method"], "confidence": res["confidence"],
                    "precision": "county" if county_level else "plant", "county": res.get("county"),
                    "plant": plant, "evidence": res["evidence"]}
        else:
            rec |= {"lat": None, "lon": None, "method": None, "confidence": None, "precision": None, "county": None,
                    "plant": None, "evidence": " | ".join(reasons)}
        out.append(rec)
        if i % 100 == 0:
            log.info("geocoded %d / %d nodes", i, len(nodes))
    return out


METHOD_LABEL = {
    "eia860_lmp_node": "EIA-860 LMP node ID (plant, high)",
    "manual_review": "hand review (plant, reviewed)",
    "name_match": "EIA-860 name rule (plant, medium)",
    "eia860m_name_match": "EIA-860M name rule (plant, medium)",
    "gis_queue_county": "ERCOT GIS queue (county-level)",
}


def _rate(rs: list[dict], n: int | None = None) -> str:
    n = len(rs) if n is None else n
    k = sum(r["lat"] is not None for r in rs)
    return f"{k} of {n} ({k / n:.0%})" if n else "0 of 0"


def write_all_nodes_log(recs: list[dict], path: Path, meta: dict, run: list[dict] | None) -> None:
    by_code = {r["code"]: r for r in recs}
    lines = [
        "# Geocoding log, all resource nodes (Phase 12)",
        "",
        "Generated by `python -m scripts.build_locations --all-nodes`. Coordinates are only ever copied from a public record:",
        "an EIA-860 or EIA-860M plant row (plant-level) or, for ERCOT GIS queue matches, a Census county internal point",
        "(county-level: shows the county, not the site). Nothing is estimated. Stages, first match wins:",
        "",
        "1. EIA-860 annual: the node or its ERCOT resource name is the plant's 'RTO/ISO LMP Node Designation'.",
        "2. Hand review: `scripts/location_overrides.json`.",
        "3. EIA-860 annual name rules (prefix / word abbreviation, battery check, matches within 5 km).",
        f"4. EIA-860M monthly ({meta.get('eia860m', 'n/a')}) name rules, same tests, for plants too new for the annual file.",
        f"5. ERCOT GIS interconnection queue ({meta.get('gis_reports', 'n/a')} monthly reports pooled): project name rule or",
        "   substation = POI; all matches in one county; drawn at that county's Census Gazetteer internal point.",
        "",
        f"Sources: ERCOT Settlement Points List (`{meta['ercot_doc']}`, published {meta['ercot_publish_date']}); EIA-860 {EIA_YEAR}; "
        f"EIA-860M {meta.get('eia860m', 'n/a')}; ERCOT GIS reports; Census Gazetteer {meta.get('gazetteer', 'n/a')}.",
        "",
        f"**All {len(recs)} resource nodes in the ERCOT list: {_rate(recs)} placed "
        f"({sum(r['precision'] == 'plant' for r in recs)} plant-level, {sum(r['precision'] == 'county' for r in recs)} county-level).**",
    ]
    if run:
        rr = [by_code.get(n["code"], {"lat": None, "precision": None}) for n in run]
        top = rr[:20]
        lines += [
            f"**The {len(run)} nodes with complete data in the all-node run: {_rate(rr)} placed "
            f"({sum(r['precision'] == 'plant' for r in rr)} plant-level, {sum(r['precision'] == 'county' for r in rr)} county-level).**",
            f"**Top 20 by $/kW-yr: {_rate(top)} placed ({sum(r['precision'] == 'plant' for r in top)} plant-level, "
            f"{sum(r['precision'] == 'county' for r in top)} county-level).**",
        ]
    counts: dict[str, int] = {}
    for r in recs:
        counts[r["method"] or "not placed"] = counts.get(r["method"] or "not placed", 0) + 1
    lines += ["", "| Stage | Nodes |", "|---|---|"]
    lines += [f"| {METHOD_LABEL.get(k, k)} | {counts[k]} |" for k in [*METHOD_LABEL, "not placed"] if k in counts]
    lines += ["", "## Placed", "", "| Node | Substation | Load zone | Stage | Precision | Plant (county) or county | Lat, lon |", "|---|---|---|---|---|---|---|"]
    for r in recs:
        if r["lat"] is not None:
            where = r["plant"] or f"{r['county']} County"
            lines.append(f"| `{r['code']}` | {r['substation']} | {r['load_zone']} | {r['method']} | {r['precision']} | {where} | {r['lat']}, {r['lon']} |")
    lines += ["", "### Evidence", ""]
    lines += [f"- `{r['code']}`: {r['evidence']}" for r in recs if r["lat"] is not None]
    checked = [r for r in recs if r.get("check")]
    disagree = [r for r in checked if not r["check"]["agrees"]]
    lines += ["", "## Cross-check: plant-level placements vs the GIS queue county", "",
              f"For {len(checked)} plant-level nodes the GIS queue rule also finds a county; it agrees with the EIA plant's county for "
              f"{len(checked) - len(disagree)} ({(len(checked) - len(disagree)) / max(len(checked), 1):.0%}). Disagreements are listed for hand review: "
              "either the EIA name match or the queue match is wrong, or the project spans a county line.", "",
              f"Where the two are more than {CONFLICT_KM:.0f} km apart the node is left unplaced.", "",
              "| Node | EIA plant county | GIS queue county | Distance | Result |", "|---|---|---|---|---|"]
    lines += [f"| `{r['code']}` | {', '.join(r['check']['plant_counties'])} | {r['check']['gis_county']} | {r['check']['km']} km | "
              f"{'unplaced (conflict)' if r['lat'] is None else 'kept, plant-level'} |" for r in disagree]
    lines += ["", "## Not placed", "", "| Node | Substation | Load zone | Why not |", "|---|---|---|---|"]
    lines += [f"| `{r['code']}` | {r['substation']} | {r['load_zone']} | {r['evidence']} |" for r in recs if r["lat"] is None]
    path.write_text("\n".join(lines) + "\n")


def write_review_list(recs: list[dict], run: list[dict], path: Path, n: int = 50) -> None:
    """The n highest-earning nodes that no stage placed, for hand review into location_overrides.json."""
    by_code = {r["code"]: r for r in recs}
    todo = [(node, by_code.get(node["code"])) for node in run if (by_code.get(node["code"]) or {}).get("lat") is None][:n]
    lines = [
        f"# Hand review: top {len(todo)} unplaced nodes by $/kW-yr",
        "",
        "Nodes from `results/nodes_2025_2h.json` (2-hour, 2025) that no automatic stage could place, highest revenue first.",
        "To place one, find its plant in EIA-860 or EIA-860M and add an entry to `scripts/location_overrides.json`",
        "(`eia_plant_code`, exact `eia_plant_name`, `evidence`, `source`), then rerun",
        "`python -m scripts.build_locations --all-nodes` and `python -m scripts.run_all_nodes --remerge`.",
        "The override must name an EIA-860 annual plant; coordinates are still copied from EIA, never typed in.",
        "",
        "| Rank | Node | $/kW-yr | Load zone | Substation | ERCOT units | Why the rules failed |",
        "|---|---|---|---|---|---|---|",
    ]
    for node, rec in todo:
        rec = rec or {"substation": node.get("sub"), "units": [], "evidence": "not in the current ERCOT settlement point list"}
        units = ", ".join(rec.get("units") or []) or "–"
        lines.append(f"| {node['rank']} | `{node['code']}` | {node['rev']:.1f} | {node.get('lz') or '–'} | {rec.get('substation') or '–'} | {units} | {rec['evidence']} |")
    path.write_text("\n".join(lines) + "\n")


def main_all_nodes(refresh: bool) -> None:
    from scripts.geocode_extra import county_points, fetch_eia860m, fetch_gis_reports, read_eia860m, read_gis

    overrides = {k: v for k, v in json.loads(OVERRIDES_JSON.read_text()).items() if not k.startswith("_")}
    ercot_blob, doc = fetch_ercot(refresh)
    points, unit_map = read_ercot(ercot_blob)
    plants, gens = read_eia(fetch_eia(refresh))
    m_path, m_label = fetch_eia860m(refresh)
    m_plants, m_gens = read_eia860m(m_path)
    reports = fetch_gis_reports(refresh)
    gis = read_gis(reports)
    centroids, gaz = county_points(refresh)
    log.info("EIA-860M %s: %d ERCOT plants; GIS: %d projects from %d reports", m_label, len(m_plants), len(gis), len(reports))
    recs = build_all_nodes(points, unit_map, plants, gens, overrides,
                           {"m_plants": m_plants, "m_gens": m_gens, "gis": gis, "centroids": centroids})
    meta = {"ercot_doc": doc["name"], "ercot_publish_date": doc["publish_date"], "eia_year": EIA_YEAR, "eia860m": m_label,
            "gis_reports": len(reports), "gis_report_names": [r[0] for r in reports], "gazetteer": gaz,
            "n_nodes": len(recs), "n_nodes_geocoded": sum(r["lat"] is not None for r in recs),
            "n_nodes_county_level": sum(r["precision"] == "county" for r in recs),
            "gis_crosscheck": {"checked": sum(bool(r.get("check")) for r in recs),
                               "agree": sum(bool(r.get("check")) and r["check"]["agrees"] for r in recs)}}
    slim = [{k: r[k] for k in ("code", "load_zone", "substation", "lat", "lon", "method", "confidence", "precision", "county")} for r in recs]
    (RESULTS / "node_locations.json").write_text(json.dumps({"meta": meta, "nodes": slim}, separators=(",", ":")) + "\n")
    run = None
    runs = sorted(RESULTS.glob("nodes_*_*h.json"))
    if runs:
        run = sorted(json.loads(runs[-1].read_text())["nodes"], key=lambda n: n["rank"])
    write_all_nodes_log(recs, RESULTS / "geocoding_log_all_nodes.md", meta, run)
    if run:
        write_review_list(recs, run, RESULTS / "geocoding_review_top50.md")
    log.info("wrote results/node_locations.json: %d of %d placed (%d county-level)", meta["n_nodes_geocoded"], meta["n_nodes"], meta["n_nodes_county_level"])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true", help="re-download the ERCOT and EIA files")
    ap.add_argument("--all-nodes", action="store_true", help="geocode every resource node (Phase 12) into results/node_locations.json")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.all_nodes:
        main_all_nodes(args.refresh)
        return

    index = json.loads((RESULTS / "index.json").read_text())["runs"]
    shown = list(dict.fromkeys((r["location"], r["location_type"]) for r in index))
    shown.sort(key=lambda x: (x[1] != "hub", HUBS.index(x[0]) if x[0] in HUBS else 0))
    names = json.loads(NAMES_JSON.read_text())["locations"]
    overrides = {k: v for k, v in json.loads(OVERRIDES_JSON.read_text()).items() if not k.startswith("_")}

    ercot_blob, doc = fetch_ercot(args.refresh)
    points, unit_map = read_ercot(ercot_blob)
    plants, gens = read_eia(fetch_eia(args.refresh))
    locs = build(points, unit_map, plants, gens, shown, overrides, names)

    meta = {
        "ercot_doc": doc["name"], "ercot_publish_date": doc["publish_date"], "eia_year": EIA_YEAR,
        "hub_footnote": "A hub is a price average over many buses, so it has no single location. Hub markers sit at a representative city and show the hub's area, not a site.",
        "coordinate_policy": "Resource-node coordinates are copied from EIA-860 plant records matched to the node. Nodes that could not be matched have no coordinates and are not drawn.",
        "n_nodes": sum(l["type"] == "node" for l in locs), "n_nodes_geocoded": sum(l["type"] == "node" and l["geocoded"] for l in locs),
    }
    (RESULTS / "locations.json").write_text(json.dumps({"meta": meta, "locations": locs}, indent=1) + "\n")
    write_log(locs, RESULTS / "geocoding_log.md", meta)
    log.info("wrote results/locations.json (%d locations, %d nodes placed of %d)", len(locs), meta["n_nodes_geocoded"], meta["n_nodes"])
    for l in locs:
        if not l["geocoded"]:
            log.warning("NOT GEOCODED %s: %s", l["code"], l["match"]["evidence"])


if __name__ == "__main__":
    main()
