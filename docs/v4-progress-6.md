# v4 Step 6 progress: revenue stack UI (C)

Branch `v4/6-stack-ui`, from `main`. Plan: PLAN_V4.md Step 6 (`docs/PLAN_V4.md` is not on `main` yet).

## Decisions
- Step 1 is not merged. The UI is built against a FIXTURE in the exact Stack results schema: `web/fixtures/v4/stack/*.json`
  (3 hubs, 3 nodes, 2025 and 2026, 2 h and 4 h, both modes). Every value is made up and marked FIXTURE in `meta`; the UI shows a banner.
  Regenerate with `node web/scripts/make-stack-fixture.mjs`.
- The fixture is served only when `V4_FIXTURE=1` is set for `npm run prepare-data`. Real `results/v4/stack/` wins when it exists. (Removed in Step 8: the build no longer copies the fixture at all. See docs/v4-progress-8.md.)
- `web/src/config/features.ts` does not exist (Step 3). Local stub `web/src/v4/flag.ts` has the same contract
  (`V4`). Step 3 has merged: `flag.ts` now re-exports from `config/features`.
- Assumption to check against Step 1: stack values are annualized $/kW-yr. A partial year is labelled "YTD (N months)".
- Atlas Full stack uses the realistic file (the mode every node gets in Tier 2). The upper bound (foresight) shows as a range on the node card when the file has the node.
- RTC+B go-live date lives in `web/src/v4/config.ts` with a source; a test pins it to `results/rtcb.json`.

## Status
- [x] fixture + generator
- [x] data layer (types, loader, copy-data, config)
- [x] Atlas: Energy | Full stack switch
- [x] Revenue page: stacked bar by year, pre/post RTC+B marker, upper-bound diamond
- [x] Studio: precomputed stack note
- [x] tests: 517 pass (`npm test`), build passes with `V4_FIXTURE=1`
- [x] screenshots (4) in `web/screenshots/v4-*.png`, no console errors, no overflow at 1440 and 390
- [ ] pytest not run: not installed here, and no Python was touched

## Resume
`cd web && npm ci && npm run prepare-data && VITE_V4=1 npx vite` then open `#/atlas`, `#/research/revenue`, `#/studio`.
Tests: `npx vitest run src/v4 src/pages/Atlas`.
When Step 1 lands: delete nothing; real `results/v4/stack` takes over automatically. Check the annualization assumption above.
