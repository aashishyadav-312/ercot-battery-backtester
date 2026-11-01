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

MAX_CLUSTER_KM = 5.0  # plants matched to one node must lie this close together
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


def build_all_nodes(points: pd.DataFrame, unit_map: pd.DataFrame, plants: pd.DataFrame, gens: pd.DataFrame, overrides: dict) -> list[dict]:
    """Phase 12: place every resource node in the ERCOT list with the same rules as ``build``.

    Compact records (no unit lists) for results/node_locations.json, which
    scripts/run_all_nodes.py merges into the all-node results.
    """
    nodes = points.dropna(subset=["RESOURCE_NODE"]).drop_duplicates("RESOURCE_NODE")
    units_by = {k: list(zip(g["UNIT_SUBSTATION"], g["UNIT_NAME"])) for k, g in unit_map.groupby("RESOURCE_NODE")}
    out = []
    for i, row in enumerate(nodes.sort_values("RESOURCE_NODE").itertuples(), 1):
        code = row.RESOURCE_NODE
        res = match_node(code, units_by.get(code, []), plants, gens, overrides)
        rec = {"code": code, "load_zone": row.SETTLEMENT_LOAD_ZONE, "substation": row.SUBSTATION}
        if res["status"] == "matched":
            rec |= {"lat": res["lat"], "lon": res["lon"], "method": res["method"], "confidence": res["confidence"],
                    "plant": "; ".join(f"{p['eia_plant_name']} ({p['county']})" for p in res["plants"]), "evidence": res["evidence"]}
        else:
            rec |= {"lat": None, "lon": None, "method": None, "confidence": None, "plant": None, "evidence": res["reason"]}
        out.append(rec)
        if i % 100 == 0:
            log.info("geocoded %d / %d nodes", i, len(nodes))
    return out


def write_all_nodes_log(recs: list[dict], path: Path, meta: dict, ran: set[str] | None) -> None:
    def rate(rs: list[dict]) -> str:
        n = sum(r["lat"] is not None for r in rs)
        return f"{n} of {len(rs)} ({n / len(rs):.0%})" if rs else "0 of 0"

    by_method: dict[str, int] = {}
    for r in recs:
        by_method[r["method"] or "not geocoded"] = by_method.get(r["method"] or "not geocoded", 0) + 1
    lines = [
        "# Geocoding log, all resource nodes (Phase 12)",
        "",
        "Generated by `python -m scripts.build_locations --all-nodes`, with the same rules as the Phase 11 log",
        "(`geocoding_log.md`): coordinates are only ever copied from an EIA-860 plant record; nothing is estimated.",
        "",
        f"Sources: ERCOT Settlement Points List and Electrical Buses Mapping (`{meta['ercot_doc']}`, published {meta['ercot_publish_date']}); "
        f"EIA-860 {EIA_YEAR} plant file.",
        "",
        f"**Match rate: {rate(recs)} resource nodes in the ERCOT list placed.**",
    ]
    if ran is not None:
        in_list = [r for r in recs if r["code"] in ran]
        placed = sum(r["lat"] is not None for r in in_list)
        gone = len(ran) - len(in_list)
        lines.append(f"**Of the {len(ran)} nodes with complete data in the all-node run: {placed} placed ({placed / len(ran):.0%})"
                     + (f"; {gone} no longer in the ERCOT list, so not geocoded" if gone else "") + ".**")
    lines += ["", "| Method | Nodes |", "|---|---|"] + [f"| {k} | {v} |" for k, v in sorted(by_method.items(), key=lambda kv: -kv[1])]
    lines += ["", "## Placed", "", "| Node | Substation | Load zone | Method | Confidence | EIA plant (county) | Lat, lon |", "|---|---|---|---|---|---|---|"]
    for r in recs:
        if r["lat"] is not None:
            lines.append(f"| `{r['code']}` | {r['substation']} | {r['load_zone']} | {r['method']} | {r['confidence']} | {r['plant']} | {r['lat']}, {r['lon']} |")
    lines += ["", "## Not geocoded", "", "| Node | Substation | Load zone | Reason |", "|---|---|---|---|"]
    for r in recs:
        if r["lat"] is None:
            lines.append(f"| `{r['code']}` | {r['substation']} | {r['load_zone']} | {r['evidence']} |")
    path.write_text("\n".join(lines) + "\n")


def main_all_nodes(refresh: bool) -> None:
    overrides = {k: v for k, v in json.loads(OVERRIDES_JSON.read_text()).items() if not k.startswith("_")}
    ercot_blob, doc = fetch_ercot(refresh)
    points, unit_map = read_ercot(ercot_blob)
    plants, gens = read_eia(fetch_eia(refresh))
    recs = build_all_nodes(points, unit_map, plants, gens, overrides)
    meta = {"ercot_doc": doc["name"], "ercot_publish_date": doc["publish_date"], "eia_year": EIA_YEAR,
            "n_nodes": len(recs), "n_nodes_geocoded": sum(r["lat"] is not None for r in recs)}
    slim = [{k: r[k] for k in ("code", "load_zone", "substation", "lat", "lon", "method", "confidence")} for r in recs]
    (RESULTS / "node_locations.json").write_text(json.dumps({"meta": meta, "nodes": slim}, separators=(",", ":")) + "\n")
    ran = None
    runs = sorted(RESULTS.glob("nodes_*_*h.json"))
    if runs:
        ran = {n["code"] for n in json.loads(runs[-1].read_text())["nodes"]}
    write_all_nodes_log(recs, RESULTS / "geocoding_log_all_nodes.md", meta, ran)
    log.info("wrote results/node_locations.json: %d of %d resource nodes placed", meta["n_nodes_geocoded"], meta["n_nodes"])


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
