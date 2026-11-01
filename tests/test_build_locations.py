import json
from pathlib import Path

import pandas as pd
import pytest

from scripts.build_locations import abbreviation_match, match_node, prefix_match

ROOT = Path(__file__).resolve().parent.parent


def _plants(*rows):
    return pd.DataFrame(rows, columns=["Plant Code", "Plant Name", "County", "Latitude", "Longitude", "Energy Storage"])


def _gens(*rows):
    return pd.DataFrame(rows, columns=["Plant Code", "Technology", "RTO/ISO LMP Node Designation"])


def test_prefix_and_abbreviation_rules():
    assert prefix_match("anson", "ANSON Solar Center, LLC")
    assert not prefix_match("anson", "Hanson")  # must start, not contain
    assert prefix_match("russekst", "Russek")  # ERCOT adds 'ST'
    assert not prefix_match("abc", "Abcdef")  # keys under 5 letters are too weak
    assert abbreviation_match("camwind", "Cameron Wind 1 LLC")
    assert abbreviation_match("wipopa", "Winchester Power Park")
    assert not abbreviation_match("camwind", "Camp Wood Solar")


def test_exact_lmp_designation_wins():
    plants = _plants((1, "Some Plant", "Reagan", 31.0, -101.0, "N"), (2, "Anson Solar", "Jones", 32.8, -99.9, "N"))
    gens = _gens((1, "Solar Photovoltaic", "FOO_UNIT1"))
    r = match_node("FOO_RN", [("FOO", "UNIT1")], plants, gens)
    assert r["status"] == "matched" and r["method"] == "eia860_lmp_node" and r["confidence"] == "high"
    assert (r["lat"], r["lon"]) == (31.0, -101.0)


def test_name_match_needs_battery_for_storage_unit():
    plants = _plants((1, "Cameron Wind 1 LLC", "Cameron", 26.2, -97.5, "N"))
    wind_only = _gens((1, "Onshore Wind Turbine", None))
    r = match_node("CAMWIND_RN", [("CAMWIND", "ESR1")], plants, wind_only)
    assert r["status"] == "unmatched" and "no battery" in r["reason"]
    with_battery = _gens((1, "Onshore Wind Turbine", None), (1, "Batteries", None))
    assert match_node("CAMWIND_RN", [("CAMWIND", "ESR1")], plants, with_battery)["status"] == "matched"


def test_distant_candidates_are_ambiguous_and_never_placed():
    plants = _plants((1, "Sunset Solar", "A", 30.0, -97.0, "N"), (2, "Sunset Solar 2", "B", 33.0, -100.0, "N"))
    r = match_node("SUNSET_RN", [("SUNSET", "UNIT1")], plants, _gens((1, "Solar Photovoltaic", None)))
    assert r["status"] == "unmatched" and "ambiguous" in r["reason"]
    assert "lat" not in r


def test_no_match_is_not_guessed():
    r = match_node("ZZZZZ_RN", [("ZZZZZ", "UNIT1")], _plants((1, "Other", "A", 30.0, -97.0, "N")), _gens((1, "x", None)))
    assert r == {"status": "unmatched", "reason": "no EIA-860 Texas plant name matches the substation or node name"}


def test_override_plant_name_is_checked():
    plants = _plants((9, "Real Name", "A", 30.0, -97.0, "Y"))
    ov = {"FOO_RN": {"eia_plant_code": 9, "eia_plant_name": "Stale Name", "evidence": "e", "source": "s"}}
    with pytest.raises(ValueError):
        match_node("FOO_RN", [], plants, _gens((9, "Batteries", None)), ov)


def test_committed_locations_cover_every_current_location():
    index = json.loads((ROOT / "results" / "index.json").read_text())["runs"]
    locs = {l["code"]: l for l in json.loads((ROOT / "results" / "locations.json").read_text())["locations"]}
    assert {r["location"] for r in index} == set(locs)
    for l in locs.values():
        assert l["type"] in ("hub", "node") and l["load_zone"]
        if l["geocoded"]:
            assert 25 < l["lat"] < 37 and -107 < l["lon"] < -93 and l["coordinate_source"]
        else:
            assert l["lat"] is None and l["lon"] is None  # never a guessed coordinate
    assert all(locs[h]["coordinate_source"] == "representative_city" for h in locs if locs[h]["type"] == "hub")
    log = (ROOT / "results" / "geocoding_log.md").read_text()
    assert all(f"`{c}`" in log for c in locs)
