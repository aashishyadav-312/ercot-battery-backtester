# ERCOT Battery Backtester: Version 2 plan

## Where v1 stands (reviewed Nov 1, 2026, commit 57ff80c)

v1 is already strong: 180 precomputed runs (5 hubs, 5 resource nodes, 1/2/4h, 2024-2026, two degradation settings),
six pages (Overview, Revenue, Dispatch, Compare, Realism, Method), URL state, light/dark, CSV/PNG downloads,
a DA-schedule/RT-settle capture rate, a before/after RTC+B view, CI, and a monthly refresh workflow.

What holds it back from being a tool other people use:

1. **It is a viewer, not a tool.** Users can only pick from 180 precomputed runs. They cannot enter their own size,
   efficiency, degradation or location.
2. **Ten locations.** ERCOT has ~735 resource nodes with data; the most interesting finding (congested nodes earn 2-4x)
   only shows on 5 of them.
3. **Jargon with no on-ramp.** HB_HOUSTON, RUSSEKST_RN, $/kW-yr, capture rate, RTC+B, perfect foresight are unexplained
   for a newcomer.
4. **No geography.** Location is the main story, but there is no map.
5. **Energy arbitrage only.** ERCOT batteries earn a large share from ancillary services; leaving them out understates
   revenue and is the first question an industry reader will ask.
6. **No project economics.** Revenue stops at $/kW-yr; developers and lenders think in capex, NPV, IRR, payback.
7. **Not live.** Data refreshes monthly.
8. **No author/about/feedback.** Someone receiving the link by email cannot see who built it or how to reach you.

## Vision for v2

"An open ERCOT storage value explorer": anyone can click a node on a Texas map, see what a battery there would have
earned (energy + ancillary services), run their own battery and project economics in the browser, see today's prices
live, and learn the market from a built-in primer. Every number is reproducible from public data.

## Order (most visible value first)

| Phase | What | Model / effort | Why this order |
|---|---|---|---|
| 9 | v1 polish: names, glossary, about, freshness | Sonnet, low | Cheap, makes it shareable now |
| 10 | "Start here" learning section | Sonnet, medium | Biggest gain for newcomers |
| 11 | Texas map with clickable nodes | Sonnet, medium | Most visual, most shareable |
| 12 | All-node coverage (map heat layer) | Opus, medium | Makes the map meaningful |
| 13 | Project economics (NPV/IRR/payback) | Sonnet, medium | Speaks developer/lender language |
| 14 | Ancillary services revenue stacking | Opus, high | Closes the biggest realism gap |
| 15 | Custom runs in the browser | Opus, high | Turns viewer into a tool |
| 16 | "Today in ERCOT" live page | Opus, high | Live data, needs a small backend |
| 17 | Context layers (fleet, queue, weather, solar) | Sonnet, medium | Explains why revenue moves |

Rules for every phase (same as v1): one new Claude Code session per phase; read PLAN.md and PLAN_V2.md first; keep
`pytest` and the web build passing; run `web/scripts/screenshots.mjs` before and after UI work; update README and
FINDINGS when numbers change; end with "commit and push" on a branch and open a PR.

## Open-source and free data to add

| Need | Option | Notes |
|---|---|---|
| In-browser optimizer | `highs-js` (HiGHS compiled to WebAssembly) | Same solver as v1 (PuLP + HiGHS), so results match |
| Fast data in browser | Apache Arrow / Parquet + `duckdb-wasm` or `hyparquet` | Compact per-node price files |
| Map | ECharts `geo` / map series (already a dependency) first; MapLibre GL JS + OpenStreetMap tiles if you want a real basemap | Start with ECharts: no new library |
| Texas outline / counties | `us-atlas` TopoJSON (public domain Census data) | |
| Node coordinates | ERCOT "Settlement Points List and Electrical Buses Mapping" (substation names) + EIA-860 plant file (plant latitude/longitude) | Match resource names to plants; hand-fix the few that fail |
| Ancillary prices | ERCOT public data via `gridstatus` (open-source library) | Day-ahead AS and, after RTC+B, real-time AS prices |
| Battery fleet growth | EIA API (free key), EIA-860M | Explains falling spreads (finding 4) |
| Where storage is being built | ERCOT GIS interconnection queue report (monthly, public) | Map layer of planned storage by county |
| Weather on spike days | Open-Meteo (free, no key, works from browser) | |
| Better degradation | NREL BLAST-Lite (open source) | Replace flat $/MWh with cycle + calendar aging |
| Live data | ERCOT public API (key kept server-side) or gridstatus hosted API | See Phase 16 |
| Backend for live | Cloudflare Worker + Cron Trigger (free tier) | Holds API keys, caches, serves JSON to the static site |
| Usage analytics | GoatCounter (free, no cookies) | Know if Aurora opened your link |

**gridstatus hosted API:** it has a free tier with a monthly row limit (check the exact limit on your account's usage
page; it has changed over time). Two cautions: never put the key in browser code (use the Worker), and check their
terms before re-publishing their data on a public site. ERCOT's own public data has no such issue, so prefer ERCOT
for anything shown publicly and use gridstatus for convenience in your own pipeline.

---

## Phase prompts (copy-paste one per new session)

### Phase 9: v1 polish

Read PLAN.md and PLAN_V2.md. Do Phase 9 only.
1. Friendly location names everywhere a code appears: keep the code, add a label and region, e.g.
   "Houston Hub (HB_HOUSTON)", "Russek St, West Texas resource node (RUSSEKST_RN)". Put the mapping in one JSON file.
2. A glossary JSON (perfect foresight, capture rate, $/kW-yr, $/kWh-yr, cycles, spread captured, hub, resource node,
   load zone, DA, RT, RTC+B, degradation cost, top-10-day share). Show an info icon with a tooltip next to every KPI
   label and chart title that uses one of these terms.
3. A "Data through <date>" badge in the header, read from results/index.json.
4. An About section and footer: author (Aashish Yadav, Duke MEM, LinkedIn, GitHub), "independent project, not
   affiliated with ERCOT or any company", data sources and license, "report an issue" link to GitHub Issues.
5. Open Graph and Twitter card meta tags with a 1200x630 preview image generated from the Overview screenshot, so the
   link previews well on LinkedIn and in email.
6. Add GoatCounter (privacy-friendly) page counts.
Acceptance: no raw code appears without a label; every KPI has a tooltip; build and tests pass; before/after
screenshots for Overview and Compare. Commit, push, open a PR.

### Phase 10: "Start here" learning section

Read PLAN.md and PLAN_V2.md. Do Phase 10 only. Add a page named "Start here" as the first nav item (route
`#/start`), and show a one-time banner on Overview linking to it for first-time visitors (remember dismissal in
localStorage inside try/catch). Sections:
1. "ERCOT in 2 minutes": what ERCOT is, hubs vs load zones vs resource nodes, day-ahead vs real-time prices, why
   prices spike. Plain language, short paragraphs, one small diagram each.
2. "How a battery makes money here": an interactive one-day walkthrough. User picks a date (default: the best day of
   2025 at HB_HOUSTON); show that day's 15-minute prices with the battery's charge/discharge bars and state of charge,
   and a step-through (Prev/Next) that explains each charge and discharge block. Use data already in results JSON;
   add a small per-day price file only for the featured days if needed.
3. "How to read this site": one card per page (Overview, Revenue, Dispatch, Compare, Realism, Method) with a thumbnail,
   the question it answers, and a link that opens it with sensible defaults.
4. "What this model leaves out": perfect foresight, ancillary services, degradation, interconnection, taxes, with a
   link to Method.
5. "Ideas and feedback": link to GitHub Issues with an issue template for feature requests.
Reuse the glossary from Phase 9. Acceptance: a newcomer can go from Start here to a configured Overview in two
clicks; phone and desktop screenshots in light and dark. Commit, push, open a PR.

### Phase 11: Texas map with clickable nodes

Read PLAN.md and PLAN_V2.md. Do Phase 11 only. Add a "Map" page (route `#/map`), second in the nav.
1. Data: write `scripts/build_locations.py` that produces `results/locations.json` with, for each settlement point we
   show: code, friendly name, type (hub, resource node), load zone, latitude, longitude, and coordinate source.
   Get substation names from ERCOT's public Settlement Points List and Electrical Buses Mapping; get coordinates by
   matching resource names to the EIA-860 plant file (plant latitude/longitude). Hubs have no single point: draw
   them as labeled region markers at a representative city (Houston, Dallas/North, San Antonio/South, Midland/West,
   Amarillo/Panhandle) and say so in a footnote. Log every node you could not geocode; never guess a coordinate.
2. Map: use ECharts' geo/map series with a Texas outline and counties from `us-atlas` TopoJSON (no new mapping
   library). Markers sized by $/kW-yr and colored by capture rate, for the selected duration, year and degradation.
3. Click a marker: a side panel (not a modal) with name, type, load zone, $/kW-yr, capture rate, top-10-day share,
   a 12-month sparkline, node vs nearest hub, and buttons "Open in Overview" and "Compare with hub". Hover shows a
   tooltip with name and $/kW-yr.
4. Legend, zoom/pan, a search box to jump to a node, and the existing selectors driving the map.
Acceptance: all 10 current locations appear and click through; geocoding log committed; screenshots phone/desktop,
light/dark. Commit, push, open a PR.

### Phase 12: All-node coverage

Read PLAN.md and PLAN_V2.md. Do Phase 12 only. Goal: every resource node with complete 2025 data on the map for one
standard configuration (2h, 85% RTE, $10/MWh), so the map shows where congestion pays.
1. Fetch efficiently: request RT settlement point prices by interval or day for all settlement points at once from
   ERCOT's public data (one file holds every point), not one node at a time. Cache to data/raw. Respect rate limits;
   reuse the existing ERCOT_FAIL_FAST behavior.
2. Run the existing daily LP for every node (perfect foresight and DA-scheduled). Store only summary metrics per node
   in `results/nodes_2025_2h.json` (code, $/kW-yr, capture rate, top-10 share, cycles, avg spread, corr. with hub),
   plus monthly revenue for the sparkline. Keep full daily results only for the existing 10 locations.
3. Geocode the new nodes with Phase 11's script; report the match rate.
4. Map: add a "heat" mode showing all nodes, colored by $/kW-yr with a quantile scale; keep the 10 detailed locations
   highlighted. Add a sortable "Top nodes" table under the map.
5. Add a FINDINGS section: distribution of node revenue vs hub, the top 20 nodes and which load zones they sit in.
Acceptance: runtime and data size reported in the PR; site still loads fast (lazy-load the all-node file only on the
Map page). Commit, push, open a PR.

### Phase 13: Project economics

Read PLAN.md and PLAN_V2.md. Do Phase 13 only. Add an "Economics" page (route `#/economics`).
Inputs (with defaults shown and editable): installed cost $/kWh, fixed O&M $/kW-yr, augmentation cost and year,
project life, discount rate, investment tax credit % (user input; do not hardcode current tax law), revenue
haircut % (to move from perfect foresight toward realistic), annual revenue decline %.
Revenue comes from the selected location/duration/year (perfect foresight or DA-scheduled, toggle).
Outputs: NPV, IRR, simple payback, levelized cost of storage, breakeven capex, and a sensitivity tornado chart.
Keep all math in one TypeScript module with unit tests. Explain each input with the glossary tooltip.
State clearly on the page: "Illustrative screening model, not investment advice."
Acceptance: unit tests for NPV/IRR against a hand-checked example; screenshots. Commit, push, open a PR.

### Phase 14: Ancillary services revenue stacking

Read PLAN.md and PLAN_V2.md. Do Phase 14 only. Extend the daily LP to co-optimize energy and ERCOT ancillary
services (Regulation Up, Regulation Down, Responsive Reserve, ECRS, Non-Spin) with the battery's MW and state-of-
charge constraints (reserved capacity must be backed by energy for the product's required duration).
1. Fetch historical ancillary service clearing prices from ERCOT public data (use the open-source gridstatus library).
   Handle the market change at RTC+B (Dec 5, 2025): before it, day-ahead AS prices; after it, real-time AS prices
   too. Document exactly which prices the model uses for each period.
2. Keep the energy-only model as a selectable "strategy" so existing results remain comparable.
3. Add a revenue stack chart (energy vs each AS product) on Overview and Revenue, and update the before/after RTC+B
   view with the AS split.
4. Validate: total revenue should be in the same range as published ERCOT battery revenue benchmarks; explain any gap
   in Method and FINDINGS.
Acceptance: tests for the new constraints (AS reserve never exceeds available power or energy); runtime reported.
Commit, push, open a PR.

### Phase 15: Custom runs in the browser

Read PLAN.md and PLAN_V2.md. Do Phase 15 only. Let users run their own battery without a server.
1. Publish per-location price files (15-min RT and hourly DA, one file per location-year, compressed Parquet or
   Arrow). If total size is too large for GitHub Pages, host them on Cloudflare R2 or a Hugging Face dataset and
   document it.
2. Port the daily LP to the browser with `highs-js` (WebAssembly HiGHS) running in a Web Worker, with a progress bar.
3. A "Custom run" panel: location (from all nodes), power MW, duration (any value 0.5-8h), round-trip efficiency,
   degradation $/MWh, date range, strategy (perfect foresight or DA-scheduled).
4. Results render in the existing Overview components. The URL encodes the inputs so a custom run can be shared.
5. Test that browser results match the Python results for 3 precomputed runs within 0.5%.
Acceptance: a full-year 2h run finishes in under ~20 seconds on a laptop; parity test passes. Commit, push, open a PR.

### Phase 16: "Today in ERCOT" live page

Read PLAN.md and PLAN_V2.md. Do Phase 16 only. Add a "Live" page (route `#/live`) that updates through the day.
1. Backend: a Cloudflare Worker (free tier) in `/worker`, with a Cron Trigger every 5-15 minutes, that fetches
   today's real-time settlement point prices for the 5 hubs and the featured nodes, and tomorrow's day-ahead prices
   once they post. Keep API keys as Worker secrets; cache results in Workers KV; serve JSON with CORS for the
   GitHub Pages origin only. Prefer ERCOT's public API as the source. Add the gridstatus hosted API as a fallback only
   if its terms allow re-publishing, and track usage against the free tier.
2. Page: current hub prices with color-coded change, today's 15-minute price chart per hub, "best possible battery
   so far today" (run the LP on today's prices to now), "tomorrow's plan" (DA-scheduled dispatch for tomorrow), a
   price-spike alert banner when RT price passes a threshold, and a "last updated" time.
3. Graceful failure: if the Worker or ERCOT is down, show the last cached data with its timestamp.
4. Document deploy steps (wrangler) and costs ($0 on free tiers) in README.
Acceptance: page works with the Worker running locally (`wrangler dev`) and deployed; no secrets in the repo.
Commit, push, open a PR.

### Phase 17: Context layers (why revenue moves)

Read PLAN.md and PLAN_V2.md. Do Phase 17 only. Add a "Context" section to Revenue and optional map layers:
1. ERCOT battery fleet MW by month from the EIA API (EIA-860M), plotted against monthly arbitrage revenue.
2. Planned storage by county from ERCOT's monthly GIS interconnection queue report, as a map layer.
3. Weather on the top-10 days from Open-Meteo (temperature at the hub city), shown in the day tooltip.
4. Solar and wind share by hour from ERCOT fuel mix (via the gridstatus library), overlaid on the dispatch heatmap.
Keep claims descriptive ("revenue fell while fleet MW rose"), never causal. Commit, push, open a PR.
