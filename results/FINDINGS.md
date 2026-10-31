# Findings: ERCOT hub battery arbitrage, 2024 – 2026 YTD

Model: perfect-foresight energy arbitrage on ERCOT real-time 15-minute settlement point prices.
Each day is solved separately and starts and ends empty. 85% round-trip efficiency. No ancillary
services. 100 MW battery; results are per kW, so size doesn't matter. 2026 data runs through
Oct 24, 2026. Every figure below comes from `results/*.json` (90 runs, listed in `results/index.json`).

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
HB_HOUSTON $39.7 and HB_SOUTH $39.5 per kW-year. That's a 23% gap between hubs. Resource nodes
(not yet run) should spread wider still.

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
- **Resource nodes:** need ERCOT Public API credentials (username, password and subscription key).
  Hubs average many nodes, so nodes will show wider location spreads than finding 2.
- **Load zones:** excluded because the archive mixes two conflicting series (see README).
