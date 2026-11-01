# Findings: ERCOT battery arbitrage at hubs and resource nodes, 2024 – 2026 YTD

Model: perfect-foresight energy arbitrage on ERCOT real-time 15-minute settlement point prices.
Each day is solved separately and starts and ends empty. 85% round-trip efficiency. No ancillary
services. 100 MW battery; results are per kW, so size doesn't matter. 2026 hub data runs through
Oct 24, 2026; 2026 node data through Oct 30. Every figure below comes from `results/*.json`
(180 runs: 5 hubs and 5 resource nodes, listed in `results/index.json`). Sections 7 and 8
add a day-ahead-scheduled strategy and a before/after RTC+B comparison.

## 1. Ten days carry a fifth to two-fifths of the year
Share of a 2-hour battery's annual revenue earned on its 10 best days ($10/MWh degradation):

| Hub | 2024 | 2025 | 2026 YTD |
|---|---|---|---|
| HB_HOUSTON | 42.5% | 21.1% | 28.7% |
| HB_NORTH | 42.3% | 24.5% | 33.7% |
| HB_SOUTH | 41.5% | 19.6% | 31.6% |
| HB_WEST | 36.4% | 21.6% | 30.6% |
| HB_PAN | 39.3% | 22.5% | 31.2% |

In 2024, under 3% of the days produced about 40% of the revenue, mostly in May and August.
2025 had fewer extreme spikes, so revenue was spread more evenly.

## 2. Location matters: West Texas earns ~20% more than Houston
2-hour battery, 2025, $10/MWh degradation: **HB_WEST $48.7** and HB_PAN $46.8, against
HB_HOUSTON $39.7 and HB_SOUTH $39.5 per kW-year. That's a 23% gap between hubs. Individual
resource nodes spread far wider (section 6).

## 3. Longer batteries earn more per kW, less per kWh
HB_HOUSTON 2025, $10/MWh degradation:

| Duration | $/kW-yr | $/kWh-yr |
|---|---|---|
| 1h | 26.7 | 26.7 |
| 2h | 39.7 | 19.9 |
| 4h | 53.1 | 13.3 |

Doubling duration from 2h to 4h adds 34% revenue for 100% more energy capacity.

## 4. Arbitrage revenue keeps falling, and the decline predates RTC+B
2-hour battery, $/kW earned over the **same window, Jan 1 – Oct 24**, $10/MWh degradation:

| Hub | 2024 | 2025 | 2026 | 2025 vs 2024 | 2026 vs 2025 |
|---|---|---|---|---|---|
| HB_HOUSTON | 46.1 | 34.4 | 26.7 | −25% | −23% |
| HB_NORTH | 46.4 | 37.2 | 33.9 | −20% | −9% |
| HB_SOUTH | 48.0 | 31.7 | 26.7 | −34% | −16% |
| HB_WEST | 53.9 | 40.6 | 35.5 | −25% | −12% |
| HB_PAN | 49.2 | 38.8 | 35.6 | −21% | −8% |

All of 2026 so far comes after RTC+B went live (Dec 5, 2025). Revenue fell again, but it had
already fallen as much in 2025, before RTC+B. **This model can't separate RTC+B from the
continuing build-out of batteries flattening price spreads.** It also leaves out ancillary
services, which is where RTC+B changes battery revenue most directly. The 2026 drop is largest at
Houston and South and concentrated in May–July. Keep claims to "revenue fell again," not "RTC+B
caused it" (Phase 8 looks at this directly).

## 5. A modest degradation cost removes ~40% of cycling but only ~23% of revenue
HB_HOUSTON 2025, 2h: a $10/MWh degradation cost cuts revenue from $51.3 to $39.7/kW-yr (−23%)
and cycles from 773 to 463 a year (−40%). The trades it removes are mostly small-spread ones.
The average spread captured rises from $37 to $56/MWh.

## 6. Node vs hub: a congested node can earn 2–4× its hub; a typical node earns about the same
**How the nodes were picked.** All 735 resource nodes with complete data were ranked by the
standard deviation of their RT 15-minute price in **August 2025** (one sample month, pulled from
the ERCOT public API). The median node had a std of $23.6/MWh, the same as the hubs ($21–24). We
took the 3 most volatile nodes and the 2 closest to the median, skipping any node whose prices
correlate above 0.95 with one already picked. Without that rule, #2 and #3 were the same
wind-farm pocket (CAMWIND_RN and PALMWI_UNIT1, both peaking at exactly $2,580.73). "Sits near"
is the hub of the node's settlement load zone (`results/node_selection.json`):

| Node | Group | Aug-25 std ($/MWh) | Rank of 735 | Load zone (substation) | Hub it sits near | Best price corr. with any hub |
|---|---|---|---|---|---|---|
| RUSSEKST_RN | high | 215 | 1 | LZ_WEST (RUSSEKST) | HB_WEST | 0.16 |
| CAMWIND_RN | high | 145 | 2 | LZ_SOUTH (PAREDES) | HB_SOUTH | 0.11 |
| RHESS2_ESS1 | high | 120 | 4 | LZ_SOUTH (GEORSO) | HB_SOUTH | 0.31 |
| ANSON1_ALL | typical | 23.6 | 368 | LZ_WEST (PHNTMHL) | HB_WEST | 0.98 (HB_NORTH) |
| WIPOPA_3_4 | typical | 23.7 | 367 | LZ_SOUTH (PINECR) | HB_SOUTH | 0.99 |

The volatile nodes barely track any hub. Their prices are set by local congestion.

**Matched-window comparison.** 2-hour battery, $10/MWh degradation, $/kW earned over the days
both the node and its hub have results (2026: Jan 1 – Oct 24; RUSSEKST_RN 2024 starts Jan 4
because the API has no prices for it on Jan 1–3):

| Node (hub) | 2024 node / hub | ratio | 2025 node / hub | ratio | 2026 YTD node / hub | ratio |
|---|---|---|---|---|---|---|
| RUSSEKST_RN (HB_WEST) | 158.7 / 65.4 | **2.43×** | 175.9 / 48.7 | **3.61×** | 72.3 / 35.5 | **2.04×** |
| CAMWIND_RN (HB_SOUTH) | 70.3 / 56.7 | 1.24× | 43.5 / 39.5 | 1.10× | 42.7 / 26.7 | 1.60× |
| RHESS2_ESS1 (HB_SOUTH) | 107.3 / 56.7 | **1.89×** | 179.2 / 39.5 | **4.54×** | 75.2 / 26.7 | **2.82×** |
| ANSON1_ALL (HB_WEST) | 60.6 / 65.7 | 0.92× | 47.4 / 48.7 | 0.97× | 36.2 / 35.5 | 1.02× |
| WIPOPA_3_4 (HB_SOUTH) | 54.8 / 56.7 | 0.97× | 42.8 / 39.5 | 1.08× | 28.6 / 26.7 | 1.07× |

Ratios for 1-hour and 4-hour batteries are similar (RUSSEKST_RN 1.9–4.1×, RHESS2_ESS1
1.8–5.1×, typical nodes 0.90–1.10×); run `python -m scripts.compare_nodes --duration 4`.

What this says:
- **Location inside a hub matters more than which hub.** The hub-to-hub gap is 23% (finding 2).
  A congested node can earn 1.9–4.5× its own hub.
- **A typical node is its hub, within ±10%.** Hub results are a fair stand-in for most sites.
- **The gap holds out of sample, but not uniformly.** The high-volatility nodes were picked on
  August 2025 data, so their 2025 ratios are flattered by selection. 2024 and 2026 weren't used
  to pick them, and RUSSEKST_RN and RHESS2_ESS1 still earn 1.9–2.8× their hub in those years.
  CAMWIND_RN's edge is smaller and less stable (1.1–1.6×): a volatile month doesn't guarantee
  a valuable year.
- **Node revenue is lumpier.** RHESS2_ESS1's 2025 result depends on Feb 19–20, 2025, when its
  price reached $28,340/MWh, more than five times the $5,000 offer cap (possible at a node
  when several congestion constraints bind). Those two days alone are $77 of its $179/kW. Its
  top-10-day share is 64%, against 20% at HB_SOUTH. RUSSEKST_RN is the opposite: steadily high
  prices (2025 mean $76/MWh, August mean $136/MWh), so its top-10-day share is only 15%.

**Data caveat.** Node prices come from the ERCOT public API report NP6-905-CD, which holds
prices as first posted. Hub prices come from the annual archive, which includes later ERCOT
price corrections. For HB_HOUSTON 2024 the two sources differ on 160 of 35,136 intervals
(13 days, mostly Jan 15–19, May 8 and Aug 9–10), and revenue changes by only 0.1–0.3%. ERCOT's
corrections report keeps only recent months (Jan–Aug 2026 at the time of writing), so
2024–2025 node prices can't be corrected. A corrected spike at a node, such as RHESS2_ESS1's
February 2025 one, would change that node's result much more than 0.3%.

## 7. Scheduling on day-ahead prices captures about two-thirds of perfect foresight, less in 2026
Each day is optimized on ERCOT's day-ahead hourly prices with the same battery, the schedule is
held fixed, and it is paid real-time 15-minute prices (each hourly MW applies to its four
15-minute intervals). The DA price is used only as a forecast. Perfect-foresight and
DA-scheduled revenue are compared on identical days. "Value of perfect foresight" is the gap
between them, and the capture rate is DA-scheduled ÷ perfect foresight. Fields:
`metrics.da_rt_revenue_per_kw_year`, `value_of_perfect_foresight_per_kw_year` and
`capture_rate` in each results JSON and in `results/index.json`.

Capture rate, 2-hour battery, $10/MWh degradation:

| Location | 2024 | 2025 | 2026 YTD | 2025: PF → DA-scheduled ($/kW-yr) |
|---|---|---|---|---|
| HB_HOUSTON | 68% | 61% | 46% | 39.7 → 24.2 |
| HB_NORTH | 70% | 67% | 53% | 43.4 → 29.2 |
| HB_SOUTH | 68% | 65% | 49% | 39.5 → 25.5 |
| HB_WEST | 69% | 69% | 54% | 48.7 → 33.4 |
| HB_PAN | 65% | 65% | 51% | 46.8 → 30.2 |
| ANSON1_ALL (typical node) | 69% | 67% | 53% | 47.4 → 31.9 |
| WIPOPA_3_4 (typical node) | 66% | 64% | 49% | 42.8 → 27.5 |
| CAMWIND_RN (volatile node) | 50% | 45% | 54% | 43.5 → 19.4 |
| RHESS2_ESS1 (volatile node) | 65% | 73% | 43% | 179.2 → 130.2 |
| RUSSEKST_RN (volatile node) | 47% | 33% | 33% | 176.0 → 58.5 |

What this says:
- **At hubs and typical nodes, the DA plan reached 61–70% of perfect foresight in 2024–2025.**
  The gap, the value of perfect foresight, was $14–22/kW-yr in every hub-year, including 2026.
  It barely moved while perfect-foresight revenue fell, which is why the capture rate fell.
- **Longer batteries capture more.** Hubs in 2025: 50–60% for 1-hour, 61–69% for 2-hour,
  70–76% for 4-hour. A 1-hour battery earns its money on a few sharp intervals, which the hourly
  DA price often doesn't foresee; a 4-hour battery mostly follows the daily shape, which DA does.
- **Congested nodes are harder to forecast from DA.** RUSSEKST_RN captured only 33–47%, so its
  lead over HB_WEST (2.4–3.6× with perfect foresight, section 6) shrinks to 1.2–1.75× for the
  DA-scheduled strategy ($/kW-yr). RHESS2_ESS1 kept 73% in 2025 because its February spike was
  partly visible day-ahead: DA prices reached $6,863/MWh those mornings, and the DA schedule
  earned $67 of the $77/kW that perfect foresight made on Feb 19–20.
- **The DA schedule loses money at RT on 39–90 days a year** (out of ~365), when real-time
  prices move against the plan. Perfect foresight never has a losing day.
- **Selling the same schedule day-ahead would have paid more** at every hub in every year (for
  example HB_HOUSTON 2025: $29.4/kW-yr at DA prices vs $24.2 at RT): in the hours the
  schedule discharged, RT prices on balance came in below the DA prices it was planned on. That is a two-settlement market position, which this
  section doesn't model as the strategy; it's reported as `da_da_revenue_per_kw_year`.

One plain forecast is not what operators do. They re-forecast through the day, sell ancillary
services and bid around their state of charge, so they can land above or below these figures.
The capture rate is a reference point, not an estimate of real capture.

## 8. Before vs after RTC+B: the DA-scheduled strategy fell more than perfect foresight
RTC+B went live on Dec 5, 2025. Windows: **Dec 5, 2024 – Oct 24, 2025** vs **Dec 5, 2025 –
Oct 24, 2026**. Each day in the second window is paired with the same calendar day a year
earlier (324 pairs at every location), so the months match. `results/rtcb.json`,
`python -m scripts.rtcb`. 2-hour battery, $10/MWh degradation, $/kW over the window:

| Location | PF before → after | DA-scheduled before → after | Capture | Mean \|RT − DA\| ($/MWh) | RT std ($/MWh) | Median daily RT std |
|---|---|---|---|---|---|---|
| HB_HOUSTON | 35.9 → 28.0 (−22%) | 22.2 → 13.1 (−41%) | 62% → 47% | 11.1 → 11.8 | 42.5 → 35.0 | 13.4 → 11.5 |
| HB_NORTH | 38.9 → 35.7 (−8%) | 27.0 → 18.8 (−30%) | 69% → 53% | 11.7 → 13.5 | 50.1 → 49.5 | 13.5 → 12.0 |
| HB_SOUTH | 33.2 → 28.6 (−14%) | 21.9 → 14.2 (−35%) | 66% → 50% | 10.0 → 11.7 | 37.0 → 39.4 | 13.4 → 11.0 |
| HB_WEST | 42.9 → 38.2 (−11%) | 30.3 → 20.6 (−32%) | 71% → 54% | 12.6 → 14.2 | 50.9 → 51.3 | 16.5 → 14.5 |
| HB_PAN | 41.3 → 38.1 (−8%) | 26.8 → 19.6 (−27%) | 65% → 51% | 13.0 → 14.1 | 51.8 → 50.0 | 15.3 → 14.6 |
| ANSON1_ALL | 41.6 → 38.7 (−7%) | 28.7 → 20.6 (−28%) | 69% → 53% | 12.3 → 14.0 | 51.4 → 50.7 | 14.9 → 14.7 |
| WIPOPA_3_4 | 36.9 → 30.4 (−18%) | 24.4 → 15.2 (−38%) | 66% → 50% | 10.8 → 12.4 | 43.0 → 41.7 | 14.3 → 11.8 |
| CAMWIND_RN | 37.7 → 44.8 (+19%) | 16.1 → 24.6 (+53%) | 43% → 55% | 11.6 → 15.7 | 54.0 → 135.7 | 13.4 → 12.3 |
| RHESS2_ESS1 | 170.8 → 77.5 (−55%) | 126.2 → 33.4 (−74%) | 74% → 43% | 55.0 → 23.6 | 665 → 158 | 18.5 → 14.2 |
| RUSSEKST_RN | 181.3 → 78.8 (−57%) | 61.9 → 25.8 (−58%) | 34% → 33% | 57.3 → 28.9 | 167 → 79 | 44.4 → 24.0 |

**What changed** (measured, same days of the year):
- At all five hubs and both typical nodes, perfect-foresight arbitrage fell 7–22% and the
  DA-scheduled strategy fell more, 27–41%. Capture dropped 13–17 points for a 2-hour battery
  (16–22 points for 1-hour, 4–9 points for 4-hour).
- Real-time prices moved further from day-ahead: mean |RT − DA| rose 6–17% at hubs, and RT
  settled further below DA on average (mean RT − DA went from about −$1 to about −$2.5/MWh).
- Within-day RT price movement got smaller: the median day's RT price standard deviation fell
  5–18% at hubs. Overall RT standard deviation, which a few spikes dominate, was mixed (−18% at
  Houston, +6% at South).
- The two congested nodes lost more than half their arbitrage value, mostly because extreme
  prices became rarer (RT intervals above $1,000/MWh: 170 → 69 at RHESS2_ESS1, 145 → 13 at
  RUSSEKST_RN). CAMWIND_RN went the other way: more spikes, higher revenue.

Read together: less within-day spread for perfect foresight to capture, and a DA price that was
a worse guide to where RT would land. That combination fits the larger fall for the
DA-scheduled strategy.

**What caused it** (not established):
- The capture rate was already drifting before RTC+B (hub 2-hour capture fell 0–7 points from
  2024 to 2025, full years), but the drop across Dec 5, 2025 is at least twice as large
  (13–17 points).
- Even so, **this model can't isolate RTC+B from fleet growth.** ERCOT's battery capacity kept
  growing quickly through both windows, and more batteries chasing the same spreads would also
  flatten intraday prices and change how RT departs from DA. Load, gas prices, weather and
  transmission also changed. There is no control group here: every ERCOT location got RTC+B on
  the same day.
- The model leaves out ancillary services, where RTC+B changes battery revenue most directly.
  A fall in arbitrage revenue says nothing on its own about total battery revenue.
- One year per side, and arbitrage revenue is lumpy (section 1), so a single storm or heat wave
  in either window can move these numbers a lot. The node results in particular hang on a
  handful of spike days.

Fair summary: "After RTC+B, arbitrage revenue at hubs fell again, and a simple strategy that
schedules on day-ahead prices fell by a larger share (27–41%) than the perfect-foresight ceiling
(8–22%)." Not:
"RTC+B caused it."

## Validation against published benchmarks
Real ERCOT battery revenue from Modo Energy's ERCOT BESS Index covers **all** revenue
(arbitrage plus ancillary services), earned by real operators without perfect foresight:

| Year | Real fleet average (all revenue) | Our perfect-foresight arbitrage, 2h hubs | Check |
|---|---|---|---|
| 2024 | ~$55–56/kW-yr; ancillary services were most of it (about 74% in H1) | $54–66 ($10 degr.), $66–79 ($0) | ✅ Above the real fleet's arbitrage share |
| 2025 | ~$29/kW-yr (Modo Nowcast, Feb 2026) | $40–49 ($10 degr.), $51–61 ($0) | ✅ 1.4–2.1× real total |

Perfect-foresight arbitrage should beat real operators' arbitrage revenue, and it does in both
years, with a gap consistent with typical capture rates. No run falls outside a plausible
range. The 2025-vs-2024 fall in our results (−17% to −34% in matched windows) points the same
way as Modo's reported halving of total fleet revenue. The fall in ancillary-service prices,
which our model doesn't cover, accounts for the rest.

Sources:
- [Modo Energy: Why were ERCOT battery revenues so low in 2025?](https://modoenergy.com/research/why-were-ercot-battery-revenues-so-low-in-2025-weather-energy-arbitrage-builodout) (Feb 3, 2026: 2025 Nowcast ~$29.4/kW; 2024 $56/kW; 2023 $193/kW)
- [Modo Energy: ERCOT BESS revenues H1 2024](https://modoenergy.com/research/ercot-battery-energy-storage-revenues-h1-january-june-2024-owners-ancillary-services-arbitrage-bess-index-jupiter-power-key-capture) (~$70/kW annualized in H1 2024; arbitrage 26% of revenue)
- [Modo Energy: ERCOT battery revenue benchmark, November 2025](https://modoenergy.com/research/ercot-battery-revenue-benchmark-november-2025-battery-energy-storage-bess-capture-rates)

## Not done yet
- **More nodes:** the 5 nodes are a sample. The 10-location target in PLAN.md could add nodes
  near HB_HOUSTON, HB_NORTH and HB_PAN; none of the picks sit in those load zones.
- **Load zones:** excluded because the archive mixes two conflicting series (see README).
- **Ancillary services:** still not modeled (PLAN.md Phase 8c). They matter most for judging RTC+B.
