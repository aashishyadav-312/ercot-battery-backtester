# ERCOT Battery Backtester — Build Plan

**Question the tool answers:** How much could a battery have earned at a given ERCOT location, and what drove that number?

**End state:** a dashboard in the style of the GridStatus ERCOT page (KPI tiles across the top, chart cards with download and expand buttons, left navigation, date picker), with its own name and look and no copied branding. It runs on free hosting and can be embedded in the lab site.

---

## 1. Architecture decisions (already made, don't revisit)

| Decision | Choice | Why |
|---|---|---|
| Data source | `gridstatus` Python library (ERCOT RT 15-min SPP + DA hourly SPP), plus a free ERCOT API account for the endpoints that need it | Free and open source. One node-year is about 35k rows. |
| Storage | Parquet in `data/raw/` (gitignored), results as JSON in `results/` (committed) | Results stay small and the frontend reads plain JSON |
| Optimizer | One LP per day: PuLP with the HiGHS solver (`highspy`) | 96 intervals per day solves in milliseconds, so a full year takes seconds |
| Frontend | **Vite + React + TypeScript + Tailwind + ECharts**, a static site | Streamlit can't reach the premium look you want. A static site can, and it hosts for free. |
| Hosting | GitHub Pages, deployed by GitHub Actions | $0, and easy to embed in the lab site with an iframe |
| Interactivity | Precompute a grid (about 10 nodes × 1/2/4h × 2024/2025/2026 YTD × a few efficiency/degradation settings). The UI picks from it. | No server needed. Add a custom-input API later only if people ask for it. |

**Network check (done today, from this cloud container):** `www.ercot.com` and `api.ercot.com` respond, and so does PyPI. **This means the data can probably be downloaded in the cloud too, so your laptop isn't needed.** Phase 1 confirms it. If ERCOT blocks the download, fall back to running `python data/fetch_prices.py` on your laptop and committing the parquet files with Git LFS, or uploading them.

**One secret you add yourself (never paste it into chat):** ERCOT API username, password and subscription key. Add them in the cloud environment's settings as environment variables `ERCOT_API_USERNAME`, `ERCOT_API_PASSWORD` and `ERCOT_API_SUBSCRIPTION_KEY`, and add them as GitHub Actions secrets for the refresh workflow.

---

## 2. Which model and effort to use (budget: $100 cloud credits)

Rule of thumb: **use Sonnet for code that follows a clear spec. Use Opus only where the thinking is the hard part** (the LP formulation and checking that the numbers make sense) **and for the final design pass.**

| Phase | Model | Effort | Rough cost |
|---|---|---|---|
| 0 Scaffold | Sonnet 5.5 | low | $1–2 |
| 1 Data fetch | Sonnet 5.5 | medium | $3–5 |
| 2 LP optimizer + tests | **Opus 5.5** | high | $6–10 |
| 3 Year runner + metrics | Sonnet 5.5 | medium | $4–6 |
| 4 Batch run + validation | **Opus 5.5** | medium | $5–8 |
| 5 Frontend v1 (functional) | Sonnet 5.5 | medium | $8–12 |
| 6 Premium design pass (`/apple-design`) | **Opus 5.5** | high | $8–12 |
| 7 Deploy + refresh workflow | Sonnet 5.5 | low | $2–4 |
| 8 v2: DA-schedule / RT-settle + RTC+B | **Opus 5.5** | high | $8–12 |
| 9 README, LinkedIn post, outreach note | Sonnet 5.5 | low | $1–3 |
| **Total** | | | **about $45–75**, leaving room for fixes |

Ways to save credits:
- **Start one new session per phase.** Long sessions pay again and again for old context.
- Each prompt below starts with "Read PLAN.md", so a fresh session only loads what it needs.
- Have it run tests, not long explanations. End each phase with "commit and push".
- Don't use `max` effort or ask for subagents. Neither pays off here.

---

## 3. Phase prompts (copy-paste one per new session)

All sessions work on this repo. Each prompt is written to run without you watching it.

### Phase 0 — Scaffold  ·  Sonnet · low
```
Read PLAN.md. Do Phase 0: create the repo layout below with a pyproject.toml
(python>=3.11; deps: gridstatus, pandas, pyarrow, pulp, highspy, pytest),
a .gitignore (data/raw/, .venv, node_modules, dist), empty modules with
docstrings, and a pytest that imports each module. Run pytest. Commit and push.

ercot-battery-backtester/
  data/fetch_prices.py   model/dispatch.py   model/run_year.py
  model/metrics.py       scripts/run_grid.py tests/
  results/               web/  (leave empty for now)
```

### Phase 1 — Data  ·  Sonnet · medium
```
Read PLAN.md. Do Phase 1 in data/fetch_prices.py:
- fetch(location, year, market) -> DataFrame [interval_start_utc, location, price]
  for market in {"RT15", "DA"} using gridstatus Ercot / ErcotAPI. Use the
  ERCOT_API_* env vars if they are set.
- Cache to data/raw/{market}_{location}_{year}.parquet; skip if cached.
- Handle DST (store UTC, keep a Central-time column), missing intervals (report
  the count, forward-fill at most 1 interval), and duplicate rows.
- CLI: python -m data.fetch_prices --location HB_HOUSTON --year 2025 --market RT15
First fetch ONE month of HB_HOUSTON RT15 to confirm it works from this container.
If ERCOT is unreachable, stop and tell me exactly what to run on my laptop.
Print row count, min/max/mean price and the 5 highest-priced intervals. Commit and push.
```

### Phase 2 — Optimizer  ·  Opus · high
```
Read PLAN.md. Do Phase 2 in model/dispatch.py:
optimize_day(prices: np.ndarray, dt_hours: float, power_mw, energy_mwh,
             rte=0.85, deg_cost_per_mwh=0.0, soc0_frac=0.5) -> dict
LP (PuLP + HiGHS): charge c_t, discharge d_t in [0, P]; soc_t in [0, E];
soc_{t+1} = soc_t + c_t*eta_c*dt - d_t/eta_d*dt with eta_c = eta_d = sqrt(rte);
soc_end == soc0. Objective: max sum(price*(d-c)*dt) - deg_cost*sum(d*dt).
Return schedule DataFrame, revenue, energy charged/discharged, cycles.
Tests (pytest): flat prices -> zero dispatch; two-price day -> charges low,
discharges high; never simultaneous charge+discharge in the result;
SOC bounds hold; revenue never negative; 96-interval day solves in < 0.5s.
Then solve one real HB_HOUSTON day from data/raw and print a 15-min table.
Check by eye that it charges midday and discharges in the evening peak. Commit and push.
```

### Phase 3 — Year runner + metrics  ·  Sonnet · medium
```
Read PLAN.md. Do Phase 3:
- model/run_year.py: run_year(location, year, power_mw, hours, rte, deg_cost)
  loops over Central-time days, calls optimize_day, returns an interval-level
  schedule + daily revenue. Skip days with gaps over 4 intervals and log them.
- model/metrics.py: $/kW-yr (annualize partial years and label them clearly),
  monthly $/kW, top-10-day revenue share, an hour x month heatmap of the
  average net discharge MW, cycles/yr, and average spread captured.
- Write results/{location}_{year}_{hours}h_{rte}_{deg}.json (compact, under
  200 KB) with a "meta" block listing every assumption.
Run HB_HOUSTON 2025 for 1h/2h/4h and print a summary table. Commit and push.
```

### Phase 4 — Batch run + sanity check  ·  Opus · medium
```
Read PLAN.md. Do Phase 4:
- scripts/run_grid.py runs every combo: hubs HB_HOUSTON, HB_NORTH, HB_SOUTH,
  HB_WEST, HB_PAN plus about 5 interesting resource nodes (pick them from
  2025 RT price volatility: 3 high, 2 typical) x 1/2/4h x 2024/2025/2026YTD
  x rte {0.85} x deg {0, 10 $/MWh}. Write results/index.json listing them all.
- Validate: perfect-foresight energy-arbitrage $/kW-yr must be ABOVE published
  real-world ERCOT BESS revenue benchmarks (e.g. Modo Energy ERCOT index) for
  the same year. Search for the benchmark figures and cite them.
  Flag anything outside a plausible range.
- Write results/FINDINGS.md: the 5 most interesting facts (top-10-day share,
  node vs hub gap, 1h vs 4h, 2025 vs 2026 after RTC+B went live Dec 2025).
Commit and push.
```

### Phase 5 — Frontend v1 (functional, not pretty yet)  ·  Sonnet · medium
```
Read PLAN.md. Do Phase 5 in web/ (Vite + React + TS + Tailwind + ECharts):
Layout like a grid-operator dashboard: left sidebar (Overview, Revenue,
Dispatch, Compare, Method), top bar with Location / Duration / Year /
Degradation selectors, then:
- KPI tiles: $/kW-yr, top-10-day share, cycles/yr, avg spread captured
- Card: monthly revenue bars          - Card: hour x month dispatch heatmap
- Card: cumulative revenue curve with the top-10 days marked
- Card: 1h vs 2h vs 4h comparison     - Card: node vs its hub
- Method page: assumptions + the perfect-foresight caveat
Each card has download-CSV and expand buttons. Load results/*.json at
build time (copy into web/public/data). Light + dark mode. Mobile works.
Run the build and take a Playwright screenshot of each page to check it. Commit and push.
```

### Phase 6 — Premium design pass  ·  Opus · high
```
/apple-design
Read PLAN.md. Redesign web/ to feel premium, more polished than a typical
grid dashboard: typography scale, spacing rhythm, restrained color with one
accent, translucent sticky top bar, smooth chart transitions when selectors
change, skeleton loading states, careful dark mode, reduced-motion support.
Lead with the headline finding as a hero sentence above the KPIs.
No third-party brand names or logos. Screenshot before/after at desktop and
phone widths. Commit and push.
```
(If you've installed the REA agents skill by then, add: "Also use the rea-agents skill to study the reference dashboard at gridstatus.io/live/ercot for layout patterns only.")

### Phase 7 — Deploy  ·  Sonnet · low
```
Read PLAN.md. Do Phase 7: a GitHub Actions workflow that builds web/ and
deploys it to GitHub Pages, plus a monthly workflow that refetches 2026 YTD,
reruns the grid and commits the results (uses the ERCOT_API_* secrets).
Tell me the exact repo settings I need to click. Commit and push.
```

### Phase 8 — v2 realism  ·  Opus · high
```
Read PLAN.md. Do Phase 8:
(a) "Schedule DA, settle RT": optimize on DA hourly prices, then settle the
    fixed schedule at RT 15-min prices. Report the PF vs DA-scheduled gap as the
    "value of forecasting".
(b) Pre- vs post-RTC+B (Dec 5 2025): compare equal-length windows,
    adjusting for seasonality, and keep the claims cautious.
(c) Optional: ancillary services (Reg Up/Down, RRS, ECRS, Non-Spin) using
    ERCOT AS clearing prices, with simple capacity-split constraints.
Add these to the JSON outputs and a new "Realism" page in web/. Commit and push.
```

### Phase 9 — Write-up  ·  Sonnet · low
```
Read PLAN.md and results/FINDINGS.md. Rewrite README.md (what it answers,
method, assumptions, limits, how to run, live link). Draft a LinkedIn post that
leads with ONE finding, and a 4-sentence outreach note to Aurora Austin
contacts, in drafts/. Plain, human tone, no hype words.
```

---

## 4. Guardrails for every phase
- State the assumptions on the page: perfect foresight, energy-only in v1, simple degradation.
- No Aurora or GridStatus names, logos or branding on the tool. The name is "ERCOT Battery Backtester".
- Lead with a finding, not the code.
- Never commit API keys. They go in environment variables and GitHub secrets only.

## 5. Your manual to-dos (outside Claude)
1. Make a free ERCOT API account at apiexplorer.ercot.com and get a subscription key.
2. Add the keys to the cloud environment's variables and to the GitHub repo's Actions secrets.
3. After Phase 7: Settings → Pages → Source = GitHub Actions.
4. Before Phase 6, optionally: run `npx rea-agents setup` on your laptop, after checking what the package does, and enable it as a skill.
