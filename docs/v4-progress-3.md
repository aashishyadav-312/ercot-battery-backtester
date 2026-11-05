# V4 Step 3 progress: geo data and feature flag

Branch `v4/3-geo`. Status: done, PR ready for review.

## Done
- `web/src/config/features.ts`: `V4` flag (`VITE_V4=1`, or `?v4=1` before or after the `#`), with a pure `v4Enabled()` and tests.
- `web/scripts/build-v4-geo.mjs`: builds everything below from Census files. Nothing typed by hand.
- `results/v4/geo/` (copied to `public/data/v4/geo/` by `web/scripts/copy-data.mjs`, new additive block):
  - `tx_counties.topo.json`: 254 counties, 92 KB (32 KB gzipped), properties `fips`, `name`.
  - `county_index.json` (extra file, not in the contract): per county name, FIPS, a point inside it, bounds. Lets search and zoom work without decoding TopoJSON in the browser.
  - `places.json`: 18 places (10 largest plus 8 regional anchors).
  - `node_index.json`: 425 entries (420 resource nodes with coordinates + 5 hubs). Extra optional fields: `kind`, `precision`, `hub`.
  - `SOURCES.json`: sources, vintages, selection rule, the list of nodes without coordinates.
- `web/src/v4/geo/`: `search.ts` (county, city and lat/long search), `nearest.ts` (haversine, k nearest nodes, nearest hub), `load.ts` (lazy loaders, TopoJSON to GeoJSON), `types.ts`.
- Tests: `web/src/config/features.test.ts`, `web/src/v4/geo/geo.test.ts`.

## Sources (as of 2026-11-05)
- Counties: Census cartographic boundary file 2025, 1:500k. https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip. Simplified with mapshaper 0.7.101 (`-simplify 12% keep-shapes`).
- Population: Census Vintage 2025 city estimates, `POPESTIMATE2025`, incorporated places. https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/cities/totals/sub-est2025.csv
- Place coordinates: Census 2025 Gazetteer, internal point. https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_gaz_place_48.txt
- Node coordinates: `results/node_locations.json` and `results/locations.json` (existing, unchanged).

## Assumptions and notes
- Anchor rule: the largest not-yet-chosen place in each of 8 lat/lon boxes (West Texas, Big Country, Panhandle, North Texas Red River, East Texas, Southeast coast, The Valley, Rio Grande border). The boxes are my choice; the city in each comes from the Census population. Result: Laredo, Amarillo, Brownsville, Midland, Abilene, Tyler, Beaumont, Wichita Falls. South Plains is covered by Lubbock (top 10).
- 92 of the 420 coordinates are `precision: "county"` (centre of the interconnection-queue county, about 10 to 50 km off). Hubs are drawn at a representative city. The nearest-node list in Steps 4 and 5 should say so.
- `nearestNodes()` returns hubs separately. `nearestHub` is by distance to the hub's marker city; `zoneHub` is the hub of the nearest node's load zone, which is the better price reference.
- 623 of the 1,043 ERCOT resource nodes have no coordinates and are not indexed (listed in `SOURCES.json`). All 296 nodes in the 2025 results that have coordinates are indexed (tested).
- `copy-data.mjs` now also copies `results/v4/**/*.json` and hashes them, so the data-version string changes once (browsers refetch once). Existing files and schemas are untouched.
- `topojson-client` moved from devDependencies to dependencies (decision: one source of truth, about 4 KB). `countiesGeoJson()` in `web/src/v4/geo/load.ts` decodes `tx_counties.topo.json` to GeoJSON for ECharts `registerMap`; Step 4 uses it. It is only reached from V4 code, so it does not enter the main bundle until Step 4 imports it.
- First-visit cost: nothing loads until a V4 screen asks. Total geo files about 185 KB raw.

## Resume / re-run
- Rebuild data: `node web/scripts/build-v4-geo.mjs` (`--refresh` to redownload; needs network and `npx`).
- Tests: `cd web && npx vitest run src/v4 src/config`.

## Test status
- Web: `npm test` and `npm run build` pass.
- pytest: 2 failures (`test_ancillary.py::test_hourly_awards_are_held_and_capacity_share_is_obeyed`, `test_fetch_ancillary.py::test_missing_prices_do_not_become_zero_revenue`) also fail on `main` (40ae166) with pulp 4.2.0: `TypeError: A False object cannot be passed as a constraint`. Not caused by this step.
