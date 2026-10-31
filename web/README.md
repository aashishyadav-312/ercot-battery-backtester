# ERCOT Battery Backtester: web

Static dashboard (Vite, React, TypeScript, Mantine, Apache ECharts) over the committed backtest results.

```bash
cd web
npm install
npm run dev          # copies ../results/*.json to public/data, then serves
npm run build        # type-checks and builds to dist/ (relative URLs, works under any sub-path or in an iframe)
PW_CHROMIUM_PATH=/path/to/chromium npm run screenshots   # needs a build; writes screenshots/
```

- `public/data/` is generated from `../results/` by `scripts/copy-data.mjs` (git-ignored).
- The URL hash holds the page and the selectors, e.g. `#/compare?loc=RUSSEKST_RN&dur=2&year=2025&deg=10`.
- Pages: Overview, Revenue, Dispatch, Compare, Method. Every card has a CSV download and an expand button.
- A data-quality note appears when a run's best day is more than 20% of its revenue (`src/components/DataQuality.tsx`).
- `src/components/Chart.tsx` is the one ECharts wrapper; chart colours come from `src/theme.ts` (accent blue plus a validated categorical set).
