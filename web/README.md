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
- Pages: Overview, Revenue, Dispatch, Compare, Method. Every card has a CSV download and an expand button.
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
