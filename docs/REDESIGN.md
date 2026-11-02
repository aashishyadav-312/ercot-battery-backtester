# Chargeline redesign: Claude Code handoff

Paste this file's "Ground rules" and "Design spec" once at the start of the Claude Code session (or commit it as
`docs/REDESIGN.md` and tell Claude Code to read it). Then paste ONE step prompt at a time. One branch and one PR per step.
Claude Code never merges; you review and merge, because merging redeploys the public site.

Design source: the "ERCOT Storage App: Home Directions" canvas on claude.ai. In that canvas use Share > Export to save PNGs
of Chargeline Home (dark and light), Atlas, Studio and Research into `docs/design/` in the repo before Step 1. The committed
copies are 1440px wide WebP files (`home-dark.webp`, `home-light.webp`, `atlas-dark.webp`, `studio-dark.webp`,
`research-dark.webp`, about 1 MB in total); they are what a fresh checkout or worktree has. Wherever this document says
`docs/design/*.png`, read `docs/design/*.webp`.

---

## What is real and what is a placeholder in the design

The canvas is a design. Numbers marked REAL were copied from `results/` and `FINDINGS.md`; the build must not copy them,
it must load them. PLACEHOLDER items must be replaced by real sources, not left in.

| Item in the design | Status | In the build |
|---|---|---|
| $48.7 West, $39.7 Houston, 61% capture, $24.2, 4.5x, 642 | REAL values | Load from results JSON (map below). Never typed into JSX. |
| Headline "out-earned Houston by 23%" | REAL, derived | Compute (West / Houston - 1) from the loaded hub results. |
| 1h / 2h / 4h bars, hub table, month bars | REAL | Load from the per-run results files. |
| Atlas: 296 plotted nodes, buckets, percentiles, top 12 | REAL | Load from `results/nodes_2025_2h.json`, compute buckets and percentiles in code. |
| Studio: 60 precomputed runs | REAL | Load from the existing `results/<LOC>_<YEAR>_<N>h_0.85_<DEG>.json` files. |
| Research: finding numbers, three charts | REAL | Bind to `results/ancillary.json`, `rtcb.json`, hub results; findings text from FINDINGS.md. |
| **Top ticker values (marked SAMPLE)** | PLACEHOLDER | Live feed from the Phase 16 Cloudflare Worker. If the feed is down, show cached values with "last updated" and a stale flag, or "Live prices unavailable". Never show invented numbers. |
| **Unnumbered dot positions on the Home map** | PLACEHOLDER | Real lat/lon from `nodes_2025_2h.json` (projection below). |
| **Home marker positions 1-3** | PLACEHOLDER | Hubs have no coordinates: place the West and Houston hub markers at documented schematic points and say "hub, schematic" in the tooltip. Marker 3 = the rank-1 node at its real geocode. |
| Studio: efficiency, dates, start charge locked | Design only | Not locked in the build: the existing custom-run solver (highs-js, Web Worker) handles any input. Precomputed presets show instantly; off-preset inputs run in the browser. |

Known data caveats the UI must keep visible:
- Only 296 of 642 nodes have coordinates. The rest are counted and listed, never silently dropped.
- RHESS2_ESS1 (rank 1) is geocoded `manual_review`. Label it "location under review".
- Hub revenue differs by source: detailed hub runs (archive-corrected: $48.7 West, $39.7 Houston) vs bulk all-node files
  ($49.1, $40.1). Pick one source per comparison and say which. The design uses the detailed runs for hubs and the bulk
  hub figures for node-vs-hub ratios (so 4.46x displays as 4.5x).
- Claims stay descriptive, not causal (RTC+B: "what changed, not why").

---

## Ground rules (paste first)

```
You are redesigning the UI of this repo (ERCOT Battery Backtester). Read README.md, results/FINDINGS.md, docs/REDESIGN.md
(this document) and look at docs/design/*.png before touching code.

Hard rules:
1. Do not change the data layer or the model: results/*.json, model/*.py, data/*.py, scripts/*.py, web/src/data/* loaders'
   output shapes. You may ADD new loader helpers and new files; never rename or reshape existing fields.
2. No hardcoded result numbers in JSX or CSS. Every figure on screen comes from a loaded results file or a computed value.
   The only literals allowed are labels, units and copy. After each step run:
   grep -rnE '\$?[0-9]+\.[0-9]' web/src/pages web/src/components | grep -v test
   and justify every hit (axis ticks, CSS, copy) or remove it.
3. Add tests that assert on-screen key numbers equal the loaded data (e.g. Home headline percentage equals
   hubs.HB_WEST / hubs.HB_HOUSTON - 1 from the results files).
4. Keep pytest, npm test and the web build passing. Fix, never skip.
5. One branch per step: codex-style names like design/01-tokens-shell. Open a PR with gh. Do NOT merge.
6. Old URLs must keep working: keep every old hash route as a redirect to its new home and add a redirect test.
7. Never commit .env, data/raw, credentials. Do not print secrets.
8. Accessibility is a requirement: real buttons and links, visible focus, 4.5:1 text contrast in both themes,
   prefers-reduced-motion respected, every map has a keyboard-reachable list alternative.
9. Before each PR, take before/after screenshots with web/scripts/screenshots.mjs (desktop and phone, dark and light) and
   attach two to the PR. Report console errors and horizontal overflow.
10. Stop and report after each step. Do not start the next step.

Use the installed skills in this order where relevant: impeccable (init, shape, critique, audit, polish, animate),
emil-design-eng for motion decisions, accessibility for the final audit. Keep hooks off.
```

---

## Design spec (paste second)

**Product.** Chargeline: ERCOT battery revenue backtest. Audience: energy professionals, analysts, hiring managers who
want to see rigor. Data first, calm, precise. Not a marketing site, not an AI-default look (no purple gradients, no left
border cards, no emoji, no blue-and-white).

**Name and navigation.** Chargeline. Tabs: Home, Atlas, Studio, Research, Guide. Live ticker above the header.

**Tokens** (CSS variables, `[data-theme="dark"|"light"]`, default follows `prefers-color-scheme`, toggle in header,
persisted in localStorage with try/catch):

| Token | Dark | Light |
|---|---|---|
| bg | #0F1113 | #F2F1ED |
| panel | #171A1D | #FAF9F6 |
| panelHi | #1C2024 | #FFFFFF |
| line | #262B30 | #DAD7CF |
| line2 | #3A4046 | #B4B0A5 |
| track | #242A2F | #E4E1D9 |
| text | #E8E6E1 | #15171A |
| muted | #B8BDC2 | #3F4348 |
| faint | #A3A9AF | #55595E |
| amber (fills) | #F2A93B | #F2A93B |
| amberText | #F2A93B | #8F5200 |
| mint (fills) | #5FD6A4 | #1E9A70 |
| mintText | #5FD6A4 | #0B6A4A |
| bone (spike metric) | #E8E6E1 | #15171A |
| onAccent | #0F1113 | #15171A |
| land / landStroke | #1A1E22 / #4A5259 | #E4E2DB / #6E6A60 |
| dotLow | #8B949B | #8A8E8A |
| glass | rgba(23,26,29,.72) | rgba(250,249,246,.82) |
| heroGlow | radial-gradient(900px 620px at 72% 52%, rgba(242,169,59,.12), rgba(95,214,164,.04) 45%, transparent 75%) | same with amber .20, mint .06 |

Ticker colors invert against the page: in dark mode the strip is light (bg #ECEBE7, text #121212, muted #4A4741,
border #7A766D, live dot #D6451F, up #0B6A4A, down #A3331A); in light mode it is dark (bg #121212, text #ECEBE7,
muted #C9C6BF, border #8D8A83, dot #FF6A4A, up #7FE0B0, down #FFB09C).

Metric colors on maps and charts: Revenue = amber, Capture = mint, Spike share = bone. Also differ by size or lightness,
never by hue alone.

**Type.** Bricolage Grotesque (display, 500-800), DM Sans (body, 400-600), DM Mono (numbers, labels, 400/500). Use
Fontsource packages, no runtime Google Fonts request. H1 clamp(38px, 4.4vw, 60px) weight 800, tracking -0.025em. Big
numerals clamp(56px, 7vw, 96px) weight 800. Mono eyebrows 13px, letter-spacing .12em, uppercase.

**Shape.** Panels radius 20, cards 16, inputs and chips 12, buttons and tabs pill (999). Touch targets at least 44px.
Container max 1200px, 32px side padding. Phone widths stack; wide tables scroll in a box.

**Motion** (emil rules: purposeful, fast, interruptible): ease cubic-bezier(.23,1,.32,1); entrance rise 420ms with
40-190ms stagger; bars grow via clip-path 700ms; button press scale .97 at 160ms; tab/dot changes 420ms; Home map top
nodes breathe 4.5s and emit rings every 3s; ticker scrolls 56s linear with a Pause button and pauses on hover. All of it
off under prefers-reduced-motion.

**Layout per screen** (see PNGs):
- Shell: ticker, header (logo ring+dot, Chargeline, five tabs, sun/moon toggle), main, footer disclaimer.
- Home: hero with headline + copy + two CTAs on the left and the glowing map on the right sharing one glow, no card
  around the map. Under the map a glass control bar: metric tabs (Revenue, Capture, Spike share), three numbered node
  chips with the value for the active metric, legend. Then three key numbers, "What a schedule keeps" with the gap bars,
  duration bars and the ranked hub table, then "Four ways in" as four cards, then footer.
- Atlas: page title, then map card (metric tabs, zone chips, map of placed nodes) beside a selected-node card (stats,
  12-month bars, geocode note) and a top-12 list; below, node-vs-hub buckets and percentiles; then the unplaced-nodes note.
- Studio: inputs panel (location, year, power, duration, degradation) beside run summary, perfect-foresight vs
  day-ahead totals and bars, monthly bars, duration trade-off, operating stats.
- Research: three featured charts, "All eleven findings" with topic filters, method list, validation table with sources.

**Map projection** (design values; if the existing Map page has a more accurate outline, use that and keep this mapping):
x = 14 + (lon + 106.6) * 40.99 ; y = 15 + (36.5 - lat) * 47.5 on a 560 x 540 viewBox. Dot size = 2.6 + 8.5 * norm^0.75
where norm is the min-max normalised metric; opacity .45 + .55 * norm; halo for norm above .55.

---

## Old to new routes (confirm against App.tsx, do not assume)

| Old | New |
|---|---|
| Start here | Guide |
| Map | Atlas |
| Live | Home (ticker and hub tiles) |
| Overview, Revenue, Dispatch, Realism | Research (charts and findings) |
| Compare | Studio (compare presets) or Research |
| Custom run | Studio |
| Economics | Decided: stays under Studio (`#/studio/economics`) until Step 5, which reports where it lives long term. |
| Method, About | Research (method) and Guide (about) |

---

## Step prompts

### Step 0: setup (no UI changes)
```
Create branch design/00-setup. Read docs/REDESIGN.md and docs/design/*.png. Run `impeccable init` and write PRODUCT.md
(audience: energy professionals; data first; calm, precise; anti-references: AI-default gradients, blue-and-white,
left-border cards, emoji) and DESIGN.md from the spec. List the old routes in App.tsx and propose the old-to-new
route table; flag every page that has no home in the new navigation. Do not change UI code. Commit docs only, open a PR,
stop and report.
```

### Step 1: tokens and shell
```
Branch design/01-tokens-shell. Implement the tokens (dark and light), Fontsource fonts, the Mantine theme mapped to the
tokens, and the shell: live ticker, header with five tabs, theme toggle, footer. Routing: add Home, Atlas, Studio,
Research, Guide routes; old hash routes redirect per the route table; add redirect tests. The ticker reads from the
Phase 16 live feed via the existing loader; with no data it shows "Live prices unavailable", never fake numbers. Include a
Pause button and respect reduced motion. Do not restyle page content yet; existing pages render inside the new shell.
Run impeccable audit on the shell. Screenshots, tests, build, PR, stop.
```

### Step 2: Home
```
Branch design/02-home (from the merged step 1). Build Home from docs/design/ Home PNGs: hero, glowing map, glass control
bar with working metric tabs and node chips, key numbers, gap bars, duration bars, ranked hub table, four ways in.
All numbers load from results files via loaders; the headline percentage is computed from the loaded hub results, with a
neutral fallback sentence if West no longer beats Houston. The map plots real lat/lon from nodes_2025_2h.json using the
spec projection; hub markers are schematic and say so; marker 3 is the rank-1 node and shows "location under review" if
its geo is manual_review. Add the no-hardcoded-numbers grep and tests that assert displayed numbers equal loaded data.
Run impeccable critique then polish. Screenshots (dark, light, phone), tests, build, PR, stop.
```

### Step 3: Atlas
```
Branch design/03-atlas. Replace the Map page with Atlas per docs/design. Data: results/nodes_2025_2h.json (and the
all-node map data already used by the Map page). Metric tabs, zone filter, click-to-select, top-12 list as the keyboard
path, selected-node card with monthly bars, buckets and percentiles computed in code from the data (not typed), and the
"nodes waiting for a location" note with the real count. Keep every existing Map capability (heat mode, detailed-node
panel, hub-source consistency rule from FINDINGS section 9) or list what you dropped and why. Lazy-load the all-node file
as before. Tests, screenshots, impeccable audit, PR, stop.
```

### Step 4: Studio
```
Branch design/04-studio. Merge Custom run (and the compare presets) into Studio. Presets come from the existing results
files and show instantly; any input outside the presets runs in the browser with the existing highs-js worker, with
progress by month and the existing parity tests intact (including the MILP-fallback day and the DST day). Add efficiency,
dates and start charge inputs back (they are locked only in the design). Run summary box shows the exact inputs and
whether the result is preset or solved. Power scales dollar totals. Inputs are real labelled controls. Tests, screenshots,
audit, PR, stop.
```

### Step 5: Research and Guide
```
Branch design/05-research-guide. Research: three featured charts bound to results/ancillary.json, results/rtcb.json and
the hub results; all eleven findings with topic filters, each linking to its full text rendered from results/FINDINGS.md
(or a structured findings.ts that is checked against FINDINGS.md by a test); method list; validation table with the
Modo sources. Keep the descriptive-not-causal wording. Guide: merge Start here, glossary and About. Decide and report
where Economics lives. Tests, screenshots, audit, PR, stop.
```

### Step 6: motion
```
Branch design/06-motion. Apply emil-design-eng review to every interaction in the spec: entrance rise, bar growth, tab and
dot transitions, press states, map breathing and rings, ticker. Remove anything that does not help the reader. Verify
prefers-reduced-motion disables all of it, and that nothing animates width, height or layout. Report before/after.
```

### Step 7: accessibility and light-mode QA
```
Branch design/07-a11y. Run the accessibility skill: WCAG 2.2 AA audit of all five screens in both themes, keyboard
walkthrough (map alternatives, tabs, selects, toggles, ticker pause), screen-reader names for every control and chart,
contrast checks for amberText and mintText in light mode, focus order, 200% zoom, phone widths. Fix everything found.
Then impeccable polish across the site and a final screenshot set in dark, light, desktop, phone. PR, stop.
```

### Step 8: release check (after you merge)
```
Confirm the deploy built, old URLs redirect, the Live feed still works from the Worker, and the refresh workflow still
passes. Update README status line, Method and FINDINGS references to renamed pages. Report anything that regressed.
```
