# V5 progress, Step 6: release

**Shipped**
- Review of `8a6f2bc..main` (shell, routes, Atlas Advanced, site report, 12CP engine and block, data files). No fixes needed: V5-off paths keep their old links and copy, rules carry sources and dates, old `#/research/...` and `#/atlas?lat=` addresses resolve.
- Glossary: 12CP, Coincident peak, Site report, Storage nearby (`src/v5/glossary.ts`). Text, sources and the radius come from config. Listed only with V5 on, so the V5-off Glossary is unchanged.
- Method: a lazy `V5Method` section after the V4 one: the 12CP rule, how the model values it, what it ignores, and the EIA-860M data (release, counts, radius) read from the result files.
- Learn > Basics > Site screening: a fourth step, "Read the site report", with V5 on.
- Last commit sets `V5_DEFAULT_ON = true` on its own. Revert it alone to switch V5 off.

**Decided**
- V5 glossary terms are added on the page, not into `GLOSSARY`, so info icons and the V5-off page are untouched.
- The Learn line is a numbered step, matching the section it sits in.
- Did not quote the `src/v5/config.json` note ("The user can change it"): the report has no radius control, so the copy says "a screening choice, not a market rule".

**Checks (once each):** `npm test` 835 passed; `VITE_V4=1 VITE_V5=1 npm test` 835 passed; `npm run build` passed with check-no-fixture; `pytest` 144 passed.
**Screenshots (6, not committed):** Home, site report desktop (dark) and phone, Data Center 12CP, Atlas with Advanced off, Learn > Research. No console errors.

**Unverified / known limits**
- 2026 12CP data has 10 of 12 monthly peaks; the UI says so.
- Links built inside a page (for example the site report's "Open on the Atlas") drop a `v5=` put in the hash. Once V5 is on by default this does not matter; `?v5=0` before the `#` still works everywhere.
- Unit tests still run with V5 off by default (`vite.config.ts`); the web-v5 CI job covers V5 on.
- Storage counts are as good as EIA-860M; planned units may never be built.
