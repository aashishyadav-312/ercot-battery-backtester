# v4 Step 9 progress: Studio panel and Project economics revenue source

Branch `v4/9-studio-ux` (from `main` after PR #46). Two fixes. Status: **done, PR ready** once the full run below is green.

## 1. Sticky inputs panel

- `web/src/pages/Studio.module.css` `.inputs` (used by Studio's Battery panel and by Data Center mode): from 1000px up it is
  `position: sticky`, `max-height: calc(100dvh - var(--app-header-h) - 32px)`, `overflow-y: auto`, `overscroll-behavior: contain`,
  and `scroll-padding-block`. A soft bottom edge shows when more is below: a scroll-attached gradient that a panel-coloured
  cover (attached to the content, `local`) hides once the end is reached. Below 1000px the layout stacks and nothing is sticky
  (it was 900px; the grid and the panel now switch together).
- `web/src/pages/Economics.module.css` `.assumptions`: the Economics Assumptions panel gets the same rules.
- `web/src/shell/panelScroll.ts` `revealFocused`: `onFocus` on the three panels; when the panel overflows, the focused field is
  scrolled to the nearest edge.

## 2. Revenue source on Project economics

- `web/src/v4/revenueSource.ts` (pure): sources, availability, revenue per source, the URL parameters, the line detail.
- `web/src/v4/useEconStack.ts`: loads `v4/stack/index.json`, then the file for the same year, duration and mode.
- `web/src/pages/Economics.tsx`: a "Revenue" pill, Energy | Full stack | Data Center site, next to the existing Perfect foresight /
  Day-ahead plan control. The pill is hidden when only Energy exists. Energy is the default and writes nothing to the URL.
- URL: `rev=stack|dc`, `src=da` (the existing plan control, so Full stack can use the realistic file), `dc=<$/kW-yr>`.
  `state.tsx` `setSel` carries these when the scenario changes on the Economics page. Choice changes use `replaceState`.
- Full stack: needs the index to list the node-year-duration-mode file and the file to have the node. Perfect foresight uses the
  `foresight` file, Day-ahead plan the `realistic` file. Revenue = `total`. The line shows the energy and ancillary parts, the
  YTD or upper-bound tag from `yearTag`, and `AS_UPPER_BOUND_NOTE` for 2023 (not reachable from the Economics year selector
  today, kept for when it is).
- Data Center site: `v4/dc/dcCase.ts` keeps the latest Data Center case total for the session. Data Center mode has a "Use in
  Project economics" link that carries it as `rev=dc&dc=...`. No case, no pill.
- Verdict (bottom note): per source; on Energy with NPV below zero and a Full stack option it ends with "Full stack revenue is
  available for this scenario: try it in the Revenue switch above."
- Alert text names the source.

## Decisions to check

- Cycles per year (used only for levelized cost) stay at the energy value for Full stack and Data Center site.
- Data Center site uses the case's $/kW-yr as is. Installed cost still follows the selected duration, which can differ from the
  case's MWh/MW; the line says so.
- Full stack uses the existing foresight/day-ahead control for the stack mode (no second control).

## Tests

- `src/shell/stickyPanel.test.tsx`: the sticky styles of both panels, the 1000px threshold, the fade, the focus reveal.
- `src/v4/revenueSource.test.ts`: availability, revenue and NPV per source, URL round trip, verdict.
- `src/pages/Economics.v4.test.tsx`: the page with real fixture stack files: each source recomputes NPV, URL round trip, pill
  hidden when data is missing, Data Center site hidden without a case.

## Resume

```
cd web
npx vitest run src/shell/stickyPanel.test.tsx src/v4/revenueSource.test.ts src/pages/Economics.v4.test.tsx
npm test
npm run build
```

Screenshots: `web/screenshots/studio-desktop-light-v4-9.png`, `studio-phone-light-v4-9.png`, `economics-desktop-light-v4-9.png`.
