# ERCOT Battery Backtester

How much could a battery have earned at a given ERCOT location, and what drove that number?

**Live site:** https://aashishyadav-312.github.io/ercot-battery-backtester/

[![Deploy to GitHub Pages](https://github.com/aashishyadav-312/ercot-battery-backtester/actions/workflows/deploy.yml/badge.svg)](https://github.com/aashishyadav-312/ercot-battery-backtester/actions/workflows/deploy.yml)

Status: Phase 11 done (Map page at `#/map`: Texas county map with clickable markers, `results/locations.json` built by `scripts/build_locations.py`, geocoding log in [results/geocoding_log.md](results/geocoding_log.md)). Phase 9 done (friendly location names in `web/src/data/locations.json`, glossary tooltips from `web/src/data/glossary.json`, "Data through" badge, About page and footer, Open Graph/Twitter cards, GoatCounter page counts). Phase 8a done (DA-schedule / RT-settle capture rates and a before/after RTC+B comparison, on the new Realism page; findings 7 and 8 in [results/FINDINGS.md](results/FINDINGS.md)). Phase 7 done (deployed to GitHub Pages). Phase 4 done (5 hubs + 5 resource nodes, benchmark check, findings in [results/FINDINGS.md](results/FINDINGS.md)). See [PLAN.md](PLAN.md) for the build plan.

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
model/run_year.py      # loops days, saves results
model/metrics.py       # $/kW-yr, top-10-day share, heatmap
model/forecast.py      # schedule on DA prices, settle at RT (capture rate)
scripts/build_locations.py  # results/locations.json + geocoding_log.md for the Map page (ERCOT settlement points + EIA-860 plant coordinates)
scripts/run_grid.py    # batch run over locations x durations x years (PF + DA-scheduled)
scripts/add_da_schedule.py # add DA-scheduled fields to existing results without rerunning PF
scripts/rtcb.py        # before vs after RTC+B over matched windows -> results/rtcb.json
scripts/rank_nodes.py  # pick resource nodes by RT price volatility
scripts/compare_nodes.py # node vs its hub over matched days
scripts/build_walkthrough.py # 15-min prices + schedule for featured days -> results/walkthrough.json (Start here page)
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
- Timestamps are stored in UTC, with a US/Central copy. Single missing intervals are forward-filled; longer gaps stay empty.
- ERCOT's website rate-limits bursts of requests (HTTP 403 from its bot protection). If that happens, wait a few minutes and rerun. Cached files are never downloaded again.

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
| [`ci.yml`](.github/workflows/ci.yml) | pull requests | Runs `pytest` (Python 3.11, `pip install -e ".[dev]"`) and the web build. |
| [`refresh.yml`](.github/workflows/refresh.yml) | monthly (06:17 UTC on the 3rd), manual | Refetches the current year for all hubs and the nodes in `results/node_selection.json` (uses the `ERCOT_API_*` secrets), reruns `scripts.run_grid` (perfect foresight and DA-scheduled) for that year and `scripts.rtcb`, and opens a PR with the updated results. Merging it redeploys the site. Timeout 60 minutes. |

ERCOT's bot protection can block GitHub's runner IPs. The refresh job sets `ERCOT_FAIL_FAST=1`, so an HTTP 403 stops the run with an explanatory error instead of backing off. If that happens, run the refresh locally (`python -m scripts.run_grid --years <year> --nodes ...`) and commit the results.
