import pandas as pd

from scripts.geocode_extra import match_gis, strict_abbreviation_match

CENTROIDS = {"Reagan": (31.37, -101.52), "Pecos": (30.87, -102.72), "Bexar": (29.45, -98.52)}


def _gis(rows):
    return pd.DataFrame(rows, columns=["INR", "Project Name", "POI Location", "County", "Fuel", "Technology"])


def test_substation_poi_match_places_at_county_point_and_labels_county_level():
    gis = _gis([["20INR0001", "Something Else", "12345 BIGLAKE 138kV", "Reagan", "SOL", "PV"]])
    r = match_gis("XYZ_RN", "BIGLAKE", [("BIGLAKE", "UNIT1")], gis, CENTROIDS, {12345})
    assert r["status"] == "matched" and r["method"] == "gis_queue_county" and r["confidence"] == "county-level"
    assert (r["lat"], r["lon"]) == CENTROIDS["Reagan"] and r["county"] == "Reagan"


def test_poi_bus_number_must_belong_to_the_nodes_substation():
    # Same substation name in another county, different bus number: not this node.
    gis = _gis([["27INR0620", "st gall Storage", "38355 LEON_CRK 138kV", "Pecos", "OTH", "BA"]])
    r = match_gis("LEONLCPCT1_2", "LEON_CRK", [("LEON_CRK", "LCPCT1")], gis, CENTROIDS, {5001, 5002})
    assert r["status"] == "unmatched"


def test_tapped_line_poi_is_not_a_substation_match():
    gis = _gis([["25INR0587", "Zeus Armstrong BESS", "Tap 345KV 23900 ALIBATES - 23914 TULECNYN", "Reagan", "OTH", "BA"]])
    r = match_gis("BRISCOE_WIND", "TULECNYN", [("BRISCOE", "WIND")], gis, CENTROIDS, {23914})
    assert r["status"] == "unmatched"


def test_matches_in_two_counties_are_ambiguous():
    gis = _gis([
        ["20INR0001", "Biglake Solar", "1 X 138kV", "Reagan", "SOL", "PV"],
        ["21INR0002", "Biglake Solar II", "2 Y 138kV", "Bexar", "SOL", "PV"],
    ])
    r = match_gis("BIGLAKE_RN", None, [("BIGLAKE", "UNIT1")], gis, CENTROIDS)
    assert r["status"] == "unmatched" and "ambiguous" in r["reason"]


def test_storage_node_needs_a_battery_project_for_a_name_match():
    gis = _gis([["20INR0001", "Biglake Solar", "1 X 138kV", "Reagan", "SOL", "PV"]])
    r = match_gis("BIGLAKE_ESS1", None, [("BIGLAKE", "ESR1")], gis, CENTROIDS)
    assert r["status"] == "unmatched"


def test_strict_abbreviation_rejects_short_leads():
    assert not strict_abbreviation_match("pinbess", "Pinewood BESS")
    assert strict_abbreviation_match("russwind", "Russell Wind Farm")
