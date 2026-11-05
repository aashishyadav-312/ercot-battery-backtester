# v4 Step 2 progress: Data Center engine (D)

Branch `v4/2-datacenter`. Plan: `docs/PLAN_V4.md` Step 2.

## Audit (done)

- Studio engine: TypeScript in `web/src/custom/`.
  - `dispatch.ts` `optimizeDay(highs, prices, dt, P, E, rte, deg, soc0)`: one-day LP (highs-js), MILP fallback on
    days that charge and discharge at once. Matches `model/dispatch.py`.
  - `runner.ts` `runCustom(highs, files, params)`: perfect foresight on RT 15-min prices, plus the realistic
    "Day-ahead plan" strategy (schedule on DA hourly prices, settle at RT). SOC starts and ends each day at 0.
  - `prices.ts` `parsePriceFile` reads `results/prices/<LOC>_<YEAR>.ebp` (RT 15-min + DA hourly, UTC grid);
    `centralHour`, `centralMidnight`, `splitDays` give US/Central operating days.
  - `worker.ts` / `client.ts` run it in a Web Worker.
- Browser price files: 10 locations x 2024-2026 (2026 through 2026-10-31). No 2023 price files in the browser.
- Data path: `web/scripts/copy-data.mjs` copies `results/*.json` and `results/prices/` into `web/public/data/`.
  It does not copy subfolders yet, so `results/v4/` needs one line there when the UI step (Step 7) loads it.
- Network: ercot.com, ERCOT public API (credentials set), capitol.texas.gov and puc.texas.gov all reachable.

## Mapping to the shared contract

- 4CP data: `results/v4/fourcp/<year>.json` (the repo's public data source folder; the plan's `data/v4/fourcp`).
- Rules config: `web/src/custom/config/datacenter_rules.json`.
- Engine: `web/src/custom/datacenter.ts` `runDataCenterCase(inputs)`.

## Status

- [x] Audit
- [ ] 4CP fetch script and data
- [ ] Rules config with sources
- [ ] Engine
- [ ] Tests
- [ ] Full test run, PR ready

## Resume

```
git checkout v4/2-datacenter
python -m scripts.fetch_fourcp            # writes results/v4/fourcp/<year>.json
cd web && npx vitest run src/custom/datacenter.test.ts
pytest tests/test_fetch_fourcp.py
```
