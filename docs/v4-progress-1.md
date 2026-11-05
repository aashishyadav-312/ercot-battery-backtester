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
- [x] AS price data: DAM MCPC 2023 to 2026 YTD, RT MCPC from RTC+B (cached in data/raw/, `scripts/fetch_stack_data.py`)
- [x] AS rules config: `model/config/as_rules.json`
- [x] Engine (`model/stack.py`, `model/stack_year.py`) + tests (`tests/test_stack.py`)
- [x] Tier 1: 5 hubs x 2023-2026 YTD x 1/2/4 h x both modes -> `results/v4/stack/` (60 results)
- [ ] Tier 2: all nodes x 2025, 2026 YTD x 2/4 h x realistic (waiting on the all-node price download)
- [ ] Tier 3 (if time)

## Checks so far

- Energy-only parity (AS off) vs published results, 2025, 2 h: HB_WEST, HB_NORTH, HB_HOUSTON, RHESS2_ESS1, ANSON1_ALL,
  CAMWIND_RN, both modes, all within 0.5% (most exact to the cent). `tests/test_stack.py`.
- Cross-check with the v2 AS screen: HB_HOUSTON 2024 2 h foresight with the v2 settings (shared headroom, no Reg
  deployment) gives 102.01 $/kW-yr vs 101.87 published in `results/as_HB_HOUSTON_2024_2h_0.85_10.json` (different
  price source: archive vs API). The v4 defaults (two-sided headroom, Reg deployment 10%) give 110.72.
- Benchmark: one node-year, 4 cores available. Realistic (hourly) about 1.4 s; foresight (15-minute) about 4 s, with
  7-day LP blocks (same answer as daily solves, SOC reset at each midnight).

## Sources and assumptions

All in `model/config/as_rules.json`. Sourced: RTC+B go-live and post-RTC+B durations (NPRR1282: Regulation and RRS
30 minutes, ECRS 1 hour, effective 12/05/2025), ECRS 2 h and Non-Spin 4 h (NPRR1096), price reports NP4-188-CD,
NP6-796-ER, NP6-905-CD, NP4-190-CD. ASSUMPTION: pre-RTC+B Regulation/RRS backing of 1 hour (conservative), Regulation
deployment factor 0.1 (no ERCOT source found), ESR eligibility for all 5 products, price taker.

## Resume

```sh
pip install -e '.[dev]'
# ERCOT_API_USERNAME / ERCOT_API_PASSWORD / ERCOT_API_SUBSCRIPTION_KEY must be set
python -m scripts.fetch_stack_data          # re-runnable, caches in data/raw/
python -m scripts.run_stack --tier 1        # skips outputs that exist
python -m scripts.run_stack --tier 2
```
