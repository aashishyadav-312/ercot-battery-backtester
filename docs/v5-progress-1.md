# V5 step 1: front door (progress note)

Branch `v5/1-front-door`, PR #49. All of it is behind `?v5=1` (or `VITE_V5=1`). With V5 off nothing visible changes.

Done
- Flag: `V5_DEFAULT_ON = false`, pure `v5Enabled(...)`, `V5`, with unit tests. V5 is off whenever V4 is off.
- CI: `web-v5` job runs `npm test` with `VITE_V4=1 VITE_V5=1`. `vite.config.ts` passes `VITE_V5` to tests (default 0).
- `copy-data.mjs` copies `results/v5/**/*.json`; an empty or missing folder is fine (checked both).
- Nav: four tabs. Research pages live in Learn (`#/learn/research`, `/revenue`, `/charging`, `/reality`, `/method`).
  `#/research...` and every older address redirect there with the query kept. Learn's bar shows Research once, with a second row.
- Home: hero search ("Screen a site"), three figures, hub table, live prices, three entry cards. `siteHash()` in `v5/siteTarget.ts` is the one line Step 4 changes.
- Atlas: Advanced switch (`adv=1`). Off: Revenue pill only, no Cycles/Spread/Corr. hub columns. CSV keeps all columns.
- Tour: V5 drops the Research stop and rewords the Hero and Learn stops.

Decisions
- Home with V5 is a new file (`HomeV5.tsx`); the old Home is untouched except that `HubTable` and `Today` are now exported.
- Home with V5 drops the map, the live chip, and the "keeps" and duration sections. They link to Reality check and finding 3.
- Headline figures are the three the old Home already computed (West hub revenue, share kept, best node vs hub).
- With Advanced off, a lone Revenue pill stays so the control row still says what the map shows.
- Existing tests that describe the old shell now mock `V5: false`, so they pass in both CI jobs.
- Only `.json` files are copied from `results/v5`, as for `results/v4`.

Unverified
- Site guide and Basics copy in Learn still say "Research" is a tab in places; not touched (not in this step).
- Screenshots taken once, dark theme: Home desktop, Atlas mobile.
