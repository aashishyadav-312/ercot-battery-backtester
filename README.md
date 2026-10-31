# ERCOT Battery Backtester

How much could a battery have earned at a given ERCOT location, and what drove that number?

Status: Phase 1 done (price data). See [PLAN.md](PLAN.md) for the build plan.

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
scripts/run_grid.py    # batch run over locations x durations x years
results/               # precomputed JSON for the web app
web/                   # Vite + React + Mantine + ECharts frontend (Phase 5)
tests/
```

## Data

```bash
python -m data.fetch_prices --location HB_HOUSTON --year 2025 --market RT15   # or --market DA
```

- **Hubs** (`HB_*`) come from ERCOT's public annual archives (NP6-785-ER real-time 15-min, NP4-180-ER day-ahead hourly). No login is needed. One download covers all hubs for a year and is cached in `data/raw/`. The current year's archive runs about a week behind.
- **Resource nodes** need the ERCOT public API. Set `ERCOT_API_USERNAME`, `ERCOT_API_PASSWORD` and `ERCOT_API_SUBSCRIPTION_KEY`.
- **Load zones** (`LZ_*`) are excluded for now. The archives carry two price series per zone (load-weighted and energy-weighted) under the same label, and they disagree.
- Timestamps are stored in UTC, with a US/Central copy. Single missing intervals are forward-filled; longer gaps stay empty.
- ERCOT's website rate-limits bursts of requests (HTTP 403 from its bot protection). If that happens, wait a few minutes and rerun. Cached files are never downloaded again.
