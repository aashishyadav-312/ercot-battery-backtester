# Design reference (inspiration only)

Patterns taken from a screenshot of a public ERCOT grid dashboard (gridstatus.io/live/ercot), 
viewed for educational use. **Copy the structure, not the brand:** no logos, names, colors,
copy or code from the source. Our identity is "ERCOT Battery Backtester."

## Layout patterns to borrow
- **Left sidebar** (~240px): grouped nav sections divided by hairlines; icon + label rows; active row
  has a soft gray fill. Utility items (search "Jump to ⌘K", settings) pinned at the bottom.
- **Top bar**: breadcrumb (`Live / ERCOT ⌄ / Conditions`), tab row (Conditions, Pricing, ...) with an
  underline on the active tab; right side has a date pill with ◀ ▶ step buttons and a settings icon.
- **KPI strip**: 4 equal tiles across. Small muted label + live dot, big number, small unit
  (`47,920 MW`). Generous padding, 1px border, light radius, no shadow.
- **Card grid**: 2 columns. Each card has a title at top-left and icon buttons (download, expand,
  location pin) at top-right. Charts fill the card edge to edge, and legends are chips below the chart.
- **Insights row**: horizontal list of short headlines with "time ago" + colored market tags.
- **Tables** (block prices): compact rows, deltas in red/green small text next to values.
- **Hover tooltip**: white card with a timestamp header and a list of colored series dots.

## Map to our pages
| Their element | Ours |
|---|---|
| KPI strip (Load, Net Load, Price, Main Source) | $/kW-yr · Top-10-day share · Cycles/yr · Avg spread captured |
| Fuel mix stacked area | Hour × month dispatch heatmap |
| Price map | Node map colored by $/kW-yr (Phase 8+) |
| Insights row | "Findings" headlines from results/FINDINGS.md |
| LMP step chart | Daily revenue / cumulative revenue with top-10 days marked |
| Block prices table | 1h vs 2h vs 4h and node vs hub table with deltas |
| Date pill ◀ ▶ | Year selector + day stepper on the Dispatch page |

## Where we go more premium (Phase 6, /apple-design)
- One accent color, neutral grays, careful dark mode; tabular numerals for all figures.
- Translucent sticky top bar; spring-eased chart transitions when selectors change.
- A hero sentence stating the headline finding above the KPI strip.
- Skeleton loaders, keyboard command palette (⌘K), reduced-motion support.
