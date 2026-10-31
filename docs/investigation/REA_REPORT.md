# REA investigation: gridstatus.io/live/ercot

> **Update (local run, same day):** a second REA run from the user's own machine loaded the real
> dashboard, inventoried 253 scripts and confirmed the libraries. Its report and evidence are
> `local-rea-inspection.txt`, `local-rea-evidence-summary.json` and `local-rea-dashboard.png`.
> **Section 6 below replaces the guesses in section 3.** Sections 1–2 record the cloud run, which was blocked.

## Cloud run

**Date:** 2026-10-31 · **Where:** the Claude Code cloud container (not the user's laptop)
**Result:** The browser and REA both worked, but **Cloudflare blocked the page**. No part of the dashboard was observed.

## 1. Environment check: passed
| Step | Result |
|---|---|
| Browser available? | Yes. Playwright-supplied Chromium 153 at `/opt/pw-browsers/chromium-1243/`. Nothing to install. |
| Dedicated browser | Launched `--headless=new` with a temporary `--user-data-dir` in the scratchpad and `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222`. `/json/version` responded. |
| REA tools | `rea-agents@6.8.0` MCP server connected. |
| `list_browser_targets` (filtered to `https://www.gridstatus.io`) | 1 page target, `7BCEC1B4…`, URL `https://www.gridstatus.io/live/ercot`, **title "Attention Required! \| Cloudflare"** |

## 2. What REA observed: confirmed
Evidence from `inspect_web_page` (`ev_12b04401…`) and `capture_web_screenshot` (`ev` artifact sha256 `a39292d4…`):
- The DOM (154 nodes) is Cloudflare's block page. The H1 reads "Sorry, you have been blocked" and the H2 "You are unable to access gridstatus.io". The page shows Cloudflare Ray ID `a5309a5f5ccab086`.
- The only resources loaded were Cloudflare's own block-page files (`/cdn-cgi/styles/cf.errors.css` and two `/cdn-cgi/images/*.png`), plus three small inline scripts of 46–375 bytes and the Cloudflare beacon.
- **No application scripts, charts, map, controls or API traffic loaded**, so REA had nothing of the dashboard to analyze.
- Screenshot: [`rea-cloud-capture-blocked.png`](rea-cloud-capture-blocked.png)

Earlier, outside REA (plain `curl` and Playwright in this container): the site returns HTTP 403 from Cloudflare. Its HTTP 103 Early Hints response carries `link: <https://app-api.gridstatus.io>; rel=preconnect`. **Confirmed:** the frontend talks to a separate API host, `app-api.gridstatus.io`.

**The missing capability:** this environment's outbound IP is blocked by GridStatus's Cloudflare security rules. It's a hard block ("you have been blocked"), not a challenge that a person could solve. No browser setting or package install can change it, and bypassing bot protection is out of scope.

## 3. Charting and mapping libraries
**None could be confirmed.** The scripts that render the dashboard were never delivered to this environment.

**Guesses** based only on the screenshot the user supplied (`docs/reference-screenshot.png`). These are unverified:
| Component | Visual cue | Guess, low confidence |
|---|---|---|
| Map | Vector basemap with state/city labels, a points overlay colored by $/MWh, +/−/locate buttons at bottom right, a time slider | A WebGL vector-map library (Mapbox GL / MapLibre GL family), possibly with a deck.gl-style points layer |
| Charts | Stacked area/bars, step line (LMP), hover tooltip card with series dots, legend chips | Any of Plotly, ECharts, Highcharts, Recharts/visx. The screenshot alone can't tell them apart. |
| App shell | Sidebar + tabs + "Jump to Ctrl+K" palette | A React single-page app (very common, but not observed) |

## 4. What we take for the backtester (open-source, our own choices)
These are recommendations for our build. They are **not** claims about GridStatus's stack.
- **Data:** the `gridstatus` Python library (open source) for ERCOT SPP data. This is confirmed in its public docs.
- **Charts:** **Apache ECharts** (Apache-2.0). It covers stacked areas, step lines, heatmaps, rich tooltips and SVG/PNG export, and is tree-shakable.
- **Map (Phase 8+):** **MapLibre GL JS** (BSD-3) with free OpenFreeMap or Protomaps tiles. Add **deck.gl** (MIT) `ScatterplotLayer` for node points colored by $/kW-yr.
- **Shell:** React + Tailwind. A **cmdk** (MIT) command palette for the "Jump to" pattern. **Radix UI** primitives for dropdowns, tabs and popovers.
- **Patterns to borrow** (from the screenshot; see `docs/DESIGN_REFERENCE.md`): a KPI strip with live dots, 2-column chart cards with download/expand icons, legend chips, a date pill with ◀ ▶ steppers, and a map card with a time slider and color-scale legend.

## 5. Next steps
- Design work can go ahead using `docs/DESIGN_REFERENCE.md` and the user's screenshots.
- To confirm the libraries, the scripts need to be captured from a network GridStatus doesn't block. Until then, every library ID in §3 stays a guess.

## 6. Confirmed by the local REA run (replaces §3)
| Part | Reference dashboard uses (confirmed) | Evidence | Our choice |
|---|---|---|---|
| Charts | **ECharts** (canvas via ZRender) | `EChartsWrapper-*.js` contains echarts/zrender identifiers; a shared `EChartsGraph` wrapper handles setOption, tooltip and animation | **ECharts.** Same library, with one shared `<Chart>` wrapper |
| Map | **Mapbox GL JS** | `mapbox-gl-*.js`; `mapboxgl-map` DOM; Mapbox attribution | **MapLibre GL JS.** It's the open-source fork with a near-identical layer API and needs no token or billing |
| UI | **React + Mantine** | JSX runtime; `mantine-Select/Button/Grid/Paper` classes | **Mantine** (MIT). AppShell, Select, SegmentedControl, Paper and Spotlight (⌘K) are built in, and so is dark mode |
| Tables | **AG Grid** (community) | `ag-root` DOM; `GSDataTable-*.js` imports ag-grid-community | **Mantine Table** for our small tables. Add AG Grid Community only if we need large sortable grids |

Exact versions were not established, and neither were Tailwind, Radix or deck.gl. Exact versions don't matter for our build.

### Recipes to reproduce with our own code (patterns only, no copied source)
- **Node map:** a GeoJSON source of nodes, each with a `color` (or `value`) property. Draw it as a circle layer with
  `circle-color` read from that property, `circle-radius` interpolated by zoom, and a thicker
  `circle-stroke-width` for hovered and selected nodes (feature-state). Click shows a popup; search uses a feature index.
- **Price legend:** explicit color thresholds per metric, with a fixed/dynamic scale toggle. For us the metric is $/kW-yr, with
  thresholds set from the batch-run distribution.
- **Charts:** one wrapper component owns resize, theme tokens, tooltip placement and animation. Every card calls it with an option object.
- **Data flow:** fetch, then reshape the header row plus value rows into records, then pass them to the chart or layer. Ours reads static JSON from `results/`.

### Boundaries
- Endpoints seen in their client code (`app-api.gridstatus.io`, `api.gridstatus.io`, `front-end/v1`) are **not** a data source for
  us. We use the open-source `gridstatus` Python library and ERCOT's public API.
- Access-gated features (full map, pricing tables) stay gated. No GridStatus source, branding or styling is copied.
