# Findings: ERCOT battery arbitrage at hubs and resource nodes, 2024 – 2026 YTD

Model: perfect-foresight energy arbitrage on ERCOT real-time 15-minute settlement point prices.
Each day is solved separately and starts and ends empty. 85% round-trip efficiency. No ancillary
services. 100 MW battery; results are per kW, so size doesn't matter. 2026 hub data runs through
Oct 24, 2026; 2026 node data through Oct 30. Every figure below comes from `results/*.json`
(180 runs: 5 hubs and 5 resource nodes, listed in `results/index.json`). Sections 7 and 8
add a day-ahead-scheduled strategy and a before/after RTC+B comparison. Section 9 runs one
standard configuration at all 642 resource nodes with complete 2025 data (`results/nodes_2025_2h.json`).

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

## 9. All 642 resource nodes: half earn within 10% of their hub; 2% earn 2–4.5×

**Setup.** One standard configuration: 2-hour battery, 85% round-trip efficiency, $10/MWh degradation, 2025, the same daily
LP as the detailed runs (perfect foresight, plus the DA-scheduled / RT-settled strategy). ERCOT priced 776 resource nodes
during 2025; 642 have complete data (both strategies solve all 365 days). The other 134 have less than 99% of the year's RT
intervals (see the completeness note below). Results are in `results/nodes_2025_2h.json` (summary
metrics and monthly revenue only); print these tables with `python -m scripts.node_findings`.

**Check against the detailed runs.** The five detailed nodes reproduce their existing results exactly (e.g. RHESS2_ESS1
$179.18, RUSSEKST_RN $175.95). The hubs come out 0.8–1.6% higher than the detailed hub runs ($40.07 vs $39.68 at
HB_HOUSTON), because the bulk files are prices as posted while the detailed hub runs use the annual archive, which
includes later corrections (27 of 35,040 HB_HOUSTON intervals differ). Ratios below use the bulk hub figures so node and
hub are on identical data.

**Every ratio in this section uses bulk hub prices.** Each node-vs-hub ratio here, in the Map page's Top nodes table and in
its all-node side panel divides by hub revenue from the same bulk files and the same pipeline as the node (checked in
`scripts/run_all_nodes.py`, `scripts/node_findings.py` and the web code), so none of the numbers below change. One place
did mix sources: in heat mode, clicking one of the 5 detailed nodes opened the detailed panel, which divides by the
archive-based hub runs (RHESS2_ESS1 showed 4.5× there against 4.46× in the table). Heat mode now uses the all-node panel
for every resource node. Finding 6 keeps archive hubs on purpose (it compares the detailed runs), which is why it gives
RHESS2_ESS1 4.54× in 2025 and this section 4.46×.

**Distribution of node revenue vs its hub** (hub = trading hub of the node's settlement load zone; HB_HOUSTON $40.1,
HB_NORTH $43.8, HB_SOUTH $40.1, HB_WEST $49.1, HB_PAN $47.1 per kW-yr):

| Percentile | p10 | p25 | p50 | p75 | p90 | p99 | max |
|---|---|---|---|---|---|---|---|
| Node $/kW-yr | 39.0 | 41.9 | 47.4 | 58.1 | 69.9 | 106.5 | 179.2 |
| Node ÷ own hub | 0.95× | 0.99× | 1.07× | 1.30× | 1.44× | 2.34× | 4.46× |

| Node ÷ hub | < 0.9× | 0.9–1.1× | 1.1–1.5× | 1.5–2× | 2–3× | ≥ 3× |
|---|---|---|---|---|---|---|
| Nodes | 24 (4%) | 349 (54%) | 230 (36%) | 26 (4%) | 8 (1%) | 4 (1%) |

- **Half the nodes are within ±10% of their hub.** Finding 6's "a typical node is its hub" holds across the whole system,
  not just the two typical picks.
- **Few nodes earn much less than their hub** (4% below 0.9×, worst 0.81×). An arbitrage battery loses little by sitting
  at an ordinary node, and congestion mostly adds spread.
- **The tail is real but thin.** 38 nodes (6%) earn 1.5× their hub or more, and 12 (2%) earn 2× or more. RHESS2_ESS1 and
  RUSSEKST_RN, picked in Phase 4 from one month of volatility, turn out to be #1 and #2 of 642 for 2025.
- **Congestion pays where prices decouple.** Nodes whose prices track their hub less closely earn relatively more
  (Spearman correlation between price-correlation-with-hub and node÷hub ratio: −0.30). The top three all have
  correlation ≤ 0.39.
- **DA scheduling captures less at the best nodes.** The median node's capture rate is 0.60, at the bottom of the hubs'
  0.60–0.68, and 16 of the top 20 sit at 0.33–0.56: their spikes are local and RT-only, so a schedule built on DA
  prices misses them. NF_BRP_RN (0.71) and RHESS2_ESS1 (0.73) are exceptions; their high prices also showed in DA.

**By load zone:**

| Load zone | Nodes | Median $/kW-yr | 90th pct | Median ÷ hub | In top 20 |
|---|---|---|---|---|---|
| LZ_WEST | 222 | 62.9 | 71.3 | 1.28× | 9 |
| LZ_SOUTH | 189 | 45.4 | 62.8 | 1.13× | 9 |
| LZ_NORTH | 134 | 46.8 | 56.2 | 1.07× | 2 |
| LZ_HOUSTON | 96 | 40.2 | 41.9 | 1.00× | 0 |

West Texas nodes earn more than the West hub itself (median 1.28×): the hub averages over buses that are less congested
than where the wind, solar and storage plants sit. Houston nodes are their hub (90th percentile only $41.9). Congestion value
is a West and South Texas story.

**Top 20 nodes, 2025** (perfect foresight $/kW-yr, with DA-scheduled revenue and price correlation with the hub):

| # | Node | Load zone (substation) | $/kW-yr | ÷ hub | DA-sched. | Capture | Top-10 share | Corr. hub |
|---|---|---|---|---|---|---|---|---|
| 1 | RHESS2_ESS1 | LZ_SOUTH (GEORSO) | 179.2 | 4.46× | 130.2 | 0.73 | 64% | 0.10 |
| 2 | RUSSEKST_RN | LZ_WEST (RUSSEKST) | 176.0 | 3.58× | 58.5 | 0.33 | 15% | 0.39 |
| 3 | JUNCTION_RN | LZ_SOUTH (JUNCTION) | 122.0 | 3.04× | 41.8 | 0.34 | 28% | 0.33 |
| 4 | JUNORTH_RN | LZ_SOUTH (JUNORTH) | 121.9 | 3.04× | 41.4 | 0.34 | 28% | 0.33 |
| 5 | APPALOSA_ALL | LZ_WEST (PALOUSE) | 117.0 | 2.38× | 44.5 | 0.38 | 14% | 0.62 |
| 6 | GUNMTN_NODE | LZ_WEST (GUNSW) | 111.6 | 2.27× | 56.6 | 0.51 | 13% | 0.71 |
| 7 | NF_BRP_RN | LZ_SOUTH (ANDICE) | 110.6 | 2.75× | 78.5 | 0.71 | 56% | 0.11 |
| 8 | FERMI_ALL | LZ_SOUTH (MAXWELL) | 100.7 | 2.51× | 40.8 | 0.40 | 20% | 0.55 |
| 9 | ALP_BESS_RN | LZ_WEST (LMESA) | 94.6 | 1.93× | 50.6 | 0.53 | 17% | 0.77 |
| 10 | LAMESASLR_G | LZ_WEST (LMESA) | 94.6 | 1.93× | 50.6 | 0.53 | 17% | 0.77 |
| 11 | AMISTAD_ALL | LZ_SOUTH (AMISTAD) | 90.7 | 2.26× | 43.6 | 0.48 | 25% | 0.53 |
| 12 | HAMI_BESS_RN | LZ_SOUTH (HAMILTON) | 90.6 | 2.26× | 43.8 | 0.48 | 25% | 0.53 |
| 13 | POTSVIL_RN | LZ_NORTH (POTSVIL) | 89.5 | 2.04× | 58.9 | 0.66 | 26% | 0.58 |
| 14 | CATARINA_B1 | LZ_SOUTH (CATARINA) | 85.1 | 2.12× | 41.3 | 0.49 | 15% | 0.70 |
| 15 | SGM_SIGNALMT | LZ_WEST (SGMTN) | 84.9 | 1.73× | 39.3 | 0.46 | 21% | 0.73 |
| 16 | JUNG_SLR_RN | LZ_NORTH (JUNG_SLR) | 84.8 | 1.93× | 52.7 | 0.62 | 44% | 0.29 |
| 17 | CFLATS_UNIT | LZ_WEST (TREADWEL) | 84.7 | 1.73× | 43.4 | 0.51 | 21% | 0.76 |
| 18 | JDKNS_RN | LZ_WEST (JDKNS) | 81.7 | 1.66× | 40.2 | 0.49 | 22% | 0.45 |
| 19 | CARBN_BSP_1 | LZ_WEST (CARBN) | 81.5 | 1.66× | 40.0 | 0.49 | 21% | 0.76 |
| 20 | HOLCOMB_RN1 | LZ_SOUTH (HOLCOMB) | 77.5 | 1.93× | 43.7 | 0.56 | 13% | 0.79 |

Top 20 by load zone: **9 West, 9 South, 2 North, 0 Houston.** Several entries are the same electrical pocket listed
twice (JUNCTION_RN/JUNORTH_RN, ALP_BESS_RN/LAMESASLR_G at substation LMESA, AMISTAD_ALL/HAMI_BESS_RN), so the top 20 cover
about 17 distinct locations. Even the 20th node earns 1.9× its hub, but with a DA-scheduled strategy every top-20 node
except RHESS2_ESS1 and NF_BRP_RN earns $39–59/kW-yr, about what the hubs earn with perfect foresight ($40–49). Most of
the node premium needs RT foresight to capture.

**Does the premium last? Top 20 in 2024 vs 2025.** Same configuration and the same bulk source for 2024
(`results/nodes_2024_2h.json`: 561 complete nodes; 2024 hubs $54–66/kW-yr). The 2024 run reproduces the detailed 2024
results exactly for the 4 detailed nodes it covers, and the hubs within 0.25%. "Premium" means at least 1.5× the node's own
hub. Nodes without a complete 2024 are compared with their hub over the days they do have.

| # | Node | Load zone | 2025 $/kW-yr | 2025 ÷ hub | Top-10 share 2025 | 2024 $/kW-yr | 2024 ÷ hub | Top-10 share 2024 | Flag |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RHESS2_ESS1 | LZ_SOUTH | 179.2 | 4.46× | 64% | 107.3 | 1.90× | 46% | both years |
| 2 | RUSSEKST_RN | LZ_WEST | 176.0 | 3.58× | 15% | partial¹ | 2.43× | – | both years |
| 3 | JUNCTION_RN | LZ_SOUTH | 122.0 | 3.04× | 28% | 150.7 | 2.66× | 25% | both years |
| 4 | JUNORTH_RN | LZ_SOUTH | 121.9 | 3.04× | 28% | partial² | 5.02× | – | both years (short 2024) |
| 5 | APPALOSA_ALL | LZ_WEST | 117.0 | 2.38× | 14% | 122.1 | 1.86× | 22% | both years |
| 6 | GUNMTN_NODE | LZ_WEST | 111.6 | 2.27× | 13% | 95.5 | 1.46× | 27% | weaker in 2024 |
| 7 | NF_BRP_RN | LZ_SOUTH | 110.6 | 2.75× | 56% | 81.6 | 1.44× | 37% | weaker in 2024 |
| 8 | FERMI_ALL | LZ_SOUTH | 100.7 | 2.51× | 20% | 102.3 | 1.81× | 25% | both years |
| 9 | ALP_BESS_RN | LZ_WEST | 94.6 | 1.93× | 17% | partial³ | 1.60× | – | both years |
| 10 | LAMESASLR_G | LZ_WEST | 94.6 | 1.93× | 17% | 97.7 | 1.49× | 26% | weaker in 2024 |
| 11 | AMISTAD_ALL | LZ_SOUTH | 90.7 | 2.26× | 25% | 98.8 | 1.75× | 28% | both years |
| 12 | HAMI_BESS_RN | LZ_SOUTH | 90.6 | 2.26× | 25% | 98.8 | 1.75× | 28% | both years |
| 13 | POTSVIL_RN | LZ_NORTH | 89.5 | 2.04× | 26% | 69.8 | 1.24× | 38% | **2025 only** |
| 14 | CATARINA_B1 | LZ_SOUTH | 85.1 | 2.12× | 15% | 129.4 | 2.29× | 31% | both years |
| 15 | SGM_SIGNALMT | LZ_WEST | 84.9 | 1.73× | 21% | 98.0 | 1.49× | 28% | weaker in 2024 |
| 16 | JUNG_SLR_RN | LZ_NORTH | 84.8 | 1.93× | 44% | – | – | – | **no 2024 data** (28 days) |
| 17 | CFLATS_UNIT | LZ_WEST | 84.7 | 1.73× | 21% | 112.1 | 1.71× | 25% | both years |
| 18 | JDKNS_RN | LZ_WEST | 81.7 | 1.66× | 22% | 91.5 | 1.39× | 27% | weaker in 2024 |
| 19 | CARBN_BSP_1 | LZ_WEST | 81.5 | 1.66× | 21% | 92.7 | 1.41× | 29% | weaker in 2024 |
| 20 | HOLCOMB_RN1 | LZ_SOUTH | 77.5 | 1.93× | 13% | 105.2 | 1.86× | 35% | both years |

¹ 363 days (no ERCOT prices Jan 1–3, 2024): $158.7 vs hub $65.3/kW. ² 118 days from September 2024: $66.2 vs hub
$13.2/kW, a quiet season, so the ratio is inflated. ³ 245 days: $69.7 vs hub $43.6/kW.

- **12 of the top 20 earned at least 1.5× their hub in 2024 too**, and 6 more earned 1.39–1.49× (flagged "weaker in
  2024"): the location premium mostly persists, though usually smaller in 2024. 2024 dollars are higher across the
  board because hub revenue was higher.
- **Flagged: POTSVIL_RN** earned 2.04× its hub in 2025 but only 1.24× in 2024, so its premium shows in one year only.
  **JUNG_SLR_RN** has no usable 2024 history (28 days); its 2025 rank rests on one year, with 44% of revenue from 10 days.
- **The top-10-day share separates spike nodes from steady ones.** RHESS2_ESS1 (64%), NF_BRP_RN (56%) and JUNG_SLR_RN
  (44%) depend on a few days. RUSSEKST_RN, APPALOSA_ALL, GUNMTN_NODE and HOLCOMB_RN1 (13–15%) earn their premium steadily
  through the year, which is the more durable kind.

**Completeness rule: the newest nodes, many of them batteries, are left out.** A node needs at least 99% of the year's RT
intervals. Of the 134 resource nodes this drops in 2025, 130 first appear partway through the year (median coverage half
the year; starts spread from January to December) and 4 retired. 80 of the 130 late starters are batteries (an ESR/ESS/BESS
unit or node name), 62% against 30% among the 642 nodes kept. So section 9 describes the 2025 fleet as it stood at the start
of the year, and leaves out much of the storage built during it. A partial-year comparison (as in the table above) could
add them later.

**Where the nodes are on the map.** 296 of the 642 nodes (46%) are now placed, up from 226 (35%): 225 at their EIA plant
and 71 only to a county, from the ERCOT interconnection queue (shown as rings at the county's centre, labelled
county-level). EIA-860M (September 2026) added no new plant-level matches: the EIA-860 2025 file already includes proposed
plants, and the 9 ERCOT plants new in 860M match no unplaced node. Of the top 20, 9 are placed (7 plant-level,
2 county-level). Checked against the 98 plant-placed nodes the queue also finds, the queue's county agrees 86% of the time,
and every disagreement but one is a neighbouring county. The exception, CANYONWD_ALL (EIA name match in Comal County, queue
in Scurry County, 411 km apart), is now left unplaced. The 50 highest-earning unplaced nodes are listed for hand review in
`results/geocoding_review_top50.md`. Details: `results/geocoding_log_all_nodes.md`.

**Caveats.** One configuration; two years are not a forecast. Prices are as first posted, without ERCOT's later
corrections, which matters most for the extreme spikes behind RHESS2_ESS1 and NF_BRP_RN. Coordinates are never guessed.

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
way as Modo's reported halving of total fleet revenue. Ancillary-service prices also changed, but the energy-only model cannot attribute the remainder of the fleet revenue change. Section 10 adds a separate capacity screening model.

Sources:
- [Modo Energy: Why were ERCOT battery revenues so low in 2025?](https://modoenergy.com/research/why-were-ercot-battery-revenues-so-low-in-2025-weather-energy-arbitrage-builodout) (Feb 3, 2026: 2025 Nowcast ~$29.4/kW; 2024 $56/kW; 2023 $193/kW)
- [Modo Energy: ERCOT BESS revenues H1 2024](https://modoenergy.com/research/ercot-battery-energy-storage-revenues-h1-january-june-2024-owners-ancillary-services-arbitrage-bess-index-jupiter-power-key-capture) (~$70/kW annualized in H1 2024; arbitrage 26% of revenue)
- [Modo Energy: ERCOT battery revenue benchmark, November 2025](https://modoenergy.com/research/ercot-battery-revenue-benchmark-november-2025-battery-energy-storage-bess-capture-rates)

## 10. Ancillary capacity changes the revenue stack, with important limits

Phase 14 adds a separate energy + ancillary capacity screen. The original energy-only results, rankings and Economics inputs are retained. Both strategies in the new comparison are solved on the same as-posted ERCOT API energy prices and complete days. The original hub results use corrected annual archives, so their numbers can differ slightly from this new baseline.

AS prices are system-wide, but AS earnings are **not** necessarily equal across locations: a reserve award competes with energy arbitrage for the same power and stored energy. The optimizer shares those limits across Regulation Up, Regulation Down, RRS, ECRS and Non-Spin.

### Houston example: 100 MW / 2 hours, 85% RTE, $10/MWh discharge degradation

| Period | Covered days | Energy-only baseline | Energy in stack | AS receipts | Stack total |
|---|---:|---:|---:|---:|---:|
| Full 2024 | 366 | $54.34 | $43.14 | $58.74 | $101.88 |
| Full 2025 | 365 | $40.07 | $35.44 | $18.26 | $53.70 |
| 2026 through Oct 24 | 297 | $26.68 | $24.99 | $9.18 | $34.16 |

All amounts are actual **$/kW over the stated period**, net of scheduled discharge degradation, not annualized. Components and totals are rounded independently. AS receipts are not all incremental revenue: in 2025 the capacity screen displaces energy trades. Limiting total AS awards to 50% of rated MW reduces the 2025 total from $53.70 to **$47.88/kW** (energy $37.47, AS $10.41). This sensitivity changes exposure, not market clearing prices; it is not a full market-depth model.

The product mix moved. At Houston (2h, $10/MWh) ECRS was the largest 2024 product ($28.13 of $58.74/kW AS), RRS the largest in 2025 ($7.02 of $18.26), and in 2026 through Oct 24 Regulation Down and Up lead ($4.33 and $3.23) while RRS is near zero ($0.06).

### All locations: energy-only vs energy + AS (2 hours, $10/MWh)

| Location | 2024 energy-only → stack | 2025 energy-only → stack | 2026 (to Oct 24/28) energy-only → stack |
|---|---:|---:|---:|
| HB_HOUSTON | $54.34 → $101.88 (1.87×) | $40.07 → $53.70 (1.34×) | $26.68 → $34.16 (1.28×) |
| HB_NORTH | $56.15 → $103.46 (1.84×) | $43.84 → $57.38 (1.31×) | $33.92 → $41.03 (1.21×) |
| HB_SOUTH | $56.57 → $103.52 (1.83×) | $40.13 → $53.92 (1.34×) | $26.69 → $33.96 (1.27×) |
| HB_WEST | $65.61 → $111.74 (1.70×) | $49.10 → $62.25 (1.27×) | $35.51 → $42.50 (1.20×) |
| HB_PAN | $61.06 → $107.36 (1.76×) | $47.14 → $60.62 (1.29×) | $35.64 → $42.65 (1.20×) |
| ANSON1_ALL | $60.62 → $106.77 (1.76×) | $47.37 → $60.49 (1.28×) | $36.49 → $43.57 (1.19×) |
| CAMWIND_RN | $70.31 → $116.62 (1.66×) | $43.45 → $59.24 (1.36×) | $42.91 → $50.67 (1.18×) |
| RHESS2_ESS1 | $107.29 → $150.43 (1.40×) | $179.18 → $191.02 (1.07×) | $75.44 → $82.34 (1.09×) |
| RUSSEKST_RN | $158.75 → $203.07 (1.28×) | $175.95 → $187.72 (1.07×) | $72.64 → $79.47 (1.09×) |
| WIPOPA_3_4 | $54.83 → $101.64 (1.85×) | $42.81 → $56.16 (1.31×) | $28.76 → $36.11 (1.26×) |

AS receipts in the stack are similar everywhere ($54–59/kW in 2024, $16–20 in 2025, $8–10 in 2026) because AS prices are system-wide; the small differences come from each location's energy opportunity cost. The stack therefore adds the most, proportionally, where energy arbitrage is weakest, and the least at the high-spread nodes RHESS2_ESS1 and RUSSEKST_RN. Hubs end Oct 24, 2026 and nodes Oct 28 (see coverage below). RUSSEKST_RN 2024 covers 363 days.

Longer batteries earn more energy but add slightly less from AS. Houston 2025, $10/MWh: 1-hour $27.08 → $40.82 (+$13.74), 2-hour $40.07 → $53.70 (+$13.62), 4-hour $53.47 → $65.57 (+$12.10).

### Before vs after RTC+B, with the AS split

Same 324 calendar-day pairs (Dec 5, 2024–Oct 24, 2025 vs Dec 5, 2025–Oct 24, 2026), 2 hours, $10/MWh, actual $/kW over the window:

| Location | Before: energy-only / stack (AS) | After: energy-only / stack (AS) |
|---|---:|---:|
| HB_HOUSTON | $36.31 / $48.85 ($16.68) | $28.01 / $35.77 ($9.51) |
| HB_NORTH | $39.28 / $51.84 ($16.76) | $35.72 / $43.12 ($9.02) |
| HB_SOUTH | $33.78 / $46.71 ($16.96) | $28.60 / $36.14 ($9.46) |
| HB_WEST | $43.28 / $55.58 ($16.23) | $38.19 / $45.43 ($8.78) |
| HB_PAN | $41.68 / $54.16 ($16.50) | $38.12 / $45.41 ($8.82) |
| ANSON1_ALL | $41.55 / $53.80 ($16.21) | $38.74 / $45.96 ($8.70) |
| CAMWIND_RN | $37.66 / $52.23 ($18.04) | $44.75 / $52.65 ($10.26) |
| RHESS2_ESS1 | $170.80 / $181.74 ($14.69) | $77.50 / $84.54 ($8.46) |
| RUSSEKST_RN | $181.26 / $192.09 ($14.61) | $78.75 / $85.70 ($8.32) |
| WIPOPA_3_4 | $36.85 / $49.30 ($16.48) | $30.36 / $37.84 ($9.22) |

AS receipts in the stack fell by 42–47% at every location across these windows. Stack totals fell at every location except CAMWIND_RN, where higher energy revenue offset lower AS. The two periods differ in price source (DA hourly vs RT 15-minute AS), reserve-duration parameters and market conditions, so this describes what changed, not why.

### Benchmark validation

Modo Energy's February 3, 2026 article quotes a **$29.4/kW 2025 fleet nowcast estimate** and $56/kW for 2024. The Houston screen is about 1.83 times the 2025 estimate and 1.82 times the 2024 figure; across the five hubs the 2h, $10/MWh screen is 1.82–2.12× ($53.70–62.25) in 2025 and 1.82–2.00× ($101.88–111.74) in 2024. These are the same order of magnitude, with a substantial explained gap: historical perfect foresight, unconstrained price-taking and assumed qualification differ from fleet operations. The model also omits AS activation energy, mileage, activation degradation, outages and performance penalties. No adjustment was made to force the screen to match the benchmark. This is not a claim that a battery could outperform the fleet by those ratios.

Source: [Modo Energy, Why were ERCOT battery revenues so low in 2025?](https://modoenergy.com/research/why-were-ercot-battery-revenues-so-low-in-2025-weather-energy-arbitrage-builodout). The estimate is not labeled a finalized actual.

Across the five hubs, the same standard 2025 capacity screen ranges from $53.70 to $62.25/kW. Resource-node results are not a fleet benchmark: RHESS2_ESS1 and RUSSEKST_RN reach $191.02 and $187.72/kW, respectively, already earning $179.18 and $175.95/kW from the matched energy-only baseline. Their extreme as-posted energy prices, discussed above, dominate the difference; adding AS does not make those nodes representative of realized fleet revenue.

### Prices, rules and comparison windows

Before Dec 5, 2025 the screen uses hourly DA capacity clearing prices (NP4-188-CD), with awards fixed for each physical UTC hour. From that date it uses settled 15-minute RT capacity prices (NP6-796-ER), without adding DA AS awards or imbalance cash flows. RT AS prices are never silently replaced with DA prices. Pre-RTC regulation/RRS full-hour backing is a conservative screening assumption; ECRS/Non-Spin backing is 2/4 hours. Post-RTC backing is 0.5/0.5/0.5/1/4 hours for RegUp/RegDown/RRS/ECRS/Non-Spin, following NPRR1282 for the changed products. See [the sourced methodology](../docs/ANCILLARY_METHOD.md).

The new Realism chart pairs identical calendar days in Dec 5, 2024–Oct 24, 2025 and Dec 5, 2025–Oct 24, 2026. Houston has 324 pairs. Missing days are removed from both sides, not zero-filled. Both market prices and model duration parameters change across these periods; this is a descriptive comparison, not a causal estimate of RTC+B.

### Numerical validation and runtime

Power and reserve backing are checked at both interval boundaries, including DST days. The AS solver targets a 0.1% MIP gap with a configurable 2-second limit per solve; early cached cases used a longer 10-second limit and/or stricter target. Achieved daily gaps and time limits are recorded. Time-limited feasible values are accompanied by approximate monetary solver ranges in the UI; those ranges exclude forecasting and operational uncertainty. The known feasible energy-only schedule is selected if it improves a bounded AS incumbent, preserving the original dual bound where available.

The complete Houston 2025 2-hour / $10 case took **74.6 seconds** with cached prices in a parallel batch. Each configuration records wall time including checkpoint I/O. Summed configuration times are not elapsed batch time because workers run concurrently; early resumed days with unmeasured time are tagged separately. All raw prices and checkpoints are ignored by Git; only the small manifest and per-selection results are published.

**Full-grid audit** (`python -m scripts.finalize_ancillary`, then `python -m scripts.ancillary_findings`): **180 configurations** (10 locations × 3 years × 1/2/4 h × $0/$10 degradation) covering **61,782 configuration-days**, plus the 50% sensitivity. Every manifest entry matches its file's location, year, duration and degradation; every value is finite; on every day the stack earns at least the matched energy-only solve. 78 incomplete configuration-days are excluded from both strategies: RUSSEKST_RN Jan 1–3, 2024 and Oct 29–30, 2026 at the five nodes (node coverage ends Oct 28; hubs end Oct 24 with no exclusions). 130 daily solves end above the 0.1% target (largest relative gap 1.67%); no day has an unknown bound, and no day needed the energy-only candidate. The widest full-period numerical range is **$0.0154/kW** (CAMWIND_RN 2024, 2h, $0/MWh).

The 180 detail files total **12.2 MiB** (largest 75.6 KiB; manifest 13 KiB). Only the selected file is loaded, or three for the matched RTC+B view. Configuration wall times sum to 32,922 s (median 136 s per configuration) on 6 parallel workers; 354 early resumed days have unmeasured prior time. These are per-configuration measurements, not elapsed batch duration. Software versions and publication time are recorded in the manifests.

## Not done yet
- **More nodes:** the 5 detailed nodes are a sample; section 9 covers every node, but only for one configuration and
  one year, and with summary metrics only.
- **Geocoding:** 46% of nodes are placed (11% only to a county); the top-50 unplaced list awaits hand review
  (`results/geocoding_review_top50.md` → `scripts/location_overrides.json`).
- **Mid-year nodes:** 130 nodes that started during 2025 (80 of them batteries) are not in section 9.
- **Load zones:** excluded because the archive mixes two conflicting series (see README).
- **Ancillary deployment:** section 10 models capacity reservation revenue, but deployment energy, mileage, qualification, outages and penalties remain unmodeled.
