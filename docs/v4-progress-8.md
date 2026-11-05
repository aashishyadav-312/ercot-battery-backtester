# v4 Step 8 progress: copy, QA and release

Branch `v4/8-release`. Plan: `docs/PLAN_V4.md` Step 8. Status: **done, PR ready**. The last commit turns `V4` on for production and
can be reverted alone (`git revert <that commit>`; it changes one constant, `V4_DEFAULT_ON` in `web/src/config/features.ts`).

## What changed

- **Method** (`web/src/v4/method/`, lazy, V4 only): a "Revenue stack" section and a "Data Center mode" section. Every rule, rate,
  date and figure is read from a file, not typed:
  - `model/config/as_rules.json` is copied to `data/v4/as_rules.json` by `web/scripts/build-v4-method.mjs`. Its modes text, reserve
    durations, RTC+B date and every `"status": "ASSUMPTION"` item are shown.
  - `datacenter_rules.json` (imported): the 4CP method, the "4CP may change" box with its links, the SB 6 rule status and every
    `"assumption": true` item.
  - `data/v4/method_facts.json` (same script): the headroom check and the coverage of every stack file.
- **Headroom rule**: states the standard formulation (an idle battery may offer full power up and down at once). The stricter value
  ($102.01, HB_HOUSTON 2024, 2 h, perfect foresight) is read from the sentence in `docs/v4-progress-1.md`; the standard value
  ($110.72) is read from `results/v4/stack/2024_2h_foresight.json`. The build stops if the two sources disagree or the sentence is gone.
  **The page says the gap is not the rule alone.** The older screen also ran with no Regulation deployment energy and a different
  ERCOT price source. A clean headroom-only number needs the raw AS prices (not in the repository); see "Decide" below.
- **2023**: `AS_UPPER_BOUND_YEARS` in `web/src/v4/config.ts`. 2023 is labelled "(upper bound)" in the stack chart (title, axis, note),
  the Atlas Full stack note, the Site Value card (strip, caveats, print, CSV) and Data Center (headline, notes, print, CSV; only when
  the stack was used). A test pins the config to the data: the 2023 ancillary part is more than twice every other year at every hub.
- **Data gaps**: listed from each stack file's meta (`daysCoveredBySource`, `dataGaps`, first and last day, months) by
  `coverageLines()`. The stack index lists four years, but all-node results exist only for 2025 and 2026; 2023 and 2024 hold the five
  hubs. The text is computed from the files, so it follows them.
- **4CP may change**: the PUCT 12CP proposal text and links come from `datacenter_rules.json` (`fourCp.review`).
- **Learn**: "Site screening" (3 steps) is section 3 of Basics. Glossary: Ancillary services, RTC+B, 4CP, SB 6.
- **Tour**: the Atlas step also mentions site search (no new step, same anchors).
- **Flag**: `V4_DEFAULT_ON` (false until the last commit). `?v4=0` or `VITE_V4=0` turn V4 off; the address wins over the build
  variable. Unit tests run with `VITE_V4=0` (`vite.config.ts`).

## FIXTURE can never load in production

1. `copy-data.mjs` no longer copies `web/fixtures/v4/stack` at all (the `V4_FIXTURE=1` switch is gone). Tests read the fixture from disk.
2. `npm run build` runs `scripts/check-no-fixture.mjs` after Vite (postbuild): it fails if any file under `dist/data` mentions
   FIXTURE. CI and the deploy workflow both run `npm run build`.
3. `loadStack` refuses a FIXTURE file when `import.meta.env.PROD`, so a stray one reads as "no file", never as a result.
4. `src/v4/noFixture.test.ts` covers all three.

## QA

- axe (WCAG 2.2 AA tags) on Method, Learn, Atlas with the card, Data Center and the stack chart, light and dark: zero violations
  after one fix (links inside a yellow alert had 4.4:1 in dark; the 4CP box is now a bordered panel).
- Keyboard: `/` focuses search, arrows and Enter pick, the card's controls are all reachable with a visible focus ring, Data Center
  controls are 44px high.
- No horizontal overflow at 320 and 390 px on Method, Learn, Atlas and Data Center. Zero console errors and zero failed requests on
  all nine screenshot pages.
- Hardcoded numbers: `src/shell/numbers.test.ts` now covers `v4/method/V4Method.tsx` and `v4/learn/Screening.tsx`; a grep of
  `src/v4/**/*.tsx` shows only chart and map geometry.
- Data loaded lazily (gzipped, measured with a production preview): Home 0 B of v4 data and no v4 script; Method 2.7 KB; Data Center
  17 KB; Atlas with a place search and the card about 79 KB (county outlines 31 KB, node index 9 KB, two 2025 stack files 30 KB);
  Research revenue chart about 73 KB. All far under the 400 KB target.

Screenshots in `web/screenshots/v4-release-*.png` (nine). In the PR: Atlas search with the card (phone), the stack chart, Data Center.

## Tests

`npm test`, `pytest` and `npm run build` were run once before marking the PR ready (numbers in the PR).

## Decide

- The stricter-rule comparison mixes three differences. To get a headroom-only number, re-run `model/stack.py` for HB_HOUSTON 2024
  2 h with `headroom="shared"` and the same deployment factor, with the raw AS prices (`data/fetch_ancillary.py`), and store it in
  `results/v4/`. Until then the page says so.
- The Method page builds from `docs/v4-progress-1.md`. If that sentence is edited, `npm run prepare-data` stops with a clear error.

## Resume

```
cd web && npm ci && npm test && npm run build && npx vite preview   # open /ercot-battery-backtester/#/research/method
```
