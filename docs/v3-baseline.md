# Chargeline v3 baseline (Step 0)

Taken from `origin/main` at `b888756` (merge of PR 24), 2026-11-02. Nothing in the UI was changed. Line numbers are for
that commit and will drift as the later steps land.

## 1. Screenshot baseline

Suffix `-v3s0`, from `web/scripts/screenshots.mjs` against a production build, in Edge. Not committed. They are in
`web/screenshots/` (git status shows them as untracked) and follow `<page>-<desktop|phone>-<light|dark>-v3s0.png`.

78 files: 14 pages plus data-quality, compare-node, map-node, finding-8 and custom-solved, at 1440px and 390px, light and
dark, plus the expanded heatmap on desktop. Console errors: none. Horizontal overflow: none. The pages are `home`,
`research`, `start` (the Guide), `map` (the Atlas), `detailed`, `live`, `overview`, `revenue`, `dispatch`, `compare`,
`realism`, `economics`, `custom`, `method`; the script's names have not changed with the redesign, so Step 1's shots pair
up with these by name.

## 2. Navigation labels and routes

Source: `web/src/shell/route.ts:37-59` (`TABS`), rendered by `components/shell/Header.tsx` (tabs) and
`components/shell/ViewBar.tsx` (sub-tabs).

| Header tab | Sub-tab (label) | Route | Page file |
|---|---|---|---|
| Home | Overview | `#/home` | `pages/Home.tsx` |
| Home | Today in ERCOT | `#/home/live` | `pages/Live.tsx` |
| Atlas | All nodes | `#/atlas` | `pages/Atlas.tsx` |
| Atlas | Detailed locations | `#/atlas/detailed` | `pages/Map.tsx` |
| Studio | Your battery | `#/studio` | `pages/Studio.tsx` |
| Studio | Economics | `#/studio/economics` | `pages/Economics.tsx` |
| Research | Findings | `#/research` | `pages/Research.tsx` |
| Research | Run overview | `#/research/overview` | `pages/Overview.tsx` |
| Research | Revenue | `#/research/revenue` | `pages/Revenue.tsx` |
| Research | Dispatch | `#/research/dispatch` | `pages/Dispatch.tsx` |
| Research | Realism | `#/research/realism` | `pages/Realism.tsx` |
| Research | Method | `#/research/method` | `pages/Method.tsx` |
| Guide | (none; one page) | `#/guide` | `pages/Guide.tsx` |

Guide has no sub-tabs. Its sections are in-page: ERCOT in 2 minutes, How a battery makes money, How to read this site,
What this model leaves out, Glossary, About this project (`pages/Guide.tsx:248-289`). `?s=about` opens the last one.

Pills and toggles (not routes):

| Where | Labels | Source |
|---|---|---|
| Home map and Atlas map metric | Revenue, Capture, Spike share | `data/home.ts:14-16` |
| Atlas zone filter | All, then load-zone short names | `pages/Atlas.tsx:92` |
| Research findings topic filter | All, Where it pays, How it is run, How it changed, Context | `data/research.ts:207-211`, `pages/Research.tsx:166-168` |
| Studio year, duration, degradation, strategy | 2024/2025/2026; 1/2/4 hours; $0/MWh, $10/MWh; Perfect foresight, Day-ahead | `pages/Studio.tsx:269-316, 508` |
| Revenue stack (Revenue, Run overview, Realism) | Energy only, Energy + AS | `components/Ancillary.tsx:62-63` |
| Realism monthly chart | Perfect foresight, DA-scheduled | `components/realism.tsx:285-288` |
| Economics revenue source | Perfect foresight, DA-scheduled | `pages/Economics.tsx:175-178` |
| Today in ERCOT duration | 1 h, 2 h, 4 h | `pages/Live.tsx:330` |
| Header selector (all run pages) | Degr. $0/MWh, Degr. $10/MWh | `components/Selectors.tsx:42` |

Redirects today (`route.ts:9-30`): `#/map` to Atlas, `#/custom` and `#/compare` to Studio, `#/start` and `#/about` to Guide
(`?s=about`), and the bare old names (`#/overview`, `#/revenue`, `#/dispatch`, `#/realism`, `#/economics`, `#/method`,
`#/live`) to their tab. `#/studio/custom`, `#/studio/compare`, `#/guide/start`, `#/guide/about` also redirect.

## 3. Words in the Step 1 vocabulary table, on screen today

`web/src`, tests excluded. Hits in code comments are marked (comment) and do not render. Result and data files are listed
last.

### Spike share
- `data/home.ts:16` metric label, used by Home metric pills (`pages/Home.tsx:146`) and Atlas pills (`pages/Atlas.tsx:87`)

### Top 10 / Top 10 days / Top-10 days / Top-10 share
- `pages/Atlas.tsx:139` stat "Top 10 days"; `:292` table column "Top 10"
- `components/map/MapPanel.tsx:116` stat "Top 10"
- `pages/Home.tsx:173` "Top 10 placed nodes by ..." (this is a count of nodes, not the concentration measure)
- `pages/Studio.tsx:572` stat "Top 10 days"; `:615` table column "Top 10 days"
- `components/cards.tsx:219,235,266,275` chart legend and series "Top-10 days"; `:401` column "Top-10 share"; `:605` column "Top-10 share"
- Already the target label "Top-10-day share": `pages/Overview.tsx:32`, `data/glossary.json:57`

### Capture / Capture rate / Kept
- "Capture": `data/home.ts:15` (metric pill), `pages/Atlas.tsx:138,291`, `components/map/MapPanel.tsx:115`, `pages/Map.tsx:115`, `components/realism.tsx:135,375`
- "Capture rate" (target label): `components/realism.tsx:67,68,119,298`, `data/glossary.json:9`, `pages/Realism.tsx:53`, `data/research.ts:163`, `pages/Research.tsx:155`
- "Kept": `pages/Home.tsx:319` column, `:338` note; `pages/Studio.tsx:488` note, `:615` column; `pages/Home.tsx:220` "A real schedule keeps ... of perfect hindsight"
- "Share kept": not found as a label

### DA-scheduled / Day-ahead schedule / Day-ahead scheduled / DA-sched.
- "DA-scheduled": `components/realism.tsx:55,64,68,120,135,187,193,200,212,241,287,297,335,345,374`, `pages/Economics.tsx:177`, `pages/Realism.tsx:48,53`, `data/glossary.json:42`
- "Day-ahead schedule": `pages/Home.tsx:276,279`, `pages/Studio.tsx:479,486`
- "Day-ahead scheduled": `pages/Atlas.tsx:137`
- "DA-sched.": `pages/Atlas.tsx:290`
- (comment) `custom/runner.ts:4,50`
- Target "Day-ahead plan": not used anywhere yet. Studio uses "Day-ahead" alone (`pages/Studio.tsx:508`, `:614`).

### Perfect hindsight
- `pages/Home.tsx:220,279`, `pages/Live.tsx:182`
- (comment) `data/home.ts:29`; `pages/Home.tsx:209` says "with hindsight" in prose
- `pages/Home.test.tsx:57` asserts the old sentence

### Perfect foresight
Target label, used everywhere (`pages/Home.tsx`, `pages/Studio.tsx`, `components/realism.tsx`, `pages/Economics.tsx`, `pages/Method.tsx:36,75`, `data/glossary.json:5`, `data/start.ts:79`). Shown as "Perfect-foresight revenue" in `data/home.ts:14`.

### $/kW-yr and /kW-year
- "$/kW-yr" (target): `pages/Atlas.tsx:243,288`, `pages/Map.tsx:114`, `components/map/MapPanel.tsx:114`, `components/map/MapLegend.tsx:16`, `components/cards.tsx:372,374,401,571,605`, `components/realism.tsx:55,59,63,156`, `pages/Overview.tsx:25`, `pages/Economics.tsx:61,168,170`, `data/economics.ts:218,219`, `data/hero.ts:65,84,86`, `data/glossary.json:13,66,73,130`, `data/data-notes.json:5`
- "$/kW-year" or "/kW-year" (old): `pages/Atlas.tsx:20,73,240`, `pages/Home.tsx:142,274,277,292,315`, `pages/Studio.tsx:419,485,486,544`, `data/home.ts:14`
- "$/kW-yr" is mixed with "$/kW-year" on the same page on Atlas and Home. "per kW per year" is spelled out nowhere as a one-time definition on a page.

### Degr.
- `components/Selectors.tsx:42` ("Degr. $0/MWh", "Degr. $10/MWh")
- `pages/Studio.tsx:316` and the copy near it say "degradation" in full

### Realism
- Label: `shell/route.ts:54`, `pages/Realism.tsx:30` (page title), `components/Icons.tsx:10` (icon name, not rendered)
- In prose: `pages/Method.tsx:43,50,124`, `pages/Live.tsx:234`, `data/start.ts:54,57,58,80`, `data/start.ts` card title

### Run overview / Overview
- `shell/route.ts:51` ("Run overview"), `:38` (Home sub-tab "Overview")
- Page title `pages/Overview.tsx:109`
- `pages/Research.tsx:263` link "Run overview"
- In prose and buttons: `components/map/MapPanel.tsx:151` ("Open in Overview"), `components/StartBanner.tsx:24,44`, `pages/Method.tsx:62`, `data/start.ts:26,29,30`
- (internal) `pages/Research.tsx:129` component named Overview, not rendered

### Guide
- Header tab `shell/route.ts:58`, page title `pages/Guide.tsx:223`
- `pages/Home.tsx:246` ("Guide", "Start with Guide"), `components/StartBanner.tsx:44` ("Open the Guide")
- `pages/Guide.tsx` comments and component names

### Resource node (labels)
- Chart and legend series: `components/map/TexasMap.tsx:133`, `components/map/MapLegend.tsx:46` ("Resource node (plant)")
- Badges and table cells: `components/map/MapPanel.tsx:96`, `pages/Map.tsx:128`
- Selector group: `components/Selectors.tsx:20`, `pages/Studio.tsx:263`, `pages/Live.tsx:324` ("Resource nodes")
- Location names: `data/site.ts:26` (`locFull`, used in many labels)
- The rest are prose, which the plan says to keep: `pages/Atlas.tsx:76,99,331`, `pages/Home.tsx:137,243`, `pages/Guide.tsx:75-82`

### Result and data files read by the UI
- `results/FINDINGS.md` is copied to `web/public/data/findings.md` and rendered on `#/research`. It uses "DA-scheduled" and "capture rate" in running text; check it in Step 1 (the plan says not to touch `results/*.json`, but `FINDINGS.md` is prose).
- `web/src/data/glossary.json` holds the glossary text for every term above; Step 1 moves the shared terms to `copy/terms.ts`.

## 4. Links to GitHub

All resolve through `SITE` in `web/src/data/site.ts:6-15` (`repo`, `issues`, `featureRequest`) unless noted.

| Link text | File and line | Target |
|---|---|---|
| Source code on GitHub | `pages/Guide.tsx:124` | repo |
| LICENSE file | `pages/Guide.tsx:148` | `blob/main/LICENSE` |
| Suggest a feature | `pages/Guide.tsx:159` | `issues/new?template=feature_request.yml` |
| Report a problem | `pages/Guide.tsx:160` | issues |
| Report an issue | `components/shell/Footer.tsx:28` | issues |
| Report an issue | `components/SiteFooter.tsx:13` | issues (nothing imports this file; dead code with the same links) |
| How nodes are located | `pages/Atlas.tsx:276` | `blob/main/results/geocoding_log_all_nodes.md` |
| geocoding log | `pages/Map.tsx:146` | `blob/main/results/geocoding_log.md` |
| README | `pages/Method.tsx:135` | `repo#context-layers-phase-17` |
| (Markdown links in findings) | `components/Markdown.tsx:11` | `blob/main/<path>` for any relative `docs/` or `results/` link in `FINDINGS.md`; rendered on `#/research` |
| Ancillary method | `pages/Research.test.tsx:145` (test) asserts `blob/main/docs/ANCILLARY_METHOD.md` | |

Also github.io (not a link on screen, but the site's address): `web/index.html:10,16,17,25` (canonical, `og:url`,
`og:image`, `twitter:image`) and `web/src/live/live.test.ts:41`.

`SITE.issues` and `SITE.featureRequest` point to the issue tracker; "Report an issue" has no mailto fallback today.

## 5. Old chart colours

The token palette (amber and mint) is used on Home, Findings and Studio. These still draw the old blue, orange, green or
violet set.

| Where | What |
|---|---|
| `web/src/theme.ts:170-181` | `chartColors`: `series` = blue `#2a78d6` / orange `#eb6834` / green `#1baf7a` / violet `#6250d6` (light), `#3987e5` / `#d95926` / `#199e70` / `#9085e9` (dark); `charge` = the blue, `discharge` = the orange; `baseline` grey. The comment at `theme.ts:13,164` says this is deliberate until the charts are redone |
| `components/map/scale.ts:19-25` | blue sequential ramp for the Detailed locations and queue maps; `:54-57` purple ramp for the queue layer; `NO_DATA` grey |
| `components/Ancillary.tsx:72` | six hard-coded colours `#3182ce #2f9e7a #79b86a #9566bb #d79740 #bd6173` for the energy and ancillary stack |
| `components/cards.tsx:128-129` | solar `#f2c200`, wind `#1f2937` / `#e5e7eb` |
| `components/map/TexasMap.tsx:120` | land fill and border (`#eeede9 #242423 #d9d8d2 #3a3a37`), neutral |

Consumers of `t.series`, `t.charge`, `t.discharge`: `components/cards.tsx` (hourly heatmap `:120`, monthly `:59`, cumulative
`:234-235`, daily `:274-275`, duration bars `:340,378`, node vs hub `:481,581`), `components/realism.tsx:105,200,256,345`,
`components/ContextSection.tsx:54-55`, `components/map/MapPanel.tsx:42`, `components/start/Walkthrough.tsx:44,102-112`,
`components/start/Diagrams.tsx:18` (names them blue, orange, green, violet), `pages/Economics.tsx:96,98` (tornado),
`pages/Live.tsx:93-94,139-140`.

Colour names in copy that will be wrong after the recolour (Step 4): `components/cards.tsx:96,148,196,249,282,596`,
`components/start/Walkthrough.tsx:201`, `data/start.ts:44`.

Mantine colour props: `pages/Guide.tsx:271` (orange, teal badges), `components/map/MapPanel.tsx:129` (green badge),
`pages/Live.tsx:55` (green, yellow, gray badges), red `Alert`s in several pages. The theme remaps orange and green to
amber and mint text (`theme.ts:151-153`).

Price direction on Home and the ticker uses green up and red down (`styles/tokens.css:40`, `components/live/HubTiles.tsx:20`).

## 6. Favicon, touch icon, manifest and og-image

| Item | State |
|---|---|
| Favicon actually used by the tab | An inline `data:image/svg+xml` battery outline in amber, set by `<link rel="icon">` at `web/index.html:7`. No file |
| `favicon.svg`, `favicon.ico` | Do not exist. `/favicon.ico` returns 404 on GitHub Pages |
| `apple-touch-icon` | Does not exist; no `<link>` |
| Web manifest and manifest icons | No `manifest.webmanifest`, no `<link rel="manifest">`, no 192 or 512 icons |
| `og-image.png` | Exists at `web/public/og-image.png` (1200x630 PNG, 128 KB, from 2026-11-01). Built by `web/scripts/make-og-image.mjs` from the old Overview screenshot. Referenced by `og:image` and `twitter:image` (`index.html:17,25`) with an absolute github.io URL |
| `og:image:alt` | Still describes "the Overview page ... Top-10-day share" (`index.html:21`) |
| `theme-color` | Set for light (`#F2F1ED`) and dark (`#0F1113`) |
| Header logo | Inline SVG ring and dot in `components/shell/Header.tsx:6-12` |
| `web/public/images/` | `aashish-yadav.webp` and `.jpg` are present (untracked); Step 6 needs them |

## 7. Refresh workflow

`.github/workflows/refresh.yml` is active (`gh workflow list`). It has never run: `gh run list --workflow=refresh.yml`
returns nothing, and PR 24 said the same.

- Cron: `17 6 3 * *`, 06:17 UTC on the 3rd of each month. Also `workflow_dispatch`. The next scheduled run is 2026-12-03.
- It refreshes only the current UTC year, for the 10 detailed locations (5 hubs plus the nodes listed in
  `results/node_selection.json`): `scripts.run_grid --years $YEAR`, then `scripts.rtcb`, then `scripts.export_prices
  --years $YEAR`. It opens a PR on branch `automation/refresh-results`, adding `results/`. It does not merge.
- It does not refresh the all-node file (`results/nodes_*_2h.json`; a yearly local job) and does not touch live prices
  (the Worker does that).
- Needs the secrets `ERCOT_API_USERNAME`, `ERCOT_API_PASSWORD`, `ERCOT_API_SUBSCRIPTION_KEY`. Timeout 60 minutes.
- Note for Step 7: the in-year files for 2026 are the ones that get a "scaled to a full year" label.

## 8. What has precomputed results

Counted from `results/`.

| Axis | Values |
|---|---|
| Detailed locations | 10: HB_HOUSTON, HB_NORTH, HB_PAN, HB_SOUTH, HB_WEST (hubs); ANSON1_ALL, CAMWIND_RN, RHESS2_ESS1, RUSSEKST_RN, WIPOPA_3_4 (nodes) |
| Years | 2024, 2025, 2026 (year to date) |
| Durations | 1, 2, 4 hours |
| Degradation cost | $0 and $10/MWh only |
| Efficiency | 0.85 round trip (in the file names) |
| Files | 180 base runs `<LOC>_<YEAR>_<N>h_0.85_<DEG>.json` (10 x 3 x 3 x 2) and 180 energy-plus-ancillary runs `as_<LOC>_...` |
| Extra | `ancillary.json`, `ancillary_share_0.5.json` (one reserve-backing variant, HB_HOUSTON), `rtcb.json`, `walkthrough.json`, `context.json`, `node_selection.json`, `locations.json`, `node_locations.json` |
| All nodes | `nodes_2024_2h.json`, `nodes_2025_2h.json`: 2-hour, 2024 and 2025 only, all nodes with complete data (the 2025 file has 642) |
| In-browser price files | `results/prices/*.ebp`: 31 files for the custom run |

So $5 and $20/MWh degradation exist only as in-browser solves in Studio (backlog item).

## 9. Things Step 1 will need a decision on

1. **Home sub-tab "Overview"** is not in the plan's rename table. Plan: leave it, since "Overview" is only wrong for
   "Run overview" and "Open in Overview". Say so if you want it renamed.
2. **"Run overview" in Step 1**: the plan says it "stays reachable but points to Revenue". Plan: keep the sub-tab, route and
   page until Step 4, and change every link that points at it to point at Revenue.
3. **Learn sub-routes** (`#/learn/basics` and the others) are listed in the Step 1 table but the sections are built in
   Step 6. Plan: Step 1 renames the tab and route to `#/learn` and redirects `#/guide`, `#/guide/start`, `#/guide/about`,
   `#/start`, `#/about`; the section sub-routes wait for Step 6.
4. **`results/FINDINGS.md` prose** uses "DA-scheduled" and "capture rate", and it renders on `#/research`. The plan bans
   changes to `results/*.json` but not to `FINDINGS.md`. Plan: update the old labels in `FINDINGS.md`.
