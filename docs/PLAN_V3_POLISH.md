# Chargeline v3 polish plan

How to use this file: put it in the repo as `docs/PLAN_V3_POLISH.md`. In Claude Code, start a fresh session for each step
and say: "Read docs/PLAN_V3_POLISH.md, the Global rules and Step N, then do Step N only." Each step names the model and
effort to pick before you paste that line. One branch and one PR per step. You review and merge; Claude Code never merges.

Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Steps 1 to 7 each assume the previous step is merged.

| Step | What | Model | Effort |
|---|---|---|---|
| 0 | Baseline and checks (no code) | Sonnet 5.5 | medium |
| 1 | One vocabulary, new tab names, redirects | Sonnet 5.5 | high |
| 2 | Home: 10-second hero, live proof, Home bugs | Opus 5.5 | high |
| 3 | First-visit tour (5 steps) | Sonnet 5.5 | high |
| 4 | Research: merge tabs, chart guidance lines, recolour, overflow | Opus 5.5 | high |
| 5 | Method: shorten and simplify | Sonnet 5.5 | high |
| 6 | Learn (was Guide): sections, new site guide, About with photo | Sonnet 5.5 | high |
| 7 | Atlas and Studio copy, data-freshness and degradation labels | Sonnet 5.5 | medium |
| 8 | New logo, favicon set, social image | Sonnet 5.5 | medium |
| 9 | Final QA and release check | Sonnet 5.5 | high |
| Review of any PR | Fresh session, read the diff only | Opus 5.5 | medium |

---

## Global rules (every step)

1. Read `docs/REDESIGN.md` (tokens, design spec) and this file before editing. The redesign rules there still hold.
2. Do not change the model, the data layer or result files: `model/`, `data/`, `scripts/`, `results/*.json`, the Worker.
   You may add loader helpers and copy files.
3. No hardcoded result numbers in JSX, CSS or copy. Every figure comes from loaded data or a computed value. Run
   `grep -rnE '\$?[0-9]+\.[0-9]' web/src/pages web/src/components | grep -v test` and justify or remove each new hit.
   Sentences that contain numbers are built from data (template + values), never typed.
4. Never invent facts, sources, experience or results. If copy needs a fact you cannot find in the repo, stop and ask.
5. Copy style: plain words, short sentences, no em dashes, no hype, no emoji. Say what changed, not why (descriptive, not
   causal). Use the vocabulary table in Step 1 exactly.
6. Tab and pill labels are one word, at most two. Never three.
7. Do not add new (i) info icons. Prefer one plain "what to look for" line under a chart title. Where that line makes an
   existing (i) redundant, remove the icon.
8. Accessibility: real buttons and links, visible focus, 4.5:1 text contrast in both themes, 3:1 for chart marks against
   their panel, keyboard path for every map and chart, `prefers-reduced-motion` respected, targets at least 44px.
9. Motion: transform and opacity only, ease `cubic-bezier(.23,1,.32,1)`, UI motion under 300ms, no bounce, no animation on
   keyboard-triggered actions.
10. Old URLs keep working. Every renamed route gets a redirect and a redirect test.
11. Keep `npm test`, `pytest` and the web build passing. Fix, never skip.
12. Before the PR: screenshots with `web/scripts/screenshots.mjs` (desktop and 390px phone, dark and light) of every page
    you touched, saved with the suffix `-v3s<N>`. Attach two before/after pairs to the PR. Report console errors and any
    horizontal overflow.
13. Branch `polish/<N>-<slug>`. Open a PR with `gh`. Do not merge. Stop and report: what changed, what you did not do,
    anything you need from me.

---

## Step 0: baseline and checks (no code)

Model: Sonnet 5.5, medium. Branch: `polish/0-baseline` (docs only).

Do:
- Add this file as `docs/PLAN_V3_POLISH.md`.
- Take a full screenshot baseline (all pages, dark and light, desktop and phone) with suffix `-v3s0`. Do not commit the
  PNGs; list where they are.
- Confirm and report:
  - Header, sub-tab and pill labels on every page, and the route for each.
  - Every on-screen use of these words: Spike share, Top 10, Top-10-day share, Capture, Kept, Capture rate, DA-scheduled,
    Day-ahead schedule, Perfect hindsight, Perfect foresight, $/kW-yr, /kW-year, Realism, Run overview, Overview, Guide.
    File and line for each.
  - Every link to GitHub (source code, README, geocoding log, issues). File and line for each.
  - Every place that still uses the old blue (#2f7ed8 or similar), orange or green chart colours.
  - Which favicon, apple-touch-icon, manifest icon and og-image files exist and which one the browser tab actually uses.
  - Whether `.github/workflows/refresh.yml` still runs monthly, its cron line, and what it refreshes.
  - Which degradation costs, years and durations have precomputed results.
- Write the report into `docs/v3-baseline.md`.

Done when: the report exists and answers every bullet. No UI code changed.

---

## Step 1: one vocabulary, new tab names, redirects

Model: Sonnet 5.5, high. Branch: `polish/1-vocabulary`.

Goal: every idea has one name everywhere, and every tab is one or two words.

1. Create `web/src/copy/terms.ts`, the single source for labels and short definitions. Components import from it; no
   other file spells these labels.

| Idea | Label to use | Short definition (for glossary, tooltips, tour) | Replaces |
|---|---|---|---|
| Upper-bound strategy | Perfect foresight | The best schedule, made knowing every real-time price in advance. No operator can do this. | Perfect hindsight |
| Realistic strategy | Day-ahead plan | Plan the day before on day-ahead prices, then settle at real-time prices. | DA-scheduled, Day-ahead schedule |
| Ratio of the two | Capture rate | Share of perfect-foresight revenue the day-ahead plan keeps. | Capture, Kept, Share kept |
| Concentration | Top-10-day share | Share of the year's revenue earned on its 10 best days. | Spike share, Top 10, Top 10 days |
| Revenue unit | $/kW-yr | Dollars per kW of power capacity per year. Spell out "per kW per year" once per page. | /kW-year, $/kW-year |
| Wear cost | Degradation cost | A cost charged on every MWh discharged, to stand in for battery wear. | Degr. |
| Location types | Hub, Node | Hub: a price average over an area. Node: one point on the grid, usually one plant. | Resource node in labels (keep in prose) |

   Keep the long form of a label in prose where a sentence needs it, but the words must match.

2. Rename navigation. Header tabs: **Home · Atlas · Studio · Research · Learn**.

| Area | Old | New | New route |
|---|---|---|---|
| Header | Guide | Learn | `#/learn` |
| Atlas | All nodes / Detailed locations | All nodes / Study sites | `#/atlas`, `#/atlas/sites` |
| Studio | Your battery / Economics | Your battery / Economics | unchanged |
| Research | Findings | Findings | `#/research` |
| Research | Run overview + Revenue | Revenue (merged in Step 4) | `#/research/revenue` |
| Research | Dispatch | Charging pattern | `#/research/charging` |
| Research | Realism | Reality check | `#/research/reality` |
| Research | Method | Method | `#/research/method` |
| Learn | (sections) | Basics · Site guide · Limits · Glossary · About | `#/learn/basics` etc. |

   In this step, "Run overview" stays reachable but points to Revenue; Step 4 merges the content.

3. Redirects: every old route (including `#/guide`, `#/research/overview`, `#/research/dispatch`,
   `#/research/realism`, `#/atlas/detailed` or whatever the current slugs are) redirects with the query kept and the URL
   rewritten in place. Add tests for each.
4. Update every button and link label that points to a renamed page (for example "Open in Overview" becomes
   "Open in Revenue").
5. Add a test that fails if any old label from the "Replaces" column appears in rendered UI text.

Done when: Step 0's word list returns only the new labels; redirect tests pass; screenshots attached.

---

## Step 2: Home, the 10-second hero and live proof

Model: Opus 5.5, high. Branch: `polish/2-home`.

Goal: within 10 seconds a newcomer knows what Chargeline answers, that prices are live, and what to click.

1. Hero copy (numbers from data, shown here as placeholders):
   - Eyebrow (mono): `Live ERCOT prices · {nodeCount} locations · {firstYear}–{lastYear}`
   - H1: `Where in Texas does a battery earn the most?`
   - Subhead: `Chargeline replays real ERCOT prices through a grid battery at every trading hub and {nodeCount} nodes. In
     {year}, a battery at {topHub} out-earned {compareHub} by {pct}%, and the best node earned {ratio}× its hub.`
     `topHub`, `compareHub`, `pct` and `ratio` are computed. If the West-over-Houston comparison no longer holds, use the
     top and bottom hubs from the data instead.
   - Buttons: `Explore the Atlas` (primary), `Run your own battery` (secondary).
2. Live proof in the hero, under the buttons: a small chip `● Live · Houston ${price}/MWh · {time} CT`, bound to the live
   feed. States: live (mint dot), delayed (amber dot, "Delayed · {age} old"), unavailable (grey dot, "Live prices
   unavailable"). The dot pulses once on each refresh, not continuously; no pulse under reduced motion. The chip links to
   the "Hub prices right now" section.
3. Move the old headline sentence ("West hub batteries would have out-earned Houston...") into the subhead above. Do not
   keep both.
4. Fix money formatting site-wide in the shared formatter: negative values show as `−$1.87` (U+2212 minus before the
   dollar sign), never `$-1.87`. Add unit tests for negative, zero and positive.
5. Hero map label: the floating "RHESS2_ESS1 ... location under review" tag must not cover dots. Show node details in the
   control-bar chip instead, or place the tag on the side with more empty space. Check at 1280, 1440 and 390px.
6. Live section: if the feed returns errors, show one plain line ("Some prices could not be updated. Showing the last
   good values from {time}.") and put raw ERCOT error text behind a `Details` toggle. Make price up and down colours the
   same in the ticker and the tiles (up mint, down amber or the token the ticker uses; one rule).
7. Each Home chart gets one "what to look for" line (example for the gap bars: "The amber bar is what a real schedule
   keeps. The gap is the cost of not knowing prices in advance.").
8. Keep the rest of Home: key numbers, "What a schedule keeps", hub table, "Four ways in" (rename the fourth card to
   Learn).

Done when: a screenshot at 1440px shows the H1, subhead, buttons and live chip above the fold; tests cover the hero
sentence against loaded data and the formatter; no number is typed in JSX.

---

## Step 3: first-visit tour (5 steps)

Model: Sonnet 5.5, high. Branch: `polish/3-tour`.

Build with Mantine Popover (or a small own component). Do not add a tour library unless Mantine cannot do it; if you add
one, it must be MIT and under 10 kB gzipped, and say why.

Copy (exact):

| # | Anchored to | Title | Body |
|---|---|---|---|
| 1 | Home hero | Welcome to Chargeline | Chargeline replays real ERCOT prices through a battery to show where in Texas it earns the most. Prices in the top bar are live. |
| 2 | Atlas tab | Atlas | Every hub and node on one map. Click any dot to see what a battery there would have earned. |
| 3 | Studio tab | Studio | Run your own battery. Pick a place, size and year; anything new solves in your browser. |
| 4 | Research tab | Research | What the replay found, how far a real schedule falls short, and how the model works. |
| 5 | Learn tab | Learn | New to ERCOT? Start here. You will also find the glossary and who built this. |

Behaviour:
- Opens once, only on Home, only when the URL has no query string (never on a shared deep link). Remember "seen" in
  localStorage inside try/catch; if storage fails, do not show the tour again in this session.
- Controls: `Skip tour` (text button), `Back`, `Next`, and on the last step `Done`. Step counter "2 of 5". Esc closes.
- A "Take the tour" link in the footer and in Learn › Site guide replays it.
- Focus moves into the popover on open and returns to the element that had it on close. Popover has `role="dialog"`,
  a label, and is not a focus trap beyond itself (non-modal). No dim scrim over the page; a soft outline highlights the
  anchor.
- Motion: grows from its anchor (transform-origin at the anchor), 200ms, opacity plus scale from 0.96. Under reduced
  motion, opacity only. On phones (under 640px) the popover docks to the bottom of the screen and points to nothing.
- Tests: shows on first Home visit, not on deep links, not after Skip, keyboard path works, Esc closes.

Done when: screenshots of steps 1 and 3 on desktop and phone, both themes, are in the PR.

---

## Step 4: Research, merge, guide lines, recolour, overflow

Model: Opus 5.5, high. Branch: `polish/4-research`.

1. Merge Run overview into Revenue. Revenue order: KPI row, energy and ancillary chart, monthly revenue, cumulative
   revenue, daily revenue, ten best days, then the "Context" block. Remove duplicates; Charging pattern keeps the heatmap
   and typical day; the 1h vs 2h vs 4h chart moves to Revenue below monthly revenue. `#/research/overview` redirects to
   Revenue.
2. Every chart gets one "what to look for" line under its subtitle, at most 18 words, from what the chart shows. Examples:
   - Monthly revenue: "Taller bars are months that paid more. Spring and late summer usually lead."
     (only if the loaded data shows that; otherwise describe the top month from data).
   - Cumulative revenue: "Steep steps are the best days. Flat stretches earned little."
   - Charging pattern heatmap: "Mint cells charge, amber cells discharge. Read across a row for one month's day."
   - Reality check bars: "Amber is the day-ahead plan, mint is perfect foresight. The gap is the price of not knowing."
   Text describing a direction or season must come from data or be phrased so it is always true.
3. Recolour every remaining chart to tokens via `web/src/theme/chartColors.ts` (reads CSS variables; no hex in chart
   components). Mapping (this matches what the site already uses on Home, Findings and Studio):
   - Perfect foresight: mint. Day-ahead plan: amber.
   - Charging: mint. Discharging: amber. Heatmap: diverging mint, through the panel colour, to amber.
   - Real-time price line: text colour (bone). Day-ahead price line: amber, dashed. Other hubs: grey `--line2`, thin.
   - Before and after RTC+B: before grey, after amber.
   - Years: grey steps for earlier years, amber for the selected or latest year.
   - Durations: grey for unselected, amber for the selected duration.
   - Energy and ancillary stack: energy amber; regulation up and down mint at two lightness steps; RRS, ECRS and Non-Spin
     grey at three lightness steps. Direct labels where space allows.
   - Battery fleet line (context chart): text colour; revenue bars amber.
   - Studio "Inside this run", Atlas Study sites map and sparkline, Economics tornado (NPV rises mint, NPV falls amber):
     same tokens.
   Add a test that fails if a hex colour or the old blue, orange or green appears in chart components.
4. Legends show only the series that are on screen (the "Energy only" view must not list six series).
5. Reality check tables: no clipping at 1280px or 1440px. Fewer columns at narrow widths, or an `overflow-x: auto` box
   with a visible scroll hint. Same for any other wide table.
6. Reality check page H1 stays data-bound. Keep the "How to read this page" block but cut it to four bullets.

Done when: no old chart colours remain (test), Run overview content lives only in Revenue, tables do not clip, screenshots
attached for Revenue, Charging pattern and Reality check in both themes.

---

## Step 5: Method, shorter and simpler

Model: Sonnet 5.5, high. Branch: `polish/5-method`.

Goal: a reader understands the method in about three minutes. Keep every fact that is true; move detail, do not delete
it.

New structure, in this order:
1. **What the model does** (3 sentences): one battery, one day at a time, a linear program picks charge and discharge for
   each 15-minute interval to maximise revenue, starting and ending each day empty.
2. **Assumptions** as a table with one short line each: prices, optimizer, daily boundary, efficiency, degradation cost,
   size, partial years. Values come from config or result metadata, not typed.
3. **Two strategies**: perfect foresight (upper bound) and day-ahead plan (realistic), 2 sentences each.
4. **What it leaves out** (5 bullets max): forecast error beyond the day-ahead plan, ancillary services in the base
   results (see Findings 10), transmission and interconnection costs, capacity fade, market impact (price taker).
5. **Checked against real fleet revenue**: keep the benchmark table and the three Modo Energy source links.
6. **Locations and data**: 3 sentences and a link to Atlas › Study sites.
7. **Technical notes**: one closed `<details>` element holding the current long material: energy plus ancillary method,
   reserve backing table, NPRR references, RTC+B handling, MILP fallback, custom-run parity. Lightly edit for clarity
   only.

Also:
- Remove every link to the GitHub README or repo files. If a linked file matters to readers (for example the geocoding
  log), serve it from `web/public/` as a download, or remove the link.
- Target: the part above Technical notes is under 650 words.

Done when: word count reported, no GitHub links remain on the page, tests pass.

---

## Step 6: Learn (was Guide), site guide and About

Model: Sonnet 5.5, high. Branch: `polish/6-learn`.

Before starting: the files `web/public/images/aashish-yadav.webp` and `web/public/images/aashish-yadav.jpg` must exist
(I add them). If they are missing, stop and ask.

Learn has sub-pills: **Basics · Site guide · Limits · Glossary · About**, same pill style as Research.

1. **Basics**: keep "ERCOT in 2 minutes" and "How a battery makes money" as they are, with only the Step 1 vocabulary
   applied.
2. **Site guide** (replaces "How to read this site"): one card per page, Home, Atlas, Studio, Research, each with a
   current screenshot (generated from the screenshot script, light theme, cropped to the top of the page, WebP, under
   80 kB each), one line on what the page answers and a link. Under it, a short list of the Research and Atlas sub-tabs
   with one line each. Add a "Take the tour" button.
3. **Limits** (was "What the model leaves out"): same five points as Method's "What it leaves out", written for a
   newcomer, plus one line on perfect foresight being an upper bound. Link to Method for detail.
4. **Glossary**: keep. Definitions come from `terms.ts` for the Step 1 terms; keep the other entries, re-sorted A to Z.
5. **About**: photo (rounded 20px, 160px, `alt="Aashish Yadav"`, `loading="lazy"`, WebP with JPEG fallback) beside this
   exact text:

   > **Aashish Yadav** is a final-year graduate student at Duke University studying energy economics and policy. His
   > work and coursework focus on getting power onto the grid faster: utilities, independent power producers, project
   > development and the grid itself.
   >
   > Chargeline is an experiment he built for fun over Halloween 2026. It is an independent project, not affiliated with
   > ERCOT or any company. Suggestions are welcome.

   Links under it: `LinkedIn` (reuse the LinkedIn URL already in the footer), `aashish.yadav@duke.edu` (mailto).
6. Remove "Source code on GitHub" and every other GitHub link site-wide (footer, Method, Learn, Atlas notes).
7. "Report an issue" everywhere becomes a mailto: `mailto:aashish.yadav@duke.edu?subject=Chargeline%20feedback`.
8. Footer: add "About the author" linking to `#/learn/about`.

Done when: no `github.com` link renders anywhere (test that scans rendered links), About shows the photo in both themes,
Site guide screenshots match the current UI.

---

## Step 7: Atlas and Studio copy, freshness and degradation labels

Model: Sonnet 5.5, medium. Branch: `polish/7-atlas-studio`.

1. Atlas › Study sites headline (data-bound): `Same battery, {ratio}× the revenue. Location decides.` Subhead: one
   sentence naming the top node and its hub with both values. Remove the current long headline.
2. Atlas › All nodes: keep "Every node, one map." Add one "what to look for" line under the map.
3. Economics: add one sentence under the KPI row, built from the computed result, for example when NPV is negative:
   "At these inputs, energy arbitrage alone does not pay back the battery. Try a lower installed cost or add a tax
   credit." When positive, a neutral equivalent. Recolour the tornado per Step 4.
4. Year selector helper text wherever the partial year can be picked: `{year} = {startDate} to {endDate}, scaled to a full
   year. Updated monthly.` Dates come from result metadata.
5. Degradation selector helper text (Research, Atlas, Studio presets): `Precomputed at $0 and $10/MWh. Any other cost:
   set it in Studio.` In Studio itself, the degradation input accepts any value and says when a run is solved in the
   browser rather than loaded.
6. Footer data line stays, using the same metadata.

Done when: the three helper texts render from metadata (tests), headline shortened, screenshots attached.

---

## Step 8: new logo, favicon set, social image

Model: Sonnet 5.5, medium. Branch: `polish/8-logo`.

Before starting: I will tell you which mark I picked (A, B, C or D, SVGs in the appendix). If I have not, stop and ask.

1. Header logo: replace the ring-and-dot mark with the chosen mark at 28px beside the "Chargeline" wordmark. Same mark in
   both themes (the tile is graphite in both).
2. Icon set in `web/public/`: `favicon.svg` (the mark), `favicon.ico` (16, 32, 48), `apple-touch-icon.png` (180),
   `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (mark inside the safe zone), and update
   `manifest.webmanifest`. Remove the old battery icons and any reference to them.
3. Add `?v=3` to the icon links in `index.html` so browsers drop the cached battery icon.
4. Social image: new `og-image.png` (1200×630): graphite background, mark, "Chargeline", and the H1 question
   "Where in Texas does a battery earn the most?". Update `og:title`, `og:description`, `twitter:*`. Description:
   "Real ERCOT prices replayed through a battery at every hub and node. See where it earns the most."
5. Test that `index.html` references only files that exist.

Done when: the browser tab shows the new mark after a hard reload; screenshots of the header in both themes and of the
og-image are in the PR.

---

## Step 9: final QA and release check

Model: Sonnet 5.5, high. Branch: `polish/9-qa`.

1. Accessibility pass on all pages, both themes: keyboard walkthrough (tour, tabs, pills, maps' list alternatives,
   selects, toggles, ticker pause), screen-reader names for every control and chart, contrast of amber and mint text in
   light mode, focus never hidden under the sticky header (`scroll-margin-top`), 200% zoom, 320px and 390px widths.
2. Motion pass: every animation has a purpose, uses transform or opacity, under 300ms for UI, off or opacity-only under
   reduced motion; the tour and the live chip pulse obey it.
3. Copy pass: run the Step 1 old-label test and a search for em dashes and "perfect hindsight"; fix any hit.
4. Link pass: no github.com links, all internal links resolve, mailto links correct, old routes redirect.
5. Full screenshot set with suffix `-v3s9`, and a short before/after contact sheet (Step 0 vs now) for Home, Atlas,
   Research › Revenue, Learn › About.
6. After I merge: confirm the deploy, the live feed, and that the monthly refresh workflow still passes.

Done when: a QA report in the PR lists every check with pass or fix.

---

## Backlog (not now)

- Precompute $5 and $20/MWh degradation for the five hubs (all years, all durations) so Research can offer four costs.
- Hosting off GitHub Pages if the repo later goes private (Cloudflare Pages is the likely choice; the Worker already
  runs there).
- Home marker 3 placement once RHESS2_ESS1's location is confirmed.

---

## Appendix: logo marks (SVG, 64×64 viewBox)

All four use a graphite tile `#171A1D`, mint `#5FD6A4` for charging and amber `#F2A93B` for discharging. At 16px, raise
stroke widths by one unit (shown in the design canvas).

A. Day cycle
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#171A1D"/><path d="M11 41 H22 V23 H32" fill="none" stroke="#5FD6A4" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 23 H42 V41 H53" fill="none" stroke="#F2A93B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

B. C-line
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#171A1D"/><path d="M41 20.1 A15.5 15.5 0 1 0 31 47.5 H47" fill="none" stroke="#F2A93B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="47.5" r="4" fill="#5FD6A4"/></svg>
```

C. Spread
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#171A1D"/><path d="M12 43 H23 L39 21 H52" fill="none" stroke="#F2A93B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="43" r="4.5" fill="#5FD6A4"/></svg>
```

D. Price cell
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#171A1D"/><rect x="9" y="19" width="41" height="26" rx="6" fill="none" stroke="#E8E6E1" stroke-width="3.5"/><rect x="52" y="27" width="4" height="10" rx="1.5" fill="#E8E6E1"/><path d="M15 37 L21 33 L26 36 L32 25 L37 32 L44 29" fill="none" stroke="#F2A93B" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
```
