# V4 Step 4 progress: map context and place search

Branch `v4/4-map`. Status: done, PR ready for review. Everything is behind the `V4` flag (`?v4=1` or `VITE_V4=1`).

## Done
- `web/src/v4/map/view.ts`: zoom, pan and clamping on the existing spec projection, `unproject`, click to lat/long, county outline paths from `countiesGeoJson()`, county fade-in by zoom (none at the full view, full by about 2.1x).
- `web/src/v4/map/labels.ts`: city markers and labels. Biggest city first, a label is kept only if it touches no other label or marker. 8 labels at full view, 12 at mid zoom, up to 20 when zoomed in. Text stays one size on screen as the map zooms.
- `web/src/v4/map/SiteSearch.tsx`: combobox over counties, cities and "lat, long". `/` focuses it (not while typing in another field), arrows move, Enter picks, Esc clears the box, a second Esc clears the pinned site. A point outside Texas is shown but cannot be picked.
- `web/src/v4/map/AtlasSite.tsx` (+ CSS module): the wrapper. Search, "Pick a site" toggle (a click drops a pin; node clicks pause while it is on), zoom in / out / reset buttons, drag to pan when zoomed, county outline of a searched county in amber, pin, and the nearest 3 nodes with distance, county and a "county-level location" tag. Nearest nodes are limited to nodes that have prices in the loaded run, so every row opens on the page. Until Step 5, this list is the pinned-site panel; `SitePanel` is the slot the Site Value card replaces.
- `AtlasMap.tsx` takes one optional `v4` prop (view box, zoom, extra layers behind and in front, picking, svg props). Without it nothing changes. `Atlas.tsx` loads the wrapper with `React.lazy` only when `V4` is on, and passes the legend through as children.
- Tests: `web/src/v4/map/map.test.ts` (13: projection round trip, click mapping, view limits for all 254 counties, county paths, label collisions) and `AtlasSite.test.tsx` (9: Jack County search and the nearest 3, selecting a node, lat/long and out-of-Texas, keyboard, `/`, pick mode, zoom, lazy loading).

## Decisions (minor, noted for the PR)
- The Atlas map is plain SVG, not ECharts. County outlines are drawn from `countiesGeoJson()` with the map's own projection, so no `registerMap` is needed.
- No `--text-2` token exists. City labels use `--muted`, county lines `--line-2`, the pin `--amber` with a `--text` outline. No new colours.
- Wheel zoom is not hooked, so the page still scrolls over the map. Zoom buttons and search are the keyboard path; drag pans when zoomed. While zoomed, the map sets `touch-action: none`, so on a phone a drag over the map pans it instead of scrolling the page.
- The nearest hub line shows both the nearest hub marker and, when different, the load-zone hub of the nearest node (see `docs/v4-progress-3.md`).
- County lines, city markers and the pin keep a constant line weight when zoomed. Node dots shrink with the square root of zoom so they stay apart.

## Data cost (first visit with V4 on)
- Lazy chunk `AtlasSite` about 16 KB raw (6.7 KB gzipped, includes `topojson-client`). `places.json` and `county_index.json` load when the Atlas opens; `tx_counties.topo.json` (32 KB gzipped) only when zoom passes 1.3x or a county is searched; `node_index.json` only when a site is pinned.

## Resume
- Tests: `cd web && npx vitest run src/v4 src/pages/Atlas.test.tsx`.
- See it: `cd web && VITE_V4=1 npm run dev`, open `#/atlas`. Or `?v4=1` on a normal build.

## Test status
- See the PR description for the final run.
