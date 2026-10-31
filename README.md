# ERCOT Battery Backtester

How much could a battery have earned at a given ERCOT location, and what drove that number?

Status: scaffolding (Phase 0). See [PLAN.md](PLAN.md) for the build plan.

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
