# v4 Step 5 progress: Site Value card (B)

Branch `v4/5-site`, from `main` (Steps 3, 4, 6 merged; Step 1 not merged). Plan: PLAN_V4.md Step 5.

## Decisions
- Energy is always shown. Full stack shows only when `results/v4/stack/index.json` lists the matching file (year, duration, mode).
- RTC+B source in `web/src/v4/config.ts` is ERCOT's go-live announcement (as requested).

## Status
- [x] branch, RTC+B source
- [ ] pure model (range, strip, URL, CSV), stack index parser
- [ ] card, print sheet, wiring in AtlasSite
- [ ] tests, screenshots, full run

## Resume
`cd web && npm ci && VITE_V4=1 npx vite`, open `#/atlas`, search "Jack County". Tests: `npx vitest run src/v4`.
