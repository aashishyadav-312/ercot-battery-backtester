# v4 Step 2 progress: Data Center engine (D)

Branch `v4/2-datacenter`, PR #39. Plan: `docs/PLAN_V4.md` Step 2. Status: **done, PR ready**. The UI is untouched.

## Audit

- Studio engine: TypeScript in `web/src/custom/`.
  - `dispatch.ts` `optimizeDay(highs, prices, dt, P, E, rte, deg, soc0)`: one-day LP (highs-js), MILP fallback on
    days that charge and discharge at once. Matches `model/dispatch.py`.
  - `runner.ts` `runCustom`: perfect foresight on RT 15-min prices, plus the realistic "Day-ahead plan" strategy
    (schedule on DA hourly prices, settle at RT). SOC starts and ends each day at 0.
  - `prices.ts` reads `results/prices/<LOC>_<YEAR>.ebp` (RT 15-min + DA hourly) and splits US/Central days.
  - `worker.ts` / `client.ts` run it in a Web Worker.
- Browser price files: 10 locations x 2024-2026 (2026 through 2026-10-31). There are no 2023 price files in the
  browser, so the engine runs 2024-2026 in the browser today; 2023 4CP data is shipped for when they exist.
- `web/scripts/copy-data.mjs` copies `results/*.json` and `results/prices/` only. **Step 7 must add `results/v4/`**
  to it (one `cpSync(..., { recursive: true })`) before the UI can fetch `results/v4/fourcp/<year>.json`.
  Not done here to keep this step off web build files and avoid conflicts with Steps 1 and 3.

## Mapping to the shared contract

| Plan | Repo |
|---|---|
| `data/v4/fourcp/<year>.json` | `results/v4/fourcp/<year>.json` (results/ is the public data source folder) |
| `.../config/datacenter_rules.*` | `web/src/custom/config/datacenter_rules.json` |
| `runDataCenterCase(inputs)` | `web/src/custom/datacenter.ts` |
| 4CP fetch script | `data/fetch_fourcp.py` (`python -m data.fetch_fourcp`) |

## What was built

- `data/fetch_fourcp.py`: official 4CP intervals from ERCOT report type 13037 (2023, 2024, 2025), the sum of DSP
  loads at each interval, and June-September daily ERCOT peaks (hourly load archive, or ERCOT API NP6-345-CD when an
  archive lacks the months). 2026 is **computed** (ERCOT publishes in late November): each month's peak hour from
  hourly load, `resolution_minutes: 60`. Re-run after ERCOT publishes: `python -m data.fetch_fourcp --year 2026 --refresh`.
- `runDataCenterCase(inputs)` returns `{ perKwYr, totalUsd, breakdown: { energy, as, fourCp, reliability },
  breakdownPerKwYr, standalone, fourCpDetail, dispatchSample, alertDays, reservedHours, daysCovered, annualized, notes }`.
  Inputs follow the plan; `highs`, a parsed price file and the 4CP year file are passed in (pure, no fetches).
  Helpers: `validateDataCenterInputs`, `parseLoadCsv` (8760/8784 CSV), `alertDays`, `countedSpan`, `DC_LIMITS`, `DC_RULES`.
- Model:
  - Foresight: PF on RT prices per day; on each 4CP day the LP also earns rate x the cut held through the 4CP interval.
  - Realistic: DA-scheduled, RT-settled (the repo's realistic mode). On alert days (daily ERCOT peak >= 95% of the
    month's earlier peaks) the plan holds an even cut from 15:00 to 18:00; 4CP value counts only the cut the executed
    schedule held at the official interval.
  - Without export, discharge <= site load in every interval; a 4CP cut never counts above the site load.
  - AS on: energy = Step 1 stack energy minus what the site constraints cost the energy-only dispatch; AS = Step 1 AS
    x (1 - share of hours held for 4CP), x min(1, min load / P) without export. No stack: energy only, with a note.
  - Reliability = events x min(hours / events, E x sqrt(rte) / covered MW) x covered MW x VOLL.
  - Partial years annualize energy and AS by 365 / days covered, as `model/metrics.py` does.
- Speed: one node-year worst case (no export, load below battery power) about 1.0 s warm, 1.4 s cold in vitest.
  The second LP of a day reuses the first one's model and basis.

## Sources (all in the config with an as-of date)

- 4CP method and timing: 16 TAC §25.192, https://ftp.puc.texas.gov/public/puct-info/agency/rulesnlaws/subrules/electric/25.192/25.192.pdf
- Postage stamp rate $68.547301/kW-yr, average 4CP 81,042.6566 MW: PUCT Docket 57491 order (June 5, 2025),
  https://interchange.puc.texas.gov/Documents/57491_58_1505349.PDF
- 4CP intervals: https://www.ercot.com/mktinfo/data_agg/4cp (report type 13037)
- 4CP review: SB 6 Section 6; PUCT Project 58000 proposal for publication (July 9, 2026) to move to 12CP with
  30-minute intervals, https://www.ercot.com/files/docs/2026/07/23/PUCT-Project-58000-pfp_adopted-9-July-2026.pdf
- SB 6 text and status: https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00006F.htm (signed and effective
  June 20, 2025); ERCOT October 2026 status report for Projects 58481, 58482, 58479, 58000.
- VOLL default $35,685/MWh: https://brattle.com/wp-content/uploads/2024/09/Value-of-Lost-Load-Study-for-the-ERCOT-Region.pdf

## Assumptions to check (all labelled `assumption: true` in the config)

1. Default 4CP rate $17.14/kW per interval = 2025 ERCOT postage stamp rate / 4. A site's TDSP TCRF differs; no 2026
   matrix was found.
2. 4CP labels are read as interval ending, but hourly load cannot confirm it (hourly peak on the official day in 9 of
   12 months, the hour before or after the label about equally). The engine counts a cut only if it holds 15 minutes
   either side of the label.
3. Realistic strategy: 95% threshold and a 15:00-18:00 window (covers all 2023-2025 intervals); it uses each day's
   observed peak, not a forecast.
4. Curtailment hours default 0 (no public forecast), 1 event; VOLL is the ERCOT system-wide survey value.
5. AS adjustments for 4CP hours and no export (above). SB 6 eligibility of a battery as backup generation is not modelled.
6. Interconnection import limit is not modelled: the battery can charge at full power on top of the site load.

## Tests

- `web/src/custom/datacenter.test.ts` (19): config sources and as-of dates; default rate derivation; data files;
  4CP span and cut math; load cap on the cut; hourly computed interval; alert days; realistic <= foresight (export on
  and off, two loads); window miss; discharge <= load without export (every interval, both strategies); breakdown sums
  (with AS and reliability); no-stack fallback; < 2 s per node-year; energy-only parity with published results
  (HB_WEST 2025 2h, HB_HOUSTON 2024 4h, both strategies, within 0.5%); validation; CSV parsing.
- `tests/test_fetch_fourcp.py` (6): label parsing, report parsing and sums, missing months, report choice, daily
  peaks and computed intervals, committed files.
- Full run: `npm test` 492 passed, build passed. `pytest` 114 passed, 2 failed in untouched existing tests
  (`test_ancillary.py`, `test_fetch_ancillary.py`): PuLP 4.2.0 raises "A False object cannot be passed as a
  constraint" in `model/ancillary`. Not caused by this step; CI installs PuLP unpinned, so it may hit the same.

## Resume

```
git checkout v4/2-datacenter
pip install -e ".[dev]"
python -m data.fetch_fourcp                 # rewrites results/v4/fourcp/<year>.json
cd web && npm ci && npx vitest run src/custom/datacenter.test.ts
cd .. && pytest tests/test_fetch_fourcp.py
```
