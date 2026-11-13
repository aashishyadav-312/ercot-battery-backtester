# Chargeline v5: site-first release

*Plan written Nov 13, 2026. Save as `docs/PLAN_V5.md` on `main`.*

**Goal of this update.** A visitor lands, types a place, and gets one page that answers "what is a battery worth here, who else is building here, and what happens to my transmission savings if the 4CP rule changes". Fewer tabs, fewer numbers on first view, one new model (12CP), one new dataset (nearby batteries).

**Starting point (checked Nov 12).** `main` is at `8a6f2bc` (PR #48, `v4/10-followup`, merged). V4 is on in production. `datacenter_rules.json` already cites the 12CP proposal in `fourCp.review`.

---

## How to run this plan

Six Claude Code cloud sessions in three waves. Sessions inside a wave run at the same time.

| Wave | Step | What | Model, effort | Branch | Rough time |
|---|---|---|---|---|---|
| 1 | 1 | V5 flag, simpler nav and Home, Advanced toggle | Sonnet 5.5, high | `v5/1-front-door` | 60 to 90 min |
| 1 | 2 | 12CP engine and data | Opus 5.5, high | `v5/2-twelvecp-engine` | 60 to 90 min |
| 1 | 3 | Nearby batteries data (EIA-860M) | Sonnet 5.5, medium | `v5/3-nearby-batteries` | 45 to 60 min |
| 2 | 4 | Site report page | Sonnet 5.5, high | `v5/4-site-report` | 60 to 90 min |
| 2 | 5 | 12CP switch in Data Center mode | Sonnet 5.5, high | `v5/5-twelvecp-ui` | 45 to 60 min |
| 3 | 6 | Review, docs, full tests, screenshots, switch V5 on | Opus 5.5, medium | `v5/6-release` | 45 to 60 min |

**Aashish's part**
1. Start the three Wave 1 sessions with the kickoff prompts at the bottom.
2. When each PR is green, merge it with a **merge commit** (not squash). Any order inside a wave.
3. Start Wave 2 only after all of Wave 1 is merged. Start Wave 3 only after all of Wave 2 is merged.
4. Stop merging two hours before the demo. Until Step 6 is merged, V5 is off for visitors and you demo with `?v5=1` added to the address. If Step 3 is late, skip it: Step 4 hides that section when its data file is missing.

**Why the live site stays safe**
- Every visible change sits behind the V5 flag, which is off by default until the last commit of Step 6.
- Steps 2 and 3 only add new files that nothing imports yet.
- Step 6 turns V5 on in a commit of its own. Reverting that one commit turns it off.

---

## Global rules (every session reads this section)

**Scope and safety**
- Do your step only. Do not start another step, and do not refactor code your step does not need.
- Additive only. Do not rename or remove existing result fields, files, routes or URL parameters. Old addresses must keep working.
- With V5 off, the site must look and behave exactly as it does today. With `?v4=0` it must still work.
- Never merge. Never push to `main`. Never force-push. Never print or commit `.env`.

**Decide for yourself**
- Make every small and medium call yourself: naming, layout details, copy, test design, minor refactors inside your own files, picking between two reasonable approaches. Write the choice in your progress note and move on.
- Stop and ask Aashish only for: a paid API or new paid service; changing or deleting an existing result schema, route or file; a market rule you cannot source; a download the sandbox blocks after one retry; a change that would be visible with V5 off.
- If you are blocked on one part, finish the rest, mark the gap in the PR description, and keep going.

**Honesty**
- No number in the UI is typed by hand. Values come from result files or config. The existing grep test enforces this; do not weaken it.
- Every market rule lives in a config file with a source URL and an as-of date. If you cannot verify one, label it `assumption: true` and say so in the UI text.
- No FIXTURE data in the build. `check-no-fixture.mjs` must pass.
- Say "backtest" and "screening", never "forecast". Keep caveats next to the numbers they qualify.

**Look and feel (keep the Chargeline theme)**
- Use the existing tokens in `web/src/theme` and `web/src/styles`, the existing Mantine setup, and existing parts (`components/Section.tsx`, `v4/Parts.tsx`, the SiteCard and Stack styles). No new colours, fonts, icon sets or UI libraries.
- Both dark and light themes must work. Match the spacing, card style and type scale of the page you are editing.
- Copy: plain words, short sentences, no em dashes, no hype. Tab labels are one or two words.
- Accessibility basics: visible focus, 44 px touch targets, 4.5:1 text contrast, reduced motion respected, keyboard reachable.

**Spend time and compute carefully**
- Read only what you need: this section, Shared contracts, and your step. Find code with grep before opening files. Do not read `PLAN_V4.md`, `REDESIGN.md` or old progress notes unless your step names them.
- Tests while working: run only the files you touched or added, for example `npx vitest run src/v5 src/pages/Home.test.tsx` or `pytest tests/test_twelvecp.py`.
- Before opening the PR for review: `npx tsc --noEmit` and your targeted tests. Do **not** run the full suite in Steps 1 to 5. CI runs it on the PR; check with `gh pr checks` and fix what it reports. A few tests time out when many workers run at once; rerun a timed-out file alone before treating it as a failure.
- Screenshots: none in Steps 2 and 3. At most 2 in each of Steps 1, 4 and 5, taken once at the end, only of pages you changed. Step 6 takes at most 6. Save them outside the repo, look at them yourself, and do not commit image files.
- Do not add a dependency unless the step cannot be done without it.

**Git**
- Branch from current `main` using the branch name in the table. Open a draft PR after the first commit. Push about every 20 minutes.
- When done: mark the PR ready, and put in the description what changed, what you decided, what is unverified, and how to see it (`?v5=1` plus the address).
- Add `docs/v5-progress-<N>.md`, 25 lines or fewer.

---

## Shared contracts (every session reads this section)

**The flag** (Step 1 creates it; Steps 4, 5, 6 use it)
- `web/src/config/features.ts` gains `V5_DEFAULT_ON = false`, a pure `v5Enabled(...)` and `export const V5`, built the same way as V4. `?v5=1` and `?v5=0` in the address win over `VITE_V5`, which wins over the default.
- V5 on implies the V4 features are available. If V4 is forced off, V5 is off too.

**File ownership in Wave 1** (this is what prevents merge conflicts)
- Step 1 owns: `features.ts`, `web/scripts/copy-data.mjs`, `.github/workflows/ci.yml`, the shell and nav, `pages/Home.*`, `pages/Atlas.*`, `pages/Learn.*`, `pages/Research.*`.
- Step 2 owns: `data/fetch_twelvecp.py`, `results/v5/twelvecp/`, `web/src/custom/twelvecp.ts` and its test, `web/src/custom/config/twelvecp_rules.json`, any new Python tests. It may make an additive, default-off change to `web/src/custom/datacenter.ts`.
- Step 3 owns: `data/fetch_eia860m.py`, `results/v5/batteries/`, `web/src/v5/nearby.ts` and its test, any new Python tests.
- Steps 2 and 3 do not touch files owned by Step 1.

**Data files**
- Step 1 makes `copy-data.mjs` copy everything under `results/v5/` into the site, the same way `results/v4/` is copied, and makes it succeed when the folder is empty or missing.
- `results/v5/twelvecp/<year>.json` (Step 2), for 2023 to 2026:
  `{ year, status, complete, source, asOf, intervals: [ { month, start_utc, end_utc, interval_ending_local, resolution_minutes, ercot_peak_mw } ] }` with 12 entries for a complete year.
- `results/v5/batteries/tx_batteries.json` (Step 3):
  `{ source, sourceUrl, asOf, release, count, units: [ { name, owner, county, lat, lon, mw, mwh|null, status: "operating"|"planned", online: "YYYY-MM"|null, ba } ] }`.

**Pure functions**
- Step 2: `runTwelveCpCase(input, rules, peaks)` in `web/src/custom/twelvecp.ts`, or an additive option on `runDataCenterCase` that defaults to today's behaviour. It returns the avoided transmission charge in `$/kW-yr` and `$/yr`, the number of alert days, and the energy revenue given up to hold the cuts, for 4CP and 12CP on the same inputs.
- Step 3: `nearbyBatteries(units, lat, lon, radiusKm)` in `web/src/v5/nearby.ts` returns `{ operatingMw, plannedMw, operatingCount, plannedCount, nearest: Unit[] (up to 5, with distanceKm) }`.

**Routes and URL parameters**
- New route (Step 4): `#/site?lat=&lon=&dur=&year=[&basis=stack]`. Existing `#/atlas?lat=&lon=...` links keep working.
- New parameter (Step 5): `tcos=4cp|12cp` in Data Center mode and in Project economics when `rev=dc`. Missing means `4cp`.
- `#/research` and its sub-routes keep resolving.

---

## Step 1: front door (Sonnet 5.5, high)

**Why.** The site opens with a long page of statistics and five tabs. A new visitor should see one action: screen a site.

**Build, all behind V5**
1. The flag, as in Shared contracts, with unit tests copied from the V4 flag tests. Add a `web-v5` CI job that runs `npm test` with `VITE_V5=1`, modelled on `web-v4`.
2. `copy-data.mjs` copies `results/v5/` (see Shared contracts).
3. Nav becomes four tabs: Home, Atlas, Studio, Learn. Research moves inside Learn as a section that renders the existing Research content. `#/research...` addresses redirect there.
4. Home, in this order:
   - Hero with one search box: "Screen a site". It reuses the Atlas place search (county, city, or "lat, lon") and sends the visitor to `#/atlas?lat=&lon=` for now. Step 4 will point it at `#/site`. Put that target in one exported function so Step 4 changes one line.
   - Three headline figures, taken from the ones already computed on Home. Choose the three a developer would act on.
   - The hub table and live prices, as they are.
   - Three entry cards: Atlas, Studio, Learn.
   - Move the "what a schedule keeps" and duration sections out of Home. They already exist in Research; link to them.
5. Advanced toggle on Atlas: by default show the Revenue metric and the Energy or Full stack switch. Capture rate and Top-10-day share pills, and the Spread, Corr. hub and Cycles table columns, appear when "Advanced" is on. Remember the choice in the address (`adv=1`). The CSV download always has every column.
6. Update the first-visit tour only if a tour step now points at something that moved.

**Do not** change Studio, the Site Value card, or any result file.

**Done when.** With `?v5=1`: four tabs, the new Home, the Advanced toggle, and every old address still lands somewhere sensible. With V5 off: no visible difference. Targeted tests and `tsc` pass. Two screenshots at most: Home and Atlas, dark theme, one at mobile width.

---

## Step 2: 12CP engine and data (Opus 5.5, high)

**Why.** Data Center mode values 4CP avoidance. The PUCT proposed replacing 4CP with 12 monthly coincident peaks measured on a 30-minute interval (Project 58000, proposal for publication approved July 9, 2026), with a decision due by December 31, 2026. Clients need to see their savings under both.

**Read first**
- `web/src/custom/datacenter.ts`, `web/src/custom/config/datacenter_rules.json`, `data/fetch_fourcp.py`, one `results/v4/fourcp/<year>.json`.
- The proposal text: `https://www.ercot.com/files/docs/2026/07/23/PUCT-Project-58000-pfp_adopted-9-July-2026.pdf`. Take from it only what you can quote a section for. Check whether a later order or adopted rule exists and, if so, use and cite it.

**Build**
1. `data/fetch_twelvecp.py`: for 2023 to 2026, find ERCOT's coincident peak in each calendar month from the same load source `fetch_fourcp.py` uses for unpublished years. Write `results/v5/twelvecp/<year>.json` in the contract shape. Mark an incomplete year `complete: false` and include only finished months. Record resolution honestly: if the source is hourly, say 60 minutes and do not claim the 30-minute interval.
2. `twelvecp_rules.json`: the method text, the interval, the status ("proposed, not adopted" unless you find an adopted rule), source URLs and as-of dates. The default rate per peak is the same annual postage stamp rate already in `datacenter_rules.json` divided by 12, labelled `assumption: true`, read from that file and not retyped. List under `notModelled` the parts of the proposal the engine ignores, such as any minimum billing demand or contracted-demand weighting.
3. The engine (see Shared contracts). Rules of the model:
   - Same battery, load and efficiency inputs as the 4CP case, so the two results are comparable line by line.
   - Perfect strategy: cut at each known monthly peak. Realistic strategy: the same kind of rule the 4CP case uses (alert when the day's peak reaches a threshold of the month's earlier peaks), extended to all 12 months. Peak hours differ by season, so derive the hold window per month or season from the 2023 to 2025 peaks, store it in config, and add a test that the window covers every historical peak it claims to cover.
   - A cut counts only if held across the whole interval plus the same margin the 4CP case uses.
   - Report what the battery gives up in energy revenue to hold the cuts, the same way the 4CP case does.
4. Tests: the existing `datacenter.test.ts` must pass unchanged. New tests cover: 12 peaks found per complete year; 4CP result identical to today when the option is off; a hand-checked small case for 12CP; an incomplete year.

**Do not** build UI, and do not edit files owned by Step 1.

**Done when.** `pytest` for the new fetch tests and `npx vitest run src/custom` pass, `tsc` passes, result files are committed, and the progress note states in two lines what the model assumes and what it ignores. No screenshots.

---

## Step 3: nearby batteries data (Sonnet 5.5, medium)

**Why.** Battery revenue in ERCOT has fallen as the fleet grew. A site report should show how much storage already operates, and is planned, near the site.

**Build**
1. `data/fetch_eia860m.py`: download the latest EIA-860M workbook from `https://www.eia.gov/electricity/data/eia860m/`. From the Operating and Planned sheets keep battery storage units in Texas. Keep the fields in the contract. If the workbook has a balancing authority column, keep only ERCOT units; if not, keep all Texas units and set a `scope` note in the output saying so. Drop rows without coordinates and report how many were dropped. Use `openpyxl` or `pandas` if already installed.
2. Write `results/v5/batteries/tx_batteries.json` with `source`, `sourceUrl`, the release month and `asOf`. Keep it small: round coordinates to 4 decimals, no unused columns.
3. `web/src/v5/nearby.ts`: `nearbyBatteries(...)` as in Shared contracts, using great-circle distance. The default radius lives in a small config (`web/src/v5/config.json`, 40 km, `assumption: true`).
4. Tests: a pytest for the parser on a tiny hand-made workbook or frame; a vitest for the distance and the sums.

**If the download is blocked**, retry once, then stop and tell Aashish which file to download by hand and where to put it (`data/raw/`). Do not invent rows.

**Do not** build UI, try to place unlocated price nodes, or edit files owned by Step 1.

**Done when.** The JSON is committed with a real release month, both test files pass, and the progress note gives the unit count, total operating MW and total planned MW as printed by the script. No screenshots.

---

## Step 4: site report (Sonnet 5.5, high)

*Start after Steps 1, 2 and 3 are merged. Runs alongside Step 5.*

**Why.** Today the answer for one site is spread across the Atlas card, the stack switch and Studio. Put it on one shareable page.

**Build, behind V5**
1. New page at `#/site?lat=&lon=&dur=&year=[&basis=stack]`, in `web/src/v5/site/`. Reuse `useSiteData`, `siteValue`, the SiteCard parts, `StackByYear` and `SitePrint`. Do not copy their logic.
2. Sections, top to bottom:
   - **Where.** Place name, county, nearest hub, a small locator map if the Atlas map component can be reused cheaply; otherwise skip the map.
   - **Battery value.** The `$/kW-yr` range across the 5 nearest priced nodes with the median marked, the by-year strip, and the Energy or Full stack switch. Duration and year pickers.
   - **Storage nearby.** Operating MW and planned MW within the radius, counts, and the 5 nearest units with distance and online date, from `tx_batteries.json` through `nearbyBatteries`. Show the EIA release month and source link. One plain sentence on why it matters: more storage nearby tends to lower the spreads a new battery can earn. If the data file is missing, hide the section.
   - **For a data center.** Two or three sentences and one button that opens Data Center mode in Studio with this location carried over. No numbers here.
   - **Limits.** The existing Site Value caveats.
   - Actions: Copy link, CSV, Print. Extend the existing CSV and print output with the Storage nearby block.
3. Point the Home search (one function from Step 1) and the Atlas "Pick a site" result at `#/site`. Keep the Atlas card working and add an "Open site report" link on it.
4. Empty and error states: no priced node within reach, coordinates outside Texas, data still loading.

**Do not** edit `v4/dc/` or `custom/` (Step 5 is working there).

**Done when.** With `?v5=1`, searching a county on Home lands on a complete report; the address can be pasted into a new tab and gives the same page; print layout is clean. V5 off: unchanged. Two screenshots at most: the report at desktop and mobile width.

---

## Step 5: 12CP switch in Data Center mode (Sonnet 5.5, high)

*Start after Steps 1 and 2 are merged. Runs alongside Step 4.*

**Why.** Step 2 built the model. This step lets a visitor see it.

**Build, behind V5**
1. In Data Center mode, a control "Transmission charge" with two options: "4CP (current rule)" and "12CP (proposed)". Stored in the address as `tcos`.
2. A comparison block that always shows both, side by side: avoided charge in `$/kW-yr` and `$/yr`, alert days per year, energy revenue given up, net value. The selected option drives the main result, the breakdown bar and the dispatch chart.
3. A short note under the block, from `twelvecp_rules.json`: what is proposed, that it is not adopted (or the adopted status if Step 2 found one), what the model ignores, with source links and the as-of date.
4. Project economics with `rev=dc` uses the selected `tcos`. CSV and print include both rows.
5. Incomplete years: show the months available and say so.

**Do not** edit the new site report files (Step 4 is working there) or change the 4CP numbers shown today.

**Done when.** With `?v5=1`, switching the control changes the result and the address, both rows are always visible, and with `tcos` missing the page matches today's output. V5 off: unchanged. Two screenshots at most: the comparison block in dark and light.

---

## Step 6: release (Opus 5.5, medium)

*Start after Steps 4 and 5 are merged.*

1. **Review** the combined change: `git diff 8a6f2bc..main -- web/src data model results/v5 .github`. Look for: anything visible with V5 off; typed numbers; rules without sources; broken old addresses; theme drift; accessibility gaps; dead code. Fix what you find in small commits.
2. **Words.** Add glossary entries for 12CP, coincident peak, site report and storage nearby. Add a short Method section for the 12CP model and the EIA-860M data, and a Learn line on how to read the site report. Update the tour only if a step is now wrong.
3. **Full checks, once each:** `npm test` with default flags, `npm test` with `VITE_V5=1`, `npm run build`, `pytest`.
4. **Screenshots, at most 6,** with V5 on: Home, site report (desktop and mobile), Data Center 12CP block, Atlas with Advanced off, Learn with Research inside. Look at each and fix real problems. Do not commit them.
5. **Notes.** `docs/v5-progress-6.md` with what shipped, what is unverified, and known limits.
6. **Last commit, on its own:** set `V5_DEFAULT_ON = true`. Commit message: "V5 step 6: turn V5 on for production (revert this commit alone to switch it off)". Nothing else in that commit.

**Done when.** CI is green on the PR and the description lists anything Aashish should check by hand before merging.

---

## Kickoff prompts

Paste one per session. Set the model and effort shown before sending.

**Step 1 (Sonnet 5.5, high)**
```
Read docs/PLAN_V5.md: "Global rules", "Shared contracts" and "Step 1" only. Do Step 1 only, on branch v5/1-front-door. Decide small things yourself and note them; stop only for the cases listed under "Decide for yourself". Open a draft PR early, mark it ready when done. Do not merge.
```

**Step 2 (Opus 5.5, high)**
```
Read docs/PLAN_V5.md: "Global rules", "Shared contracts" and "Step 2" only. Do Step 2 only, on branch v5/2-twelvecp-engine. Decide small things yourself and note them; stop only for the cases listed under "Decide for yourself". Open a draft PR early, mark it ready when done. Do not merge.
```

**Step 3 (Sonnet 5.5, medium)**
```
Read docs/PLAN_V5.md: "Global rules", "Shared contracts" and "Step 3" only. Do Step 3 only, on branch v5/3-nearby-batteries. Decide small things yourself and note them; stop only for the cases listed under "Decide for yourself". Open a draft PR early, mark it ready when done. Do not merge.
```

**Step 4 (Sonnet 5.5, high), after Wave 1 is merged**
```
Read docs/PLAN_V5.md: "Global rules", "Shared contracts" and "Step 4" only. Do Step 4 only, on branch v5/4-site-report from current main. Decide small things yourself and note them; stop only for the cases listed under "Decide for yourself". Open a draft PR early, mark it ready when done. Do not merge.
```

**Step 5 (Sonnet 5.5, high), after Wave 1 is merged**
```
Read docs/PLAN_V5.md: "Global rules", "Shared contracts" and "Step 5" only. Do Step 5 only, on branch v5/5-twelvecp-ui from current main. Decide small things yourself and note them; stop only for the cases listed under "Decide for yourself". Open a draft PR early, mark it ready when done. Do not merge.
```

**Step 6 (Opus 5.5, medium), after Wave 2 is merged**
```
Read docs/PLAN_V5.md: "Global rules", "Shared contracts" and "Step 6" only. Do Step 6 only, on branch v5/6-release from current main. Decide small things yourself and note them; stop only for the cases listed under "Decide for yourself". The commit that sets V5_DEFAULT_ON = true must be the last commit and contain nothing else. Do not merge.
```

---

## Left for the next update

- Flexible connection case (curtailment hours against battery and backup sizing) with sourced Batch Zero rules.
- Low, mid and high revenue range, after the 2023 and 2024 all-node stack runs exist.
- Any Atlas node opening in Studio.
- Interconnection queue and binding-constraint layers (gridstatus), degradation from BLAST-Lite, on-site sizing with REopt.
