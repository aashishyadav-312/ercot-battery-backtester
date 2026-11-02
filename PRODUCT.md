# Product

<!-- impeccable:product-schema 1 -->

<!-- Written from docs/REDESIGN.md, README.md and results/FINDINGS.md at the owner's direction, without the init interview.
     Anything not stated in those files is left out or marked undecided. -->

## Platform

web

## Users

Energy professionals and analysts who want to know what a battery could have earned at a given ERCOT location and what drove the number. Hiring managers and other reviewers who want to see rigor in how the number was produced. They arrive from a shared link, often on a phone first, and judge the work by whether each figure can be traced to its source.

## Product Purpose

Chargeline is an ERCOT battery revenue backtest. It answers one question: how much could a price-taking battery have earned at a given ERCOT hub or resource node, and what drove that number. It replays ERCOT public prices through a daily optimization, reports the perfect-foresight revenue as an upper bound next to what a day-ahead schedule settled in real time would have kept, and shows where and when the money was made. Success is a reader who can state the number, its assumptions and its limits, and who trusts it because the page shows where it came from.

## Positioning

The model, the data and the results are open in the repository: every figure on screen is loaded from a results file or computed from one, never typed in. The same daily optimization runs in the visitor's browser (a highs-js port that matches the Python reference within 0.5%), so a visitor can test their own battery rather than read a screenshot. A neighboring site that publishes only headline numbers cannot truthfully say that.

## Operating Context

- Public static site on GitHub Pages with hash routing; results are precomputed JSON copied into the build.
- A monthly workflow refetches the current year for the detailed locations and opens a pull request; merging redeploys the site. The all-node run is a yearly local job.
- A Cloudflare Worker refreshes a live snapshot of real-time and day-ahead prices every five minutes; the site reads that snapshot for the ticker and the live view.
- Prices are ERCOT public data. The author is an independent student, not affiliated with ERCOT or any company.

## Capabilities and Constraints

- Locations: five hubs and a set of resource nodes with detailed runs, plus every resource node in a summary file for the map. Durations, years and degradation costs are precomputed; other inputs are solved in the browser (energy only, no ancillary services in that path).
- Strategies: perfect foresight (an upper bound no operator can reach) and a day-ahead schedule settled at real-time prices (the realistic figure), with a separate energy plus ancillary capacity screen.
- Data caveats that the interface must keep visible: only some resource nodes have coordinates, and the rest are counted and listed, never silently dropped; a node whose location is flagged for manual review is labelled "location under review"; hub revenue differs by source (detailed runs versus bulk all-node files), so each comparison names one source.
- Claims stay descriptive, not causal. The RTC+B comparison shows what changed, not why. Results are illustrative models, not a forecast or investment advice.
- Numbers on screen come from loaded results or computed values. Literals are limited to labels, units and copy.
- Old URLs keep working: every earlier hash route redirects to its new home.
- Undecided: where the Economics page lives long term (it stays under Studio until the Research and Guide step); the social preview image (still the old one until the release check).

## Brand Commitments

- The product is named Chargeline. Top-level navigation is Home, Atlas, Studio, Research, Guide, under a live price ticker.
- Tone: data first, calm, precise. Not a marketing site.
- Binding anti-references: AI-default gradients (purple or otherwise), blue-and-white, cards with a colored left border, emoji.

## Evidence on Hand

- `results/*.json`: per-run results (`results/index.json` lists them), node summaries (`results/nodes_2025_2h.json` and siblings), `ancillary.json`, `rtcb.json`, `context.json`, `locations.json`, `walkthrough.json`, price files and a Python parity reference.
- `results/FINDINGS.md`: the written findings with their tables, and `results/geocoding_log.md` for node locations.
- Validation against published benchmarks, cited on the Method page.
- Not available and not to be invented: testimonials, customer names, user counts, forecasts, or any revenue claim that is not in a results file.

## Product Principles

- Show the source. Every number can be traced to a results file, a computation or a stated assumption.
- Say what a number is not. Upper bounds are labelled as such, and descriptive findings are not given causes.
- Missing is shown as missing. Unavailable live prices, unplaced nodes and nodes under review are stated in the interface, not hidden or filled in.
- Let the reader test it. Presets are instant and anything else runs in the browser, so the reader can check the claim on their own inputs.
- Calm over loud. The data carries the page; the interface stays out of its way.

## Accessibility & Inclusion

- WCAG 2.2 AA is the standard, in both light and dark themes: 4.5:1 text contrast, visible focus, real buttons and links, touch targets of at least 44px.
- Reduced motion is respected: nothing moves under `prefers-reduced-motion`, and moving content (the ticker) has a pause control.
- Every map has a keyboard-reachable list alternative.
- Phone widths are first-class; wide tables scroll inside their own box rather than the page.
