# V5 Step 2: 12CP engine and data

**Assumes:** by default the site is billed on its 12CP demand, at the 4CP postage stamp rate / 12 per monthly peak; a cut counts only if held for the whole peak hour of hourly ERCOT load (no 30-minute data), and the realistic rule is the 4CP alert rule in every month with season windows fitted to 2023 to 2025.
**Optional:** large load minimum billing demand (`opts.minimumBillingDemand`). It bills 12CP on the greatest of contracted peak, NCP (default: the site's highest load) and 12CP demand, which removes the saving unless a lower NCP is entered.
**Ignores:** ratcheted or weighted minimum billing demand, an NCP set by the battery's own charging (reported, not billed), rate rebasing on the lower 12CP load, storage and export exclusions, retail TCRF pass-through and the start date.

**What changed**
- `data/fetch_twelvecp.py` writes `results/v5/twelvecp/2023-2026.json` from the hourly load archive that `fetch_fourcp.py` uses (API fallback kept). 2026 has January to October, `complete: false`. Extra fields beyond the contract: `label`, `twelvecp_year`, `daily_peaks`, `months_finished`, `mean_monthly_peak_mw`, `checks`, `sources`, `notes`.
- `web/src/custom/config/twelvecp_rules.json`: status, method, interval, timing, rate, hold windows and `notModelled`, each with a section of the July 9, 2026 proposal and a source.
- `web/src/custom/twelvecp.ts`: `runTwelveCpCase(input, rules, peaks, opts?)` runs a no-peak baseline, the 4CP case (exactly `runDataCenterCase(input)`) and the 12CP case. Each returns avoided `$/yr` and `$/kW-yr`, alert days, and the energy and ancillary revenue given up against the baseline.
- `datacenter.ts`, additive and off by default: `holdWindows` (month blocks for the realistic window), `peakLabel` (note text) and `DispatchSample.windows`.

**Decisions**
- Files are calendar years so they line up with the price files. The proposal's 12CP year runs October to September (§25.192(b)(4)); each interval carries `twelvecp_year`.
- Status is "proposed, not adopted". The PUCT filings list for Project 58000 shows no adoption order (last filing October 1, 2026, checked November 13).
- Rate: the postage stamp rate / 12, rounded to the cent like the 4CP default. An entered 4CP rate becomes rate x 4 / 12, the same annual amount.
- Each window starts one hour before the earliest 2023 to 2025 peak hour in its season and ends with the latest one. That rule gives the summer window 15:00 to 18:00, the same as the 4CP window. Winter has a 06:00 to 08:00 block and a 17:00 to 19:00 block; fall is 12:00 to 17:00.
- An incomplete year is not extrapolated. Only finished months are valued, and a note says how many.

**Unverified**
- January 2026 peaked after the winter morning block (out of sample).
- In 2023 to 2025, the official 15-minute 4CP interval fell inside the hourly peak hour in only 5 of 12 summer months, so foresight 12CP may overstate.
- HB_WEST 2025, 100 MW / 200 MWh, 120 MW load, no export: foresight saves about the full annual rate under both rules. Realistic saves about 42 (4CP) and 46 (12CP) $/kW-yr, with 91 and 188 alert days.
