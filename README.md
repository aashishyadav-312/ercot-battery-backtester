# ERCOT Battery Backtester

How much could a battery have earned at a given ERCOT location, and what drove that number?

Status: Phase 4 done (5 hubs + 5 resource nodes, benchmark check, findings in [results/FINDINGS.md](results/FINDINGS.md)). See [PLAN.md](PLAN.md) for the build plan.

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
scripts/rank_nodes.py  # pick resource nodes by RT price volatility
scripts/compare_nodes.py # node vs its hub over matched days
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
