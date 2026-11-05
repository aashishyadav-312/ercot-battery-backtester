# Chargeline v4: Site intelligence plan (A, B, C, D)

Goal: move Chargeline from "what did a battery earn at a node" to "what is a battery worth at **my site**, all-in".

| ID | Feature | One line |
|---|---|---|
| A | Map context | Largest cities, county outlines, search by county, city or lat/long |
| B | Site Value card | Pick a place and see the nearest nodes, a $/kW-yr range, and a printable or exportable result |
| C | Full revenue stack | Energy plus ancillary services (Reg Up, Reg Down, RRS, ECRS, Non-Spin), before and after RTC+B |
| D | Data Center mode | Value of a battery co-located with a large load: merchant revenue, 4CP avoidance and SB6 curtailment cover |

How to use this file: commit it to `main` as `docs/PLAN_V4.md` (a docs-only commit does not change the site). For each
step, start a fresh Claude Code session, pick the model and effort in the table, and paste the step's **Prompt** line.

---

## Order, model and effort

Cloud steps (1, 2, 3) run **in parallel**, in three sessions started at the same time. They touch different folders, so
they can be developed in parallel; merge them in order 1, 2, 3. The local steps run one after another on your computer.

| Step | What | Where | Model | Effort | Screenshots |
|---|---|---|---|---|---|
| 1 | C engine: AS prices, co-optimized dispatch, precompute stack results | Cloud | Opus 5.5 | high | 0 |
| 2 | D engine: 4CP data, large-load model, SB6 inputs | Cloud | Opus 5.5 | high | 0 |
| 3 | A/B data: counties, cities, node-to-county index, feature flag | Cloud | Sonnet 5.5 | medium | 0 |
| 4 | A UI: map context and place search | Local | Sonnet 5.5 | high | ≤4 |
| 5 | B UI: Site Value card, export, shareable URL | Local | Sonnet 5.5 | high | ≤4 |
| 6 | C UI: revenue stack charts and toggles | Local | Sonnet 5.5 | high | ≤4 |
| 7 | D UI: Data Center mode, wired to the Step 2 engine | Local | Opus 5.5 | high | ≤4 |
| 8 | Method and Learn copy, final QA, turn the flag on | Local | Sonnet 5.5 | high | ≤9 |
| Review | Review one PR's diff (Steps 1, 2 and 7 at least) | Either | Opus 5.5 | medium | 0 |

If cloud credits run out mid-step, the step's progress file and pushed commits let a local session finish it (see rule 4).

---

## Global rules (every step)

**Safety: never break the live site**
1. Work on branch `v4/<N>-<slug>`. Open a **draft PR** with `gh` within the first 10 minutes. Never merge; I merge.
2. Everything new stays hidden behind the feature flag `V4` (Step 3 creates it). It is off on the live site until
   Step 8. Visible locally with `?v4=1` or `VITE_V4=1`.
3. Changes are **additive only**. Do not change existing result files, their schemas, existing routes, the Worker or
   published numbers. New results go under `results/v4/` (or the repo's equivalent public data path). Existing
   `npm test`, `pytest` and the web build must stay green.

**Progress and checkpoints**
4. Commit and push at every milestone, and at least every 20 minutes. Keep `docs/v4-progress-<N>.md` up to date: done,
   in progress, what's left, exact commands to resume. A later session must be able to finish the step from this file.

**Autonomy**
5. Decide minor things yourself and keep going: names, file layout, small UI choices, small helpers, library choice
   within existing dependencies, reasonable defaults. Note them in the PR. **Stop and ask me only for:** a paid service
   or API key; a new dependency over ~100 KB gzipped; changes to existing published numbers, schemas or routes;
   removing a feature; a regulatory or market rule you cannot source.

**Truth**
6. Never invent data, rules, tariffs or results. Every market rule, rate or threshold lives in a config file with a
   source URL and an "as of" date. If a rule cannot be verified, use a clearly labelled, conservative assumption and
   flag it in the PR. No hardcoded result numbers in UI code or copy (the v3 grep rule still applies).
7. Copy style (from `docs/REDESIGN.md` and v3): plain words, short sentences, no em dashes, no hype, no emoji. Tab and
   pill labels are one or two words.

**Efficiency (compute and time)**
8. Read only what the step needs. Use grep and file listings first; open only the relevant files. Do not read other plan
   files or unrelated folders. Do not re-read files you just wrote.
9. Tests: write focused tests for new logic. While working, run only the new or affected test files. Run the full
   `npm test`, `pytest` and build **once**, just before marking the PR ready.
10. Screenshots: only in UI steps, only for pages that step changed, at most the number in the table. Default set: the
    changed page at desktop dark and 390px light. Use `web/scripts/screenshots.mjs` limited to those pages. No
    full-site sweeps, no before/after pairs (Step 8 is the exception).
11. No audits (impeccable, full accessibility) except in Step 8. Accessibility basics still apply while building:
    real buttons, visible focus, keyboard path, 44px targets, 4.5:1 contrast, reduced motion.
12. Batch edits; write new files in one go. No narration. Final report at most 12 lines: what changed, test results,
    what's left, anything I must decide.

**Network (cloud steps)**
13. Data sources are ERCOT, the US Census Bureau and similar public sites. If a domain is blocked, say which one in the
    first 5 minutes and continue with the data already in the repo. Do not wait silently.

---

## Shared contracts (so parallel steps fit together)

Use these paths and shapes. If the repo already has a better equivalent, use it and note the mapping in the PR.

- **Feature flag** (Step 3 creates it): `web/src/config/features.ts` → `export const V4: boolean` (true when
  `import.meta.env.VITE_V4 === '1'` or the URL has `?v4=1`). Steps 1 and 2 do not touch UI files.
- **Geo** (Step 3): in the public data folder `data/v4/geo/`:
  - `tx_counties.topo.json`: Texas counties, simplified, under 300 KB.
  - `places.json`: `[{ name, kind: "city", county, pop, lat, lon }]`.
  - `node_index.json`: `{ "<node>": { lat, lon, county, nearestCity, cityKm } }`.
- **Stack results** (Step 1): `results/v4/stack/<year>_<dur>h_<mode>.json`
  ```
  { "meta": { year, durationH, mode, products, partialYear, monthsCovered, rtcb: "pre|post|mixed",
              assumptions, sources, generated },
    "nodes": { "<node>": { "energy": $/kW-yr, "regup":…, "regdn":…, "rrs":…, "ecrs":…, "nsrs":…, "total":… } } }
  ```
  Hubs are included as nodes. `mode` is `foresight` (upper bound) or `realistic` (match the repo's existing realistic
  mode, for example the DA-scheduled mode).
- **Data Center engine** (Step 2): one pure function with no UI imports, in the same language as the existing in-browser
  Studio engine:
  `runDataCenterCase(inputs) -> { perKwYr, totalUsd, breakdown: { energy, as, fourCp, reliability }, dispatchSample, notes }`.
  The 4CP data goes in `data/v4/fourcp/<year>.json`.

---

## Step 1: Revenue stack engine (C)

Model: **Opus 5.5, high**. Cloud. Branch `v4/1-stack`.

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 1. Do Step 1 only.`

Why: energy arbitrage alone understates battery value. ERCOT's Real-Time Co-optimization plus Batteries (RTC+B) went
live on Dec 5, 2025, which changed how batteries earn from ancillary services. The repo may already have partial AS
work from v2 Phase 14. Reuse it.

Do:
1. **Audit (10 minutes max).** Find the optimizer, the solver, the price data layout, the realistic mode and any
   existing AS code or data. Write the findings to `docs/v4-progress-1.md`. Extend what exists; do not rebuild.
2. **AS price data.** Get hourly DAM AS clearing prices (MCPC) for Reg Up, Reg Down, RRS, ECRS and Non-Spin for 2023,
   2024, 2025 and 2026 year to date. After Dec 5, 2025, also get real-time AS prices if ERCOT publishes them. Verify the
   report names on ercot.com, the ERCOT public API or the `gridstatus` library. Do not guess report IDs. Store them in
   the repo's existing data format with a fetch script under `scripts/` that can be re-run.
3. **AS rules config** (`model/config/as_rules.*`): for each product, the duration a battery must be able to sustain it
   (the state-of-charge requirement), whether it is symmetric, and its eligibility. Take these from the current ERCOT
   Nodal Protocols or NPRRs, with a source URL for each. If one cannot be verified, use a conservative assumption marked
   `ASSUMPTION`.
4. **Co-optimized dispatch.** Extend the optimizer to choose energy charge and discharge plus AS capacity each interval,
   subject to power headroom (energy plus up-products ≤ P; charging plus down-products ≤ P), SOC reserves for the
   awarded AS duration, efficiency and the existing degradation cost. AS revenue = award × MCPC. Ignore deployment
   energy except Reg (use a configurable deployment factor, default from a cited source or labelled ASSUMPTION). Two
   modes:
   - `foresight`: perfect hindsight upper bound.
   - `realistic`: AS awards and energy schedule from day-ahead prices only, then settled the same way as the repo's
     existing realistic mode.
   Price-taker assumption: say in `meta.assumptions` that AS markets are thin and that saturation lowers AS prices.
5. **Benchmark, then choose the scope.** Time one node-year. Use every CPU core (multiprocessing, or a rolling daily
   window with SOC carried over if a full-year LP is slow). Then run in this priority order, each tier committed as it
   finishes:
   - Tier 1 (must): all hubs × {2023, 2024, 2025, 2026 YTD} × {1, 2, 4 h} × both modes.
   - Tier 2 (must): all nodes × {2025, 2026 YTD} × {2, 4 h} × realistic.
   - Tier 3 (if time): all nodes × the remaining combinations.
   Make the run resumable: skip outputs that already exist, and record progress in the progress file.
6. **Check against the repo.** With AS turned off, the new engine must reproduce existing energy-only results within
   0.5% for 3 hubs and 3 nodes. Add this as a test.
7. Tests: AS rules load and every rule has a source; the headroom and SOC-reserve constraints hold on a 48-hour fixture;
   AS revenue math; energy-only parity; a schema test for an output file.

Done when: Tiers 1 and 2 are committed, the tests pass, `docs/v4-progress-1.md` lists sources and assumptions, and the PR
is ready. The UI is untouched.

---

## Step 2: Data Center engine (D)

Model: **Opus 5.5, high**. Cloud. Branch `v4/2-datacenter`.

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 2. Do Step 2 only.`

Why: a common real question is "what is excess BESS worth at a data-center site?" A co-located battery earns merchant
revenue, can cut the site's share of transmission costs (4CP), and can cover the load when it is curtailed under SB6.

Do:
1. **Audit (10 minutes max).** Find the Studio in-browser engine (language, entry point, inputs) and how it loads
   prices. Write the findings to `docs/v4-progress-2.md`. Put the new engine next to it, in the same language.
2. **4CP data.** For 2023, 2024, 2025 and 2026 YTD: the ERCOT 4CP intervals (the system peak 15-minute interval in each
   of June to September), taken from ERCOT's published 4CP data when available, otherwise computed from ERCOT system
   load. Also store daily system peak load for June to September, used by the realistic strategy. Write a fetch script
   that can be re-run.
3. **Rules config** (`.../config/datacenter_rules.*`, each item with a source URL and an "as of" date):
   - 4CP: how the charge is calculated, and a default transmission rate in $/kW per 4CP. The user can always override
     it. Flag clearly that the PUCT is reviewing ERCOT transmission cost allocation in 2026, so 4CP may change.
   - SB6 (2025) large-load provisions that matter for a battery: the size threshold, curtailment and backup-generation
     requirements, and which loads they apply to. Cite the statute and PUCT rule status. Do not paraphrase beyond the
     sources.
4. **Engine:** `runDataCenterCase(inputs)`.
   - Inputs: node, year, site load (MW), load factor (flat profile by default; optional uploaded 8760 CSV), BESS MW and
     MWh, round-trip efficiency, whether export to the grid is allowed, 4CP rate ($/kW per 4CP, defaulted from the
     config), 4CP strategy (`foresight` or `realistic`), curtailment hours per year and value of lost load ($/MWh)
     (both user inputs, defaults labelled as assumptions), AS on or off (uses Step 1 output when present; otherwise
     energy only, with a note).
   - 4CP value = load reduction at each 4CP interval × rate. `foresight` knows the peak. `realistic` discharges on days
     when the forecasted or observed daily peak is within a set % of the month-to-date peak, limited by stored energy,
     and counts only the intervals it actually covered.
   - Merchant value: run the existing (or Step 1) dispatch with energy reserved for June to September peak windows on
     alert days. Without export, discharge is capped at the site load.
   - Reliability value = min(curtailment hours, covered hours) × covered MW × value of lost load. Label it "user
     assumption".
   - Output: total $/yr, $/kW-yr and a breakdown, plus a short dispatch sample (one alert day) for a chart.
5. Tests: 4CP math on a fixture; `realistic` never beats `foresight`; without export, discharge never exceeds the load;
   breakdown sums to the total; every config rule has a source; the engine runs in under 2 s for one node-year in the
   test runtime.

Done when: the engine and data are committed, the tests pass, the progress file lists sources and assumptions, and the
PR is ready. The UI is untouched.

---

## Step 3: Geo data and feature flag (A, B)

Model: **Sonnet 5.5, medium**. Cloud. Branch `v4/3-geo`.

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 3. Do Step 3 only.`

Do:
1. Create the `V4` feature flag (see Shared contracts) with a tiny test.
2. **Counties:** from the US Census cartographic boundary county file (latest year), keep Texas only, simplify (for
   example with mapshaper) to under 300 KB TopoJSON, and keep the county name and FIPS code.
3. **Places:** from Census population data, the 10 largest Texas cities plus regional anchors for spread (at most 20 in
   total; for example West Texas, Panhandle, North Texas near the Red River, South Texas and the Valley, East Texas).
   Derive the list in a script from the Census file. Do not type populations. Include lat, lon, county and pop.
4. **Node index:** for each node with coordinates in the repo, its county (point in polygon), nearest place and distance
   in km. List the nodes that have no coordinates.
5. A small search index: county names (with and without "County"), place names, and lat/long parsing. Pure functions
   with tests (for example "Jack County", "jack", "33.2, -98.2").
6. Nearest-node helper: given lat/long, return the k nearest nodes with km (haversine) plus the nearest hub. Test it.

Done when: the data files, helpers and tests are committed, the build passes and the PR is ready. Not visible on the
live site.

---

## Step 4: Map context and place search (A)

Model: **Sonnet 5.5, high**. Local. Branch `v4/4-map`. Needs Step 3 merged.

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 4. Do Step 4 only.`

Do (behind `V4`):
- On the Atlas map, add faint county outlines (they appear at mid zoom) and city dots with labels. Labels must not
  collide; reduce them at low zoom. Use the existing tokens; city labels in `--text-2` style; no new colours.
- A search box over the map: county, city or "lat, long". On select: zoom to it, drop a pin, and show the 3 nearest
  nodes with distances. Keyboard: `/` focuses the box, arrows and Enter pick a result, Esc clears.
- Clicking anywhere on the map can also drop a pin (behind a "Pick a site" toggle so normal node clicks still work).
- The pin opens the Site Value card (Step 5). Until Step 5 lands, show the nearest-node list.
- Tests: search selection, pin placement, nearest-node list. Screenshots (≤4): Atlas with cities, and a search for
  "Jack County".

---

## Step 5: Site Value card (B)

Model: **Sonnet 5.5, high**. Local. Branch `v4/5-site`. Needs Step 4 merged (and Step 1 for the full stack).

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 5. Do Step 5 only.`

Do (behind `V4`):
- A side panel (a bottom sheet on phones) for a pinned site:
  - Header: place name, county, and the nearest city with its distance.
  - The 3 to 5 nearest nodes with distance, and the nearest hub.
  - Main figure: a **$/kW-yr range** across those nodes (min to max, with the median marked) for the selected year,
    duration and mode. Pills: Energy and Full stack (Full stack is shown when Step 1 data exists).
  - A small year strip (2023 to 2026 YTD) showing how the range moved. Partial years are labelled "YTD, annualized".
  - Plain caveats: backtest, not a forecast; node proximity is not an interconnection point; AS saturation.
  - Actions: "Open in Studio" (prefilled), "Data Center mode" (Step 7), "Copy link", "Download CSV", "Print" (print
    CSS gives a clean one-page result; no PDF library).
- Shareable URL holding the site and settings (`?lat=&lon=&dur=&year=&mode=`); old URLs still work.
- Tests: range math, URL round-trip, CSV contents, partial-year label. Screenshots (≤4): card desktop dark, card phone
  light, print preview.

---

## Step 6: Revenue stack UI (C)

Model: **Sonnet 5.5, high**. Local. Branch `v4/6-stack-ui`. Needs Step 1 merged.

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 6. Do Step 6 only.`

Do (behind `V4`):
- **Atlas:** a metric switch, Energy | Full stack. The colour scale recomputes for the chosen metric.
- **Node or hub detail:** a stacked bar of $/kW-yr by product (energy, Reg Up, Reg Down, RRS, ECRS, Non-Spin) for each
  year, with a pre/post RTC+B marker. Use the existing chart system and the product colours from the tokens; if new
  colours are needed, add them as tokens with 3:1 contrast in both themes. Add a one-line "what to look for" under the
  title.
- **Studio:** an "Ancillary services" toggle when the in-browser engine supports it. Otherwise show the precomputed
  stack for the matching settings and say so.
- Foresight vs realistic is shown as a clear range (upper bound vs realistic), not two competing headline numbers.
- Tests: stack sums, metric switch, the pre/post marker date. Screenshots (≤4).

---

## Step 7: Data Center mode (D)

Model: **Opus 5.5, high**. Local. Branch `v4/7-dc-ui`. Needs Steps 2 and 5 merged (Step 1 optional).

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 7. Do Step 7 only.`

Do (behind `V4`):
- A "Data Center" mode in Studio, also opened from the Site Value card with the site prefilled.
- Inputs in two groups. **Site:** load MW, load factor, optional 8760 CSV, export allowed. **Battery:** MW, MWh,
  efficiency. Under Advanced: 4CP rate and strategy, curtailment hours, value of lost load, AS on or off. Every default
  that is an assumption has a small "assumption" tag and its source in a tooltip-free note line.
- Output:
  - Headline: "Battery value at this site" in $/kW-yr and $/yr.
  - A waterfall or stacked bar: Energy, AS, 4CP avoided, Reliability.
  - A comparison with the same battery standalone at the nearest node.
  - A one-day dispatch chart from `dispatchSample`, showing load, battery and the 4CP interval.
- A visible note that 4CP rules are under PUCT review and SB6 rules are being implemented, with links from the config.
- Export: CSV of inputs and outputs, plus print.
- Run the engine in a Web Worker if it takes more than ~100 ms so the UI stays responsive.
- Tests: input validation, the engine wiring, the breakdown displayed equals the engine output. Screenshots (≤4).

---

## Step 8: Copy, QA and release

Model: **Sonnet 5.5, high**. Local. Branch `v4/8-release`. Needs Steps 4 to 7 merged.

**Prompt:** `Read docs/PLAN_V4.md: Global rules, Shared contracts and Step 8. Do Step 8 only.`

Do:
- **Method:** a short section for each of C and D: what is modelled, the two modes, and assumptions with sources (taken
  from the config files, not retyped).
- **Learn:** a short "Site screening" walk-through (search a county, read the card, open Data Center mode). Add
  glossary entries for ancillary services, RTC+B, 4CP and SB6.
- **Tour:** if the first-visit tour exists, add or adjust at most one step for site search.
- QA: the accessibility skill on the changed pages only; keyboard pass for search, card and Data Center mode; check
  there is no horizontal overflow at 320 and 390 px; zero console errors; grep for hardcoded numbers.
- Performance: new data files load lazily, only when used; report the total size of the new data loaded on first
  visit (target under 400 KB gzipped).
- Turn on `V4` for production in a separate final commit, so it can be reverted alone.
- Screenshots (≤9): Atlas with search, the card, the stack chart and Data Center mode, at desktop dark, phone light and
  one desktop light. Attach 3 to the PR.

Done when: the full tests, pytest and build pass, the PR is ready, and the report lists any remaining assumptions I
should check.

---

## Review prompt (fresh session)

Model: **Opus 5.5, medium**.

`Review PR #<n> against docs/PLAN_V4.md (Global rules and Step <N>). Read the diff and only the files it touches. Check
correctness of the math, sourcing of every rule, additive-only changes, flag gating and tests. List blocking issues
first, then nits. Do not edit code.`
