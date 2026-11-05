# v4 Step 6 progress: revenue stack UI (C)

Branch `v4/6-stack-ui`, from `main`. Plan: PLAN_V4.md Step 6 (attached to the session; `docs/PLAN_V4.md` is not on `main` yet).

## Decisions
- Step 1 is not merged. UI is built against a FIXTURE in the exact Stack results schema: `web/fixtures/v4/stack/*.json`
  (3 hubs, 3 nodes, 2025 and 2026, 2 h and 4 h, both modes). Every value is made up. Regenerate with `node web/scripts/make-stack-fixture.mjs`.
- The fixture is served only when `V4_FIXTURE=1` is set for `npm run prepare-data`. Real `results/v4/stack/` wins when it exists.
- `web/src/config/features.ts` does not exist (Step 3). A local stub `web/src/v4/flag.ts` has the same contract
  (`V4`: `VITE_V4=1` or `?v4=1`). When Step 3 merges, change the one import in `flag.ts` to re-export from `config/features`.

## Status
- [ ] fixture + generator
- [ ] data layer (types, loader, copy-data, config)
- [ ] Atlas: Energy | Full stack switch
- [ ] Revenue page: stacked bar by year, pre/post RTC+B marker, upper-bound marker
- [ ] Studio: precomputed stack note
- [ ] tests, screenshots, PR ready

## Resume
`cd web && npm ci && V4_FIXTURE=1 npm run prepare-data && VITE_V4=1 npx vite` then open `#/atlas`, `#/research/revenue`, `#/studio`.
Tests: `npx vitest run src/v4 src/pages/Atlas.test.tsx`.
