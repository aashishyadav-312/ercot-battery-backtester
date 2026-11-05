# v4 Step 1 progress: revenue stack engine (C)

Branch `v4/1-stack`. Plan: `docs/PLAN_V4.md`, Step 1.

## Audit (what already exists)

- Energy optimizer: `model/dispatch.py` `optimize_day` (PuLP + HiGHS, one LP per Central-time day, MILP fallback
  when charge and discharge overlap at prices <= 0). Year loop: `model/run_year.py` (SOC starts and ends each day
  empty, `SOC0_FRAC = 0`; skip days with more than 4 missing RT intervals).
- Realistic mode: `model/forecast.py` `run_da_schedule`: solve on DA hourly SPP, hold the hourly schedule, settle at
  RT 15-minute SPP. Reported as `da_rt_revenue_per_kw_year`.
- Existing AS work (v2 Phase 14): `model/ancillary.py` `optimize_stack` (energy + 5 AS products, PuLP, one day),
  `data/fetch_ancillary.py` (DA MCPC from NP4-188-CD via `gridstatus.ErcotAPI.get_as_prices`; RT MCPC from the
  NP6-796-ER annual workbook), `scripts/run_ancillary.py`, `docs/ANCILLARY_METHOD.md`. Results: `results/as_*.json`
  (10 locations, 2024 to 2026, foresight only). These stay untouched.
- Prices: hubs from ERCOT annual archives (`data/fetch_prices.py`), nodes from the ERCOT public API, all nodes from
  `data/fetch_all_nodes.py` (monthly caches in `data/raw/`, git-ignored). Compact copies for 10 locations,
  2024 to 2026, in `results/prices/*.ebp` (`data/price_files.py`).
- All-node energy-only results: `results/nodes_{2024,2025}_2h.json` (deg 10 $/MWh, RTE 0.85).
- Public data path: the web build copies `results/` into the site, so new outputs go to `results/v4/stack/`.

## Plan for this step

- New module `model/stack.py`: vectorised LP built directly in `highspy` (no PuLP), many days per solve with SOC
  reset at each day boundary (identical to daily solves, much faster). MILP re-solve only for days with
  charge/discharge overlap, same rule as `model/dispatch.py`.
- Rules config `model/config/as_rules.json` with source URLs.
- Runner `scripts/run_stack.py` (resumable, multiprocessing). Fetch script `scripts/fetch_stack_data.py`.

## Status

- [x] Audit
- [ ] AS price data
- [ ] AS rules config
- [ ] Engine + tests
- [ ] Tier 1, Tier 2 runs

## Resume

```sh
pip install -e '.[dev]'
# ERCOT_API_USERNAME / ERCOT_API_PASSWORD / ERCOT_API_SUBSCRIPTION_KEY must be set
python -m scripts.fetch_stack_data          # re-runnable, caches in data/raw/
python -m scripts.run_stack --tier 1        # skips outputs that exist
python -m scripts.run_stack --tier 2
```
