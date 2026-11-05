# v4 Step 7 progress: Data Center mode (D)

Branch `claude/step-7-site-value-4cp-0sm1u4`. Plan: `docs/PLAN_V4.md` Step 7. Status: **in progress**.

## Audit

- Engine: `web/src/custom/datacenter.ts` `runDataCenterCase` (Step 2). Rules: `web/src/custom/config/datacenter_rules.json`.
- 4CP files: `results/v4/fourcp/<year>.json`, served at `data/v4/fourcp/` by `copy-data.mjs` (already copies `results/v4/`).
- Stack: `results/v4/stack/index.json` lists the Step 1 files; `loadStackIndex` and `parseStackIndex` read it.
- Studio: `web/src/pages/Studio.tsx`, hash route `#/studio?...`. Site card: `web/src/v4/site/SiteCard.tsx`.

## Plan

- `web/src/v4/dc/`: form model (pure), Web Worker + client, view, CSS, tests.
- Studio shows Data Center mode for `#/studio?mode=dc...` when V4 is on.
- Site card: "Data Center mode" action with the site and nearest node prefilled.

## Resume

```
cd web && npm ci && npx vitest run src/v4/dc
```
