# Phase 14: ancillary capacity screening

This model adds a separately selectable comparison to Overview, Revenue and Realism. The original energy-only JSON, KPI tiles, charts, node rankings and Economics inputs are unchanged. The comparison re-solves energy-only on the identical price inputs and complete days used by the capacity stack. All energy prices for this screen come from as-posted public API NP6-905-CD, including hubs; they are cached separately from the corrected hub archives. Thus the new baseline may differ slightly from the original hub charts. The 2024 corrected hub archive returned an invalid ZIP during setup; no substitute prices were written over existing energy-only results.

## Verified sources (November 1, 2026)

- [ERCOT NPRR1282](https://www.ercot.com/mktrules/issues/NPRR1282), effective December 5, 2025: Regulation/RRS duration changes to 30 minutes, ECRS to one hour.
- [ERCOT NPRR1096](https://www.ercot.com/mktrules/issues/NPRR1096): earlier sustained ECRS two-hour / Non-Spin four-hour capability.
- [June 2025 Protocols, section 6.5.7.5](https://www.ercot.com/files/docs/2025/05/29/June-1-2025-Nodal-Protocols.pdf): pre-RTC SOC backing for upward AS depends on the remaining operating hour. The screen deliberately uses a conservative full hour for Regulation/RRS rather than modeling that declining obligation or FFR separately.
- [ERCOT NP4-188-CD](https://www.ercot.com/mp/data-products/data-product-details?id=NP4-188-CD): hourly day-ahead capacity clearing prices, downloaded and parsed using `gridstatus.ErcotAPI.get_as_prices`.
- [ERCOT NP6-796-ER](https://www.ercot.com/mp/data-products/data-product-details?id=NP6-796-ER): annual, weekly-updated settled 15-minute real-time capacity prices, starting with RTC+B. `gridstatus.Ercot` locates the workbook and parses operating-hour / DST timestamps. The parser skips the report-info sheet and reads monthly sheets. It rejects duplicate/missing product prices.
- [ERCOT real-time market reports](https://www.ercot.com/mktinfo/rtm/index.html): the settlement series is a time-weighted 15-minute capacity price including applicable reliability adders. Raw five-minute SCED MCPC is not substituted for it.

Installed `gridstatus` 0.37.0 exposes day-ahead prices via ErcotAPI and recent 15-minute RT MCPC via Ercot; the historical annual RT workbook is needed for these backtests. Probes confirmed both historical series and their schemas. Raw workbooks/parquet and credentials stay out of Git.

## Model

For each Central-time day, choose charging, discharging, SOC, and five non-negative capacity awards. Maximize real-time energy margin less discharge degradation plus capacity price times awarded MW times interval hours. Capacity prices have units $/MW-hour; energy prices have units $/MWh. SOC starts and ends empty, as in v1. Actual days contain 92, 96 or 100 quarter-hours.

The conservative shared-inverter constraint is `charge + discharge + sum(all five reserves) <= power`. All upward products share stored-energy backing `sum(reserve * duration / discharge_efficiency) <= SOC`. Regulation Down shares charging headroom `reserve * duration * charge_efficiency <= capacity - SOC`. Both interval boundaries must satisfy these inequalities. Reserves cannot reuse the same stored energy or MW independently. This screen does not credit upward reserve supplied by reducing scheduled charging, nor asymmetric simultaneous up/down capability.

Default backing hours (RegUp, RegDown, RRS, ECRS, Non-Spin) are `(1, 1, 1, 2, 4)` before RTC+B and `(0.5, 0.5, 0.5, 1, 4)` afterward. They are parameters of `optimize_stack`, not claims that this simplified resource qualifies under every ERCOT rule.

Before RTC+B, capacity awards stay fixed within a physical UTC hour. Real-time energy still has perfect foresight; this hybrid DA-capacity/RT-energy screen is not an executable day-ahead bidding policy. After RTC+B, the screen uses RT capacity prices alone, with no DA AS position, buyback or imbalance payment. It never adds DA and RT capacity receipts for the same MW.

An LP is attempted first. If it returns simultaneous charge/discharge, binary constraints cover non-positive-price intervals; capacity-induced positive-price overlap triggers the full binary fallback. This preserves the negative-price MILP fallback and handles capacity-induced overlap too. HiGHS uses one thread per process, 0.1% target MIP gap, and a configurable 2-second limit per AS MILP solve. Feasible incumbents carry their achieved gap; they are not represented as proven optimal solutions. Progress is checkpointed; configurations can solve concurrently after serial price downloads.

## Limits and comparison

No AS deployment energy, activation mileage, deployment degradation, performance penalties, qualification, outages, bid acceptance or market-depth response is modeled. In particular, allowing a 100 MW price-taker to take capacity at the historical clearing price can overstate monetizable revenue. `max_as_share` constrains total capacity exposure for sensitivity analysis. AS clearing prices are system-wide, but energy opportunity costs and AS allocations are location-dependent.

Period totals are not annualized in the new cards. The RTC+B view uses only intersecting calendar-day pairs from December 5, 2024–October 24, 2025 and December 5, 2025–October 24, 2026. It changes both pricing basis and reserve parameters between periods. It therefore describes the combined change in market data and screening assumptions, not a causal estimate of RTC+B.

Benchmark reference: [Modo Energy's February 2026 analysis](https://modoenergy.com/research/why-were-ercot-battery-revenues-so-low-in-2025-weather-energy-arbitrage-builodout) reports $56/kW for 2024 and a **$29.4/kW nowcast estimate**, rather than a finalized actual, for 2025. Its realized fleet revenue and this perfect-foresight, capacity-only screen are not like-for-like. Gaps must be explained, not calibrated away. Numerical findings and measured runtime are in `results/FINDINGS.md`.

## Reproduction

Install `.[dev]`, set the three existing ERCOT environment variables (or pass an ignored `--env-file .env`), then run:

```sh
python -m scripts.run_ancillary --env-file .env --workers 4
```

`--locations HB_HOUSTON --years 2025` selects a smaller grid. Downloading is sequential and uses existing throttling; `ERCOT_FAIL_FAST=1` aborts on 403. The separate strategy results are written to `results/ancillary.json`, with per-day prices cached in `data/raw/`. Resume reuses checkpoints; `--refresh` refetches the selected AS and API energy series and rebuilds their solver checkpoints. Corrected hub archive caches are not modified. Rebuild the frontend to copy committed results into its public data folder. The existing monthly energy refresh is unchanged; this explicit command refreshes the AS screen, avoiding a partially refreshed strategy file.

The small manifest points to `results/as_<original-result-file>.json`; the page loads only the selected configuration (three years for RTC+B). To reproduce the 50% capacity-exposure sensitivity separately:

```sh
python -m scripts.run_ancillary --env-file .env --locations HB_HOUSTON --years 2025 --durations 2 --degs 10 --max-as-share 0.5 --workers 1
```

This writes a separate sensitivity manifest/detail and caches, without overwriting the base case. Runtime is measured per configuration; `resumed_days_unmeasured` identifies days from an early pre-timing checkpoint so they are not included in claims about total compute time.

The original energy-only fallback retains its 10-second limit and 0.01% gap target. The AS screen defaults to a 0.1% target with a 2-second MILP limit; use `--mip-time-limit 10 --refresh` for a longer solve. Early cached results used the stricter/longer settings and are retained, with achieved daily gaps and time limits recorded. Time-limited days display approximate monetary solver ranges reconstructed from their relative gaps; these ranges do not include forecasting or operating uncertainty. Valid scheduled-energy/reserve coupling inequalities strengthen the LP relaxation without changing the exclusive-mode feasible set.

For a bounded AS solve, the already-computed energy-only schedule is another feasible candidate. If it earns more than the AS incumbent, the published result uses that schedule with zero AS awards and updates the relative gap from the original dual bound. Such days are marked `energy_fallback`. This preserves the known feasible floor without calibrating to fleet revenue. Component rounding means monetary bounds reconstructed in the UI are approximate.

Numerical range calculation follows the [HiGHS relative MIP gap definition](https://ergo-code.github.io/HiGHS/dev/options/definitions/#mip_rel_gap), relative to the primal objective. The published six-component daily data are rounded to six decimals in $/kW, so the upper endpoint includes a 3e-6 $/kW per-day rounding envelope, amplified by the relative gap where needed. Time-limited incumbents can differ between machines; compare the reported ranges rather than requiring bitwise-identical schedules.
