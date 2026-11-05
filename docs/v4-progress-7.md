# v4 Step 7 progress: Data Center mode (D)

Branch `claude/step-7-site-value-4cp-0sm1u4`, PR #45. Plan: `docs/PLAN_V4.md` Step 7. Status: **done, PR ready**. Everything is
behind the `V4` flag.

## What was built

- `web/src/v4/dc/dcForm.ts` (pure): the form, defaults (market defaults read from `custom/config/datacenter_rules.json`),
  the `#/studio?mode=dc&...` link and its parser, `dcLinkFromSite` for the Site Value card, validation (the engine's own
  `validateDataCenterInputs` plus location and year), the stack match, the 4CP window check (`windowMisses`, `fitWindow`),
  breakdown rows, the waterfall steps and the CSV.
- `web/src/v4/dc/dcWorker.ts`, `dcClient.ts`: `runDataCenterCase` in a Web Worker (one node-year is about 0.5 to 1 s).
  HiGHS and price files stay loaded between runs; stale results are ignored.
- `web/src/v4/dc/DataCenter.tsx` (lazy-loaded by Studio): Site and Battery groups, Advanced (4CP rate, strategy, alert
  window, curtailment hours, value of lost load, ancillary services). Output: headline $/kW-yr and $/yr, waterfall plus an
  exact breakdown list, standalone comparison at the same price location, one-day dispatch chart from `dispatchSample`
  (load, grid draw, charge, discharge, 4CP interval and alert window shaded), the 4CP table, run notes, a "Rules are
  changing" card (4CP review and SB 6 status with links from the config), CSV and a print sheet.
- `web/src/v4/dc/ModeSwitch.tsx`: Battery | Data Center switch at the top of Studio, V4 only.
- `web/src/pages/Studio.tsx`: renders Data Center mode for `#/studio?mode=dc...` when V4 is on; optional `top` slot in the
  hero. Battery-mode links are unchanged.
- `web/src/v4/site/SiteCard.tsx`: "Data Center mode" action, prefilled with the site, its nearest node and distance, the
  card's year, duration (battery MWh = 50 MW x duration) and mode, and the nearest location with a price file.
- `web/src/data/loader.ts`: `loadFourCp(year)`. `web/src/v4/config.ts`: `FOURCP_YEARS`, `STACK_BATTERY`.
- `datacenter_rules.json`: one additive field, `defaults.valueOfLostLoad.label` = "ERCOT-wide average, not data-center specific".
- `copy-data.mjs` is unchanged: it already copies `results/v4/`.

## Decisions

- Ancillary services (b): used only when `results/v4/stack/index.json` lists the same year, duration (MWh / MW) and mode
  (perfect foresight -> `foresight`, day-ahead plan -> `realistic`), the battery has the stack's 0.85 round-trip
  efficiency, and the file has a row for the price location. Otherwise the engine runs energy only and the page says why
  (for example "No precomputed stack for a 3-hour battery ..."). Degradation is fixed at the stack's $10/MWh.
- 4CP window (c): checked in a test. Every official 2023, 2024 and 2025 interval (endings 16:00 to 17:45; counted spans
  15:45 to 18:00) falls inside 15:00-18:00, so the default is **not widened**. The computed 2026 intervals also fit. The
  window is an Advanced input; if the chosen window misses an interval of the selected year, the page says how many and
  offers the smallest whole-hour window that covers them.
- VOLL (d): its assumption note reads "ERCOT-wide average, not data-center specific", from the config.
- Site without a price file: the run uses the nearest location with one (as "Open in Studio" does) and says so.
- The uploaded 8760 CSV is not stored in the link (too large); the page says so.
- Runs start 350 ms after the last edit; no Run button.

## Tests

- `src/v4/dc/dcForm.test.ts` (19): config pins (4CP years, stack battery, defaults), the window check against
  2023-2025 and 2026, local span math, link round-trip and fallbacks, site link, partial-year label, validation, stack
  match and reasons, engine inputs, breakdown sums, waterfall, CSV.
- `src/v4/dc/DataCenter.test.tsx` (6): real engine and data; engine wiring (inputs, 4CP year, stack row); the displayed
  headline, breakdown, standalone, waterfall and dispatch series equal the engine output; energy-only reason; validation
  stops a run; assumption tags and sources; window warning and widen; mode switch.
- `src/v4/site/SiteCard.test.tsx`: the Data Center link.
- `src/shell/numbers.test.ts`: the two new screens added to the hardcoded-number grep.
- Full run: `npm test` 643 passed; `pytest` 130 passed; build passed.

Screenshots: `web/screenshots/v4-dc-desktop-dark.png`, `v4-dc-phone-light.png` (Advanced open), `v4-dc-print.png`. No
console errors, no horizontal overflow at 390 px.

## Resume

```
cd web && npm ci && npx vitest run src/v4/dc src/v4/site/SiteCard.test.tsx
npm run build && open "http://localhost:4173/?v4=1#/studio?mode=dc"   # after npm run preview
```
