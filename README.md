# ERCOT Battery Backtester

How much could a battery have earned at a given ERCOT location, and what drove that number?

**Live site:** https://aashishyadav-312.github.io/ercot-battery-backtester/

[![Deploy to GitHub Pages](https://github.com/aashishyadav-312/ercot-battery-backtester/actions/workflows/deploy.yml/badge.svg)](https://github.com/aashishyadav-312/ercot-battery-backtester/actions/workflows/deploy.yml)

Status: Phase 16 done (Live page at `#/live`: today's real-time hub and node prices, the best possible battery so far today, tomorrow's day-ahead plan, spike banner and cached fallback, fed every 5 minutes by a Cloudflare Worker in `worker/`; see "Live page backend" below). Phase 15 done (Custom run page at `#/custom`: your own power, duration, efficiency, degradation and dates at the 10 detailed locations, both strategies, solved in the browser by a highs-js port of the daily LP and MILP fallback in a Web Worker; inputs saved in the URL; parity with Python within 0.5%; energy only). Phase 14 done (separate energy + ancillary capacity screen on Overview, Revenue and Realism for all 180 configurations, plus a 50% AS-cap sensitivity; findings in section 10 of [results/FINDINGS.md](results/FINDINGS.md); methodology, reproduction and limits in [docs/ANCILLARY_METHOD.md](docs/ANCILLARY_METHOD.md)). Phase 13 done (Economics page at `#/economics`: NPV, IRR, payback, LCOS, breakeven capex and a sensitivity tornado; all math in `web/src/data/economics.ts`, tested with `npm test` in `web/`). Phase 11 done (Map page at `#/map`: Texas county map with clickable markers, `results/locations.json` built by `scripts/build_locations.py`, geocoding log in [results/geocoding_log.md](results/geocoding_log.md)). Phase 9 done (friendly location names in `web/src/data/locations.json`, glossary tooltips from `web/src/data/glossary.json`, "Data through" badge, About page and footer, Open Graph/Twitter cards, GoatCounter page counts). Phase 8a done (DA-schedule / RT-settle capture rates and a before/after RTC+B comparison, on the new Realism page; findings 7 and 8 in [results/FINDINGS.md](results/FINDINGS.md)). Phase 7 done (deployed to GitHub Pages). Phase 4 done (5 hubs + 5 resource nodes, benchmark check, findings in [results/FINDINGS.md](results/FINDINGS.md)). See [PLAN.md](PLAN.md) for the build plan.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## Layout

```
data/fetch_prices.py   # gridstatus -> data/raw/*.parquet (gitignored)
model/dispatch.py      # daily LP: optimize_day
model/ancillary.py     # energy + AS capacity screen with shared power/SOC backing
data/fetch_ancillary.py # cached hourly DA and settled 15-minute RT AS prices
model/run_year.py      # loops days, saves results
model/metrics.py       # $/kW-yr, top-10-day share, heatmap
model/forecast.py      # schedule on DA prices, settle at RT (capture rate)
scripts/build_locations.py  # results/locations.json + geocoding_log.md for the Map page (ERCOT settlement points + EIA-860 plant coordinates)
scripts/run_grid.py    # batch run over locations x durations x years (PF + DA-scheduled)
scripts/run_ancillary.py # separate strategy grid, checkpoints and AS-exposure sensitivity
scripts/finalize_ancillary.py # normalize published AS detail files, stamp manifest metadata
scripts/ancillary_findings.py # audit coverage, runtime, numerical bounds and period revenue
scripts/add_da_schedule.py # add DA-scheduled fields to existing results without rerunning PF
scripts/rtcb.py        # before vs after RTC+B over matched windows -> results/rtcb.json
scripts/rank_nodes.py  # pick resource nodes by RT price volatility
scripts/compare_nodes.py # node vs its hub over matched days
scripts/build_walkthrough.py # 15-min prices + schedule for featured days -> results/walkthrough.json (Start here page)
data/fetch_all_nodes.py   # every settlement point at once from ERCOT's archive files -> data/raw/{RT15,DA}_ALLSP_{year}-{month}.parquet
scripts/run_all_nodes.py  # daily LP at every resource node, summary only -> results/nodes_{year}_{hours}h.json (Map heat mode)
scripts/node_findings.py  # prints the FINDINGS section 9 tables from the all-node results
scripts/geocode_extra.py  # EIA-860M and ERCOT GIS queue (county-level) geocoding stages
data/price_files.py       # compact per-location-year price files (EBP1) for the in-browser custom run
scripts/export_prices.py  # results/prices/*.ebp for the 10 detailed locations (Phase 15)
scripts/parity_reference.py # Python numbers on those files -> results/parity/reference.json
web/src/custom/           # highs-js port of the daily LP, year runner, Web Worker, parity test
web/src/live/             # Live page data: snapshot loader with browser fallback, helpers, main-thread solver
worker/                   # Cloudflare Worker for the Live page: cron fetch from ERCOT, KV snapshot, /live.json
results/               # precomputed JSON for the web app
web/                   # Vite + React + Mantine + ECharts frontend (Phase 5)
tests/
```

## Data

```bash
python -m data.fetch_prices --location HB_HOUSTON --year 2025 --market RT15   # or --market DA
```

- **Hubs** (`HB_*`) come from ERCOT's public annual archives (NP6-785-ER real-time 15-min, NP4-180-ER day-ahead hourly). No login is needed. One download covers all hubs for a year and is cached in `data/raw/`. The current year's archive runs about a week behind.
- **Resource nodes** come from the ERCOT public API (RT: NP6-905-CD, DA: NP4-190-CD), filtered by settlement point and requested a month at a time (about 2 s apart, under the 30-per-minute limit). Set `ERCOT_API_USERNAME`, `ERCOT_API_PASSWORD` and `ERCOT_API_SUBSCRIPTION_KEY`. These are prices as first posted; the hub archives include later price corrections (a 0.1–0.3% revenue difference at HB_HOUSTON 2024).
- **Picking nodes:** `python -m scripts.rank_nodes --year 2025 --month 8` ranks every resource node by RT price volatility in one month and writes `results/node_selection.json`. Then `python -m scripts.run_grid --hubs --nodes <nodes>` (an empty `--hubs` runs only the nodes and merges them into `results/index.json`), and `python -m scripts.compare_nodes` prints node vs hub over matched days.
- **Load zones** (`LZ_*`) are excluded for now. The archives carry two price series per zone (load-weighted and energy-weighted) under the same label, and they disagree.
- **Ancillary capacity screen:** [the Phase 14 method](docs/ANCILLARY_METHOD.md) documents the DA-to-RT price switch at RTC+B, reserve-duration assumptions, separate API energy baseline, and reproduction command. The new comparison uses actual period $/kW, with the energy-only strategy retained.
- Timestamps are stored in UTC, with a US/Central copy. Single missing intervals are forward-filled; longer gaps stay empty.
- ERCOT's website rate-limits bursts of requests (HTTP 403 from its bot protection). If that happens, wait a few minutes and rerun. Cached files are never downloaded again.

## All resource nodes (Map heat mode): a yearly local job

Run once a year, after a calendar year is complete (early January), on a machine that can reach ERCOT. It is not part of
the monthly `refresh.yml` workflow: the download is ~35,000 archive files (~30 min) that ERCOT's bot protection often
refuses from GitHub runner IPs, and a partial year would drop every node that starts later in that year.

```bash
YEAR=2025
python -m data.fetch_all_nodes --year $YEAR                     # ~30 min, ~100 MB cache in data/raw/
python -m data.fetch_all_nodes --year $((YEAR - 1))             # previous year, for the persistence check (cached once)
python -m scripts.run_all_nodes --year $((YEAR - 1)) --hours 2  # ~11 min each on 4 cores
python -m scripts.run_all_nodes --year $YEAR --hours 2
python -m scripts.build_locations --all-nodes                   # geocode, match rates, top-50 review list
python -m scripts.run_all_nodes --year $YEAR --remerge          # copy the new coordinates in (no re-solve)
python -m scripts.node_findings --year $YEAR                    # FINDINGS section 9 tables
```

Then point `ALL_NODES_FILE` in `web/src/data/loader.ts` at the new year, update FINDINGS section 9, and open a PR.

- **One file holds every point.** ERCOT posts NP6-905-CD (RT 15-min SPPs) as one file per interval with all ~1,000
  settlement points, and NP4-190-CD (DA hourly SPPs) as one file per day. `fetch_all_nodes` lists those files through the
  ERCOT public API archive endpoint and downloads them 250 at a time, so a year is ~150 requests instead of ~17,000
  per-node ones. Requests are spaced under the 30-per-minute limit, 403/429 answers back off and retry, and
  `ERCOT_FAIL_FAST=1` stops on the first 403 as elsewhere. Each month is cached once complete, so a rerun resumes.
- **Same model, summary output.** `run_all_nodes` calls the same `run_year` (perfect foresight) and `run_da_schedule`
  (DA-scheduled, RT-settled) as the detailed runs for each resource node (ERCOT type `RN`) with at least 99% of the
  year's RT intervals, and stores only summary metrics plus monthly revenue. The five hubs go through the same pipeline
  from the same bulk files, and every node-vs-hub ratio uses those bulk hub figures. The run stops if a hub or detailed
  node differs from its existing detailed result by more than 2%.
- **Prices as posted.** The archive files are prices as first posted (re-posts replace earlier files); the hub annual
  archives used for the detailed hub runs include later corrections, so hub figures differ slightly (see FINDINGS 9).
- **Geocoding** (`build_locations --all-nodes`): EIA-860 annual LMP node ID, hand overrides, EIA-860 name rules,
  EIA-860M monthly name rules (plant-level), then the ERCOT GIS interconnection queue (county-level, drawn at the
  county's Census Gazetteer internal point and shown as a ring). Placements that conflict with the queue by more than
  100 km are dropped. `results/geocoding_review_top50.md` lists the highest-earning unplaced nodes for hand review into
  `scripts/location_overrides.json`.
- The web app loads `nodes_2025_2h.json` only when the Map page is switched to "All nodes (heat)".

## Custom runs in the browser (Phase 15)

```bash
python -m scripts.export_prices       # results/prices/{location}_{year}.ebp + index.json
python -m scripts.parity_reference    # results/parity/reference.json (Python numbers on those files)
cd web && npx vitest run src/custom   # highs-js port + parity test
```

- **Price files:** one gzip file per location-year with the RT 15-minute and DA hourly settlement point prices exactly as
  `data.fetch_prices.fetch` returns them, stored as whole cents (ERCOT prices have two decimals, so this is exact). Format
  in [data/price_files.py](data/price_files.py). The 10 detailed locations x 2024-2026 are 30 files, 2.48 MB in total
  (about 90 KB per full year), served from GitHub Pages under `data/prices/`. All-node price files are not published.
- **Solver:** [web/src/custom/dispatch.ts](web/src/custom/dispatch.ts) ports `optimize_day` to
  [highs-js](https://github.com/lovasoa/highs-js), including the MILP fallback (0.01% gap, 10 s limit). highs-js 1.15.4
  bundles HiGHS 1.15.1, the same version `highspy` uses here, and the model is passed in PuLP's column and row order.
  [runner.ts](web/src/custom/runner.ts) ports `run_year`, `run_da_schedule` and the metrics; it runs in a Web Worker
  ([worker.ts](web/src/custom/worker.ts)) and reports progress after each month. Energy only: no ancillary services yet.
- **Parity:** [parity.test.ts](web/src/custom/parity.test.ts) runs three full years (HB_HOUSTON 2025 2h $10/MWh;
  HB_PAN 2024 1h $0, the run with the most MILP-fallback days; RUSSEKST_RN 2025 4h $10) plus a MILP-fallback day and both
  2025 DST days (92 and 100 intervals), and requires every metric within 0.5% of Python on the same files.
- **Page:** `#/custom` ([web/src/pages/Custom.tsx](web/src/pages/Custom.tsx)). Inputs: location (the 10 detailed locations),
  power 1-2,000 MW, duration 0.5-8 h, round-trip efficiency 50-100%, degradation $0-200/MWh, a date range within one
  year, and the strategy shown (perfect foresight or DA-scheduled; both are always solved). The URL holds every input
  (`#/custom?loc=HB_WEST&mw=100&dur=1.5&rte=88&deg=5&from=2025-06-01&to=2025-08-31&strat=da`), so a run can be shared;
  opening a link runs it. Results use the Overview cards. When the inputs match a precomputed run, the page prints both
  figures as a check. A full year at 2 h solves in about 2 s in the browser; $0 degradation at negative-price locations
  is slower because of MILP-fallback days (HB_PAN 2024 1h $0: about 4 minutes), with progress shown per month and a
  Cancel button. The solver (3.5 MB WebAssembly, 1.2 MB gzipped) loads only on this page.

## Live page backend (Phase 16)

The Live page (`#/live`, [web/src/pages/Live.tsx](web/src/pages/Live.tsx)) reads one JSON snapshot from a Cloudflare Worker
in [worker/](worker/). A Cron Trigger runs every 5 minutes, fetches from ERCOT's public API, and writes the snapshot to one
Workers KV key; `GET /live.json` serves it with CORS limited to `https://aashishyadav-312.github.io`. The ERCOT username,
password and subscription key are Worker secrets; nothing secret is in the repository or the page.

- **What it fetches:** today's real-time 15-minute settlement point prices (NP6-905-CD) for the 5 hubs (one call with
  `settlementPointType=HU`) and the 5 featured resource nodes (one call each), plus today's and tomorrow's day-ahead hourly
  settlement point prices (NP4-190-CD, one call per location). Today's day-ahead prices are carried over from yesterday's
  "tomorrow", and tomorrow's are only requested after the day-ahead market closes (10:00 CT): one hub is probed each run
  until they appear, then all 10 are fetched once. A refresh makes 7 ERCOT calls most of the time and at most 28.
- **Failures:** anything ERCOT fails to return is carried over from the previous snapshot, and the error is listed in the
  snapshot (`errors`). The page shows "Prices through" (end of the newest interval) and "Last updated" (the refresh time)
  separately, flags prices more than 45 minutes old as delayed, and when the Worker can't be reached it shows the last
  snapshot saved in the browser with its timestamp.
- **Day-ahead posting time (checked Nov 1, 2026, not assumed):** ERCOT's archive shows NP4-190-CD posted between 12:32 and
  12:35 CT on 11 of the 13 days Oct 19-31, at 13:15 on Oct 27 and 14:22 on Oct 31. On Nov 1 (the fall-back DST day) it had
  not posted by 17:41 CT, although the day-ahead LMP and AS reports posted at 12:32. The Worker therefore polls instead of
  assuming a time, and records `tomorrow.daFirstSeenAt`.
- **DST:** the snapshot stores each day as elapsed intervals from local midnight (92, 96 or 100 real-time intervals), using
  ERCOT's `DSTFlag` for the repeated fall-back hour, the same rule as `data/fetch_all_nodes.py`. Tests in
  [worker/test/live.test.ts](worker/test/live.test.ts).
- **Cost: $0.** Workers free tier: 100,000 requests/day; the cron is 288 runs/day. Workers KV free tier: 1,000 writes/day
  (the cron writes once per run, 288/day) and 100,000 reads/day (page reads are cached at the edge for 60 s). Cron
  subrequests stay under the free limit of 50 per run.

Deploy (from `worker/`, after `npm ci`):

```bash
npx wrangler login
npx wrangler kv namespace create LIVE        # once; put the id in wrangler.toml
npx wrangler secret put ERCOT_API_USERNAME
npx wrangler secret put ERCOT_API_PASSWORD
npx wrangler secret put ERCOT_API_SUBSCRIPTION_KEY
npx wrangler deploy
```

Check it with `curl https://ercot-live.aashishyadav312.workers.dev/live.json` (the first snapshot appears after the first
cron run) and watch runs with `npx wrangler tail ercot-live`. `npm test` runs the Worker tests. To develop against
Cloudflare instead of a local runtime, use `npm run dev` (`wrangler dev --remote`). The site's `npm run dev` and
`npm run preview` reach the deployed Worker through a Vite proxy (`/live-api`), since CORS only admits the Pages origin;
set `VITE_LIVE_URL` to point the page at another Worker.

## Realism: DA-scheduled vs perfect foresight, and RTC+B

```bash
python -m scripts.add_da_schedule   # adds DA-scheduled fields to every run in results/index.json
python -m scripts.rtcb              # writes results/rtcb.json
```

- **DA-schedule / RT-settle:** each day is optimized on the DA hourly prices with the same battery, the schedule is held fixed,
  and it is paid RT 15-minute prices (each hourly MW applies to its four 15-min intervals). New fields in each results JSON:
  `metrics.da_rt_revenue_per_kw_year`, `pf_revenue_per_kw_year_matched`, `value_of_perfect_foresight_per_kw_year`,
  `capture_rate`, `da_da_revenue_per_kw_year`, `da_losing_days`, `daily.da_rt_revenue` and `meta.da_schedule`; index.json gets
  the first three plus `capture_rate`. Existing fields are unchanged.
- **RTC+B:** Dec 5, 2024 – Oct 24, 2025 vs Dec 5, 2025 – Oct 24, 2026, day-matched one year apart, for both strategies, plus the
  RT − DA spread and RT volatility over the same days. Describes what changed, not what caused it.

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| [`deploy.yml`](.github/workflows/deploy.yml) | push to `main`, manual | Copies `results/*.json` into `web/public/data`, builds `web/` (Vite base `/ercot-battery-backtester/`, hash routing) and publishes `web/dist` to GitHub Pages. |
| [`ci.yml`](.github/workflows/ci.yml) | pull requests | Runs `pytest` (Python 3.11, `pip install -e ".[dev]"`), `npm test` (including the browser-vs-Python parity test) and the web build. |
| [`refresh.yml`](.github/workflows/refresh.yml) | monthly (06:17 UTC on the 3rd), manual | Detailed locations only (the all-node run is a yearly local job, above). Refetches the current year for all hubs and the nodes in `results/node_selection.json` (uses the `ERCOT_API_*` secrets), reruns `scripts.run_grid` (perfect foresight and DA-scheduled) for that year and `scripts.rtcb`, and opens a PR with the updated results. Merging it redeploys the site. Timeout 60 minutes. |

ERCOT's bot protection can block GitHub's runner IPs. The refresh job sets `ERCOT_FAIL_FAST=1`, so an HTTP 403 stops the run with an explanatory error instead of backing off. If that happens, run the refresh locally (`python -m scripts.run_grid --years <year> --nodes ...`) and commit the results.
