import io
import json

import openpyxl
import pandas as pd
import pytest

from data import fetch_eia860m as f

OP_HEADER = ["Entity ID", "Entity Name", "Plant ID", "Plant Name", "Plant State", "County", "Balancing Authority Code", "Generator ID",
             "Nameplate Capacity (MW)", "Net Summer Capacity (MW)", "Technology", "Operating Month", "Operating Year", "Status",
             "Nameplate Energy Capacity (MWh)", "Latitude", "Longitude"]
PL_HEADER = ["Entity ID", "Entity Name", "Plant ID", "Plant Name", "Plant State", "County", "Balancing Authority Code", "Generator ID",
             "Nameplate Capacity (MW)", "Net Summer Capacity (MW)", "Technology", "Planned Operation Month", "Planned Operation Year", "Status",
             "Latitude", "Longitude"]
OP = "(OP) Operating"


def op(plant, gen, mw, mwh, lat, lon, ba="ERCO", state="TX", tech="Batteries", status=OP, month=3, year=2024, net=None):
    return [1, f"{plant} LLC", hash(plant) % 1000, plant, state, "Harris", ba, gen, mw, mw if net is None else net, tech, month, year, status, mwh, lat, lon]


def pl(plant, gen, mw, lat, lon, ba="ERCO", month=9, year=2027):
    return [2, f"{plant} LLC", 500 + hash(plant) % 1000, plant, "TX", "Bexar", ba, gen, mw, mw, "Batteries", month, year, "(V) Under construction", lat, lon]


@pytest.fixture
def workbook(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Operating"
    ws.append(["Inventory of Operating Generators as of September 2026"])
    ws.append([])
    ws.append(OP_HEADER)
    ws.append(op("Alpha", "G1", 100, 200, 29.12345678, -95.5))
    ws.append(op("Alpha", "G2", 50, 100, 29.12345678, -95.5, month=1, year=2023))  # same plant: merged, earliest date
    ws.append(op("Beta", "B1", 10, 20, None, None))  # no coordinates
    ws.append(op("Gamma", "C1", 30, 60, 31.0, -100.0, ba="SWPP"))  # other balancing authority
    ws.append(op("Delta", "D1", 70, 140, 30.0, -97.0, state="CA"))  # not Texas
    ws.append(op("Epsilon", "E1", 5, 5, 30.0, -97.0, tech="Solar Photovoltaic"))  # not a battery
    ws.append(op("Zeta", "Z1", 40, 80, 32.0, -96.0, status="(OS) Out of service"))  # not in service
    ws.append(op("Eta", "H1", 20, 40, 33.0, -97.0, net=None))
    pws = wb.create_sheet("Planned")
    pws.append(["Inventory of Planned Generators as of September 2026"])
    pws.append([])
    pws.append(PL_HEADER)
    pws.append(pl("Theta", "T1", 150, 29.5, -98.5))
    pws.append(pl("Iota", "I1", 80, None, None))
    pws.append(pl("Kappa", "K1", 60, 35.0, -102.0, ba="SWPP"))
    path = tmp_path / "eia.xlsx"
    wb.save(path)
    return path


def test_release_from_title(workbook):
    assert f.release_from_workbook(workbook) == "2026-09"


def test_build_filters_merges_and_counts(workbook):
    out = f.build(workbook, "2026-09", "https://www.eia.gov/x")
    by = {u["name"]: u for u in out["units"]}
    assert set(by) == {"Alpha", "Eta", "Theta"}
    a = by["Alpha"]
    assert (a["mw"], a["mwh"], a["status"], a["online"], a["ba"]) == (150.0, 300.0, "operating", "2023-01", "ERCO")
    assert (a["lat"], a["lon"]) == (29.1235, -95.5)
    t = by["Theta"]
    assert (t["status"], t["mw"], t["mwh"], t["online"]) == ("planned", 150.0, None, "2027-09")
    assert out["count"] == 3
    assert out["release"] == "2026-09" and out["asOf"] == "2026-09-30"
    d = out["dropped"]
    assert d["operating"]["dropped_no_coords"] == 1
    assert d["operating"]["dropped_other_ba"] == 1
    assert d["operating"]["dropped_not_in_service"] == 1
    assert d["planned"]["dropped_no_coords"] == 1
    assert d["planned"]["dropped_other_ba"] == 1
    assert "ERCOT units only" in out["scope"]
    assert set(a) == {"name", "owner", "county", "lat", "lon", "mw", "mwh", "status", "online", "ba"}


def test_no_balancing_authority_column_keeps_all_texas_and_says_so():
    df = pd.DataFrame([{"Plant State": "TX", "Technology": "Batteries", "Plant ID": 1, "Plant Name": "P", "Entity Name": "O", "County": "C",
                        "Net Summer Capacity (MW)": 10, "Nameplate Capacity (MW)": 11, "Operating Month": 2, "Operating Year": 2020,
                        "Status": OP, "Nameplate Energy Capacity (MWh)": 20, "Latitude": 30.0, "Longitude": -97.0}])
    units, _ = f.parse_units(df, "operating")
    assert len(units) == 1 and units[0]["ba"] is None


def test_nameplate_used_when_net_summer_blank(workbook):
    df = f._read_sheet(workbook, "Operating")
    df.loc[df["Plant Name"] == "Eta", "Net Summer Capacity (MW)"] = None
    units, _ = f.parse_units(df, "operating")
    assert {u["name"]: u["mw"] for u in units}["Eta"] == 20.0


def test_release_links_newest_first_and_downloader_skips_unpublished(monkeypatch):
    html = ('<a href="/electricity/data/eia860m/xls/december_generator2026.xlsx">d</a>'
            '<a href="/electricity/data/eia860m/archive/xls/november_generator2026.xlsx">n</a>'
            '<a href="/electricity/data/eia860m/xls/october_generator2026.xlsx">o</a>'
            '<a href="/electricity/data/eia860m/xls/september_generator2026.xlsx">s</a>')
    links = f.release_links(html)
    assert [r for r, _ in links] == ["2026-12", "2026-11", "2026-10", "2026-09"]

    buf = io.BytesIO()
    openpyxl.Workbook().save(buf)

    class R:
        def __init__(self, content, text=""):
            self.content, self.text = content, text

    def fake_get(url):
        if url == f.PAGE_URL:
            return R(b"", html)
        return R(buf.getvalue()) if "september" in url else R(b"<html>not a workbook</html>")

    monkeypatch.setattr(f, "_get", fake_get)
    content, release, url = f.download_latest()
    assert release == "2026-09" and "september_generator2026" in url and f._is_xlsx(content)


def test_committed_file_matches_contract():
    p = f.OUT_PATH
    d = json.loads(p.read_text())
    assert d["release"] == "2026-09"
    assert d["count"] == len(d["units"]) > 0
    for k in ("source", "sourceUrl", "asOf", "release", "count", "units"):
        assert k in d
    assert {u["status"] for u in d["units"]} <= {"operating", "planned"}
