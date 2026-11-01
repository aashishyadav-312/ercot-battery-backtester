# Screenshots: Phase 5 (before) vs Phase 6 (after)

Every file comes in a pair: `<view>-<width>-<scheme>-before.png` is the Phase 5 dashboard,
`…-after.png` is the Phase 6 design pass. Both sets were taken by the same script
(`scripts/screenshots.mjs`) against production builds, with the same URLs and data.

- **Widths:** `desktop` = 1440 px, `phone` = 390 px (2× pixel density, touch).
- **Schemes:** `light` and `dark`.
- **Views:** `overview`, `revenue`, `dispatch`, `compare`, `method` (HB_HOUSTON, 2-hour, 2025,
  $10/MWh), plus `data-quality` (RHESS2_ESS1 2025, the run that trips the note),
  `map` and `map-node` (Map page; RUSSEKST_RN selected; suffix `p11-after`), `compare-node` (RUSSEKST_RN vs its hub) and `expanded-heatmap` (desktop, HB_HOUSTON 2026 YTD).

Regenerate:

```bash
npm run build && PW_CHROMIUM_PATH=/path/to/chromium npm run screenshots          # *-after.png
node scripts/screenshots.mjs --suffix before --root /path/to/phase-5/checkout/web  # *-before.png
```

The script also fails loudly on console errors and on any sideways scrolling.
