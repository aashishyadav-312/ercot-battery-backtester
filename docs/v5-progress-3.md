# V5 Step 3: nearby batteries data

Source: EIA-860M, release 2026-09 (workbook "as of September 2026"), downloaded 2026-11-13.
`python -m data.fetch_eia860m` printed:

- 405 units: 260 operating, 145 planned (one unit per plant)
- Operating 18,741.6 MW, planned 23,948.3 MW
- Dropped, no coordinates: 0 operating, 0 planned
- Dropped, other balancing authority: 1 operating, 7 planned
- Dropped, operating but out of service: 2

Decisions
- The workbook has a Balancing Authority Code column, so only ERCO rows are kept.
- The EIA page links Oct to Dec 2026 files that are not published; they return HTML. The script walks the links newest first and takes the first real workbook (Sept 2026).
- `mw` is net summer capacity (nameplate if blank). `mwh` is nameplate energy on Operating, null on Planned (no column).
- Operating keeps status (OP) only. Planned keeps every planned status, permit pending to construction complete.
- Generators of one plant and status are summed into one unit, so the nearest-5 list does not repeat a site.
- `nearbyBatteries` reuses `haversineKm` from `v4/geo/nearest`. Radius 40 km in `web/src/v5/config.json`, `assumption: true`.
- Extra top-level fields in the JSON: `scope`, `generated`, `dropped` (additive).

Tests: `pytest tests/test_fetch_eia860m.py` (6), `npx vitest run src/v5` (8). Both pass.
Not verified: `tsc` and `src/v4/noFixture.test.ts` fail locally on a missing generated `data-version.json`, with or without this step. Nothing in `src/v5` has a type error.
