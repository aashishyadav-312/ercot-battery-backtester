# ERCOT Battery Backtester: web

Static dashboard (Vite, React, TypeScript, Mantine, Apache ECharts) over the committed backtest results.

```bash
cd web
npm install
npm run dev          # copies ../results/*.json to public/data, then serves
npm run build        # type-checks and builds to dist/ (relative URLs, works under any sub-path or in an iframe)
PW_CHROMIUM_PATH=/path/to/chromium npm run screenshots   # needs a build; writes screenshots/*-after.png
```

- `public/data/` is generated from `../results/` by `scripts/copy-data.mjs` (git-ignored).
- The URL hash holds the page and the selectors, e.g. `#/compare?loc=RUSSEKST_RN&dur=2&year=2025&deg=10`.
- Pages: Start here, Map, Overview, Revenue, Dispatch, Compare, Realism, Method, About. Every card has a CSV download and an expand button.
- A data-quality note appears when a run's best day is more than 20% of its revenue (`src/components/DataQuality.tsx`).
  Known explanations for specific runs live in `src/data/data-notes.json` (location → year → text), not in code.
- Each page leads with one hero sentence for the current selection (`src/data/hero.ts`), e.g.
  "Ten days earned 21% of this battery's 2025 revenue."
- `src/components/Chart.tsx` is the one ECharts wrapper (SVG renderer). Selector changes merge into the
  live chart, so values animate from where they are; the previous run stays on screen while the next loads.

### Design system
All styling goes through the Mantine theme: `src/theme.ts` (colours, type scale, spacing, radius, shadows,
component defaults) and `src/theme.module.css` (hover/press states, the translucent header, skeleton sheen,
media queries), wired in via `classNames`. `src/styles.css` holds only global base rules.
- **Type:** Inter Variable with its optical-size axis (`@fontsource-variable/inter/opsz.css`, self-hosted).
  Scale 12 / 13 / 15 / 17 / 20 px, headings 20–40 px with tracking tightened as size grows. Every displayed
  figure (KPIs, tables, selectors, charts, tooltips) uses tabular numerals; running prose keeps proportional ones.
- **Colour:** warm neutral grays plus one accent (blue `#2a78d6` light / `#3987e5` dark), which is also
  chart series 1. The chart palette (blue, orange, aqua, violet) is validated for colour-vision deficiency
  against the white card in light mode and `#1a1a19` in dark mode. Hubs use a neutral `baseline` gray (≥3:1).
- **Motion:** page enter (rise + fade), chart value transitions, skeleton sheen, press feedback on icons.
  `prefers-reduced-motion` turns chart animation off, keeps only fades, and stops the sheen;
  `prefers-reduced-transparency` and `prefers-contrast` make the header solid.

### Start here (Phase 10)
`src/pages/Start.tsx` is the first nav item (`#/start`). Overview shows a one-time banner to first-time visitors; dismissal is
remembered in `localStorage` key `ebb-start-seen` (every read and write is in try/catch, so blocked storage only means it shows again).
- The one-day walkthrough reads `results/walkthrough.json` (13 featured days at Houston Hub, 2025: the ten best, a typical, a quiet and
  the most negative-price day). Rebuild it with `python -m scripts.build_walkthrough`; it re-solves each day and refuses to write if the
  revenue differs from the stored year run. Step text is generated from the data in `src/data/walkthrough.ts`.
- Page cards use thumbnails in `public/thumbs/` (regenerate with `node scripts/make-thumbs.mjs` after a build).
- `node scripts/check-start.mjs` checks the two-click path, banner persistence (including blocked storage), the walkthrough controls and
  console errors, and writes the `*-p10-after.png` screenshots. Set `PW_CHROMIUM_PATH` if Playwright's own browser is not installed.
- Issue form for feature requests: `.github/ISSUE_TEMPLATE/feature_request.yml` (the "Suggest a feature" link works once it is on `main`).

### Map page
`#/map` draws Texas counties with ECharts' `geo` component (no mapping library). `scripts/build-texas.mjs` cuts Texas out of
`us-atlas` (Census boundaries) into `public/data/texas.json`; `results/locations.json` supplies coordinates. The page is
lazy-loaded so the geo component stays out of the main bundle. Markers: size = $/kW-yr, colour = capture rate, for the
selected duration, year and degradation. Rebuild the locations file with `python -m scripts.build_locations`; every match
and every node that could not be geocoded is listed in `results/geocoding_log.md`. Hubs sit at a representative city.
