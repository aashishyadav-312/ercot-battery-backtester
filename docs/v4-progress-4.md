# V4 Step 4 progress: map context and place search

Branch `v4/4-map`. Status: in progress.

## Done
- `web/src/v4/map/view.ts`, `labels.ts`: zoom and pan, county paths, click to lat/long, city label layout (pure, tested).
- `web/src/v4/map/AtlasSite.tsx`, `SiteSearch.tsx`, `AtlasSite.module.css`: the V4 wrapper around the Atlas map.
- `AtlasMap.tsx` takes one optional `v4` prop; `Atlas.tsx` loads the wrapper lazily only when `V4` is on.

## Left
- Component tests, screenshots, full test run, PR ready.

## Resume
- `cd web && npx vitest run src/v4 src/pages/Atlas.test.tsx`; view with `VITE_V4=1 npm run dev` or `?v4=1`.
