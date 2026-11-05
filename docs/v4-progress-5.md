# v4 Step 5 progress: Site Value card (B)

Branch `v4/5-site`, from `main` (Steps 3, 4, 6 merged; Step 1 not merged). Plan: PLAN_V4.md Step 5 (`docs/PLAN_V4.md` is not on `main`).

## Decisions
- Energy is always shown. Full stack shows only when `results/v4/stack/index.json` lists the matching file (year, duration, mode). The card requests only listed stack files.
- `index.json` shape is not defined by the plan. `web/src/v4/site/stackIndex.ts` accepts `{ files: [...] }` or a bare array whose entries are file names or paths (`2025_2h_realistic.json`), `{ file }`, or `{ year, durationH, mode }`. **Check this against what Step 1 writes.**
- `scripts/copy-data.mjs` (additive): writes `data/v4/nodes_index.json` (which `nodes_<year>_<dur>h.json` files exist) and, when `results/v4/stack/index.json` is absent, serves `{ "files": [] }`, so no request 404s. The stack fixture now has an `index.json` (`make-stack-fixture.mjs`).
- Energy values: Perfect foresight is `rev`, Day-ahead plan is `da_rev` in `nodes_*.json`. The card opens on Day-ahead plan (the realistic mode), 2 h, the latest year with an all-node file.
- All-node files exist for 2024 and 2025 at 2 h only. Years or sizes without one (2026 YTD, 1 h, 4 h) show the nearest hub from `results/index.json` (same $10/MWh degradation, pinned by a test) and say so. No node range is invented.
- Range is over the 5 nearest nodes that have prices (`SITE_NEAR_K`). A node without a row is left out and counted ("4 of 5").
- County of a site: point in polygon on the simplified county outlines. Nearest city: haversine over `places.json`.
- URL: `#/atlas?lat=&lon=&dur=&year=&mode=` plus `basis=stack` for Full stack. Written with `replaceState`; other parameters (`v4`, `loc`) are kept; clearing the site removes the keys. Old URLs have none of these keys and are unchanged.
- Print: a portal sheet hidden on screen; `@media print` hides the app and shows it. No PDF library.
- Open in Studio: nearest node that has price files, else the nearest hub (Studio has price files for 10 locations only); the card says which.
- "Data Center mode" action is not added: Step 7 owns it.
- RTC+B source in `web/src/v4/config.ts` is ERCOT's go-live announcement (as requested; the URL returned HTTP 200).

## Status
- [x] pure model, stack index parser, loaders, hooks
- [x] card, print sheet, URL, CSV, nodes-with-price-data note, wired into AtlasSite (replaces the Step 4 panel)
- [x] tests: `src/v4/site/*`, `src/v4/geo/place.test.ts`, `src/v4/map/AtlasSite.test.tsx` (now 5 nodes, address reset between tests)
- [x] screenshots (4): `web/screenshots/v4-site-*.png`; no console errors, no horizontal overflow at 1440 and 390
- [ ] pytest: no Python touched; see PR for whether it ran

## Resume
`cd web && npm ci && npm run prepare-data && VITE_V4=1 npx vite`, open `#/atlas?v4=1`, search "Jack County".
Tests: `npx vitest run src/v4`.
