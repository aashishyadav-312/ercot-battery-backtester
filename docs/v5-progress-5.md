# V5 Step 5: 12CP switch in Data Center mode

**See it:** `?v5=1` plus `#/studio?mode=dc&loc=HB_WEST&year=2025` (add `&tcos=12cp` for the proposed rule). V5 off is unchanged: no control, no comparison, `tcos` ignored and never written.

**What changed**
- `tcos=4cp|12cp` in the Data Center address (default 4CP, left out of links). A "Transmission charge" control sits above Advanced.
- With V5 on the worker runs `runTwelveCpCase` once (baseline, 4CP, 12CP). Both outcomes come back, so switching the rule picks one and does not solve again. The 4CP result is `runDataCenterCase(input)` unchanged.
- `v5/TcosBlock.tsx`: both rules side by side (avoided $/kW-yr and $/yr, alert days, energy given up, net value) and a note from `twelvecp_rules.json` (status, method, caveats, sources, as-of date, collapsed "what the model ignores").
- The selected rule drives the headline, breakdown bar, dispatch chart, 4CP/12CP table and the "Use in Project economics" link. CSV and the print sheet always carry both rows.
- Economics: `tcos=12cp` rides in the link when `rev=dc`; the page names the rule. `$/kW-yr` is the selected rule's total.
- `loadTwelveCp` in `data/loader.ts`. No changes to the site report files.

**Decisions**
- Switching rules is instant because one run holds both. Cost: three solves per change instead of one (about 3x the V5 solve time).
- An incomplete year (2026) shows "10 of 12 peaks (Jan to Oct)" on the 12CP card and nothing is extrapolated.
- If the 12CP file fails to load, the page shows 4CP only and says so.
- The optional minimum billing demand from Step 2 has no control here. The note says 12CP assumes billing on 12CP demand and can leave a cut worth nothing.
- "Project economics ... CSV and print include both rows" read as the Data Center CSV and print sheet; Economics has no CSV of its own.

**Unverified**
- 12CP uses the 4CP rate x 4 / 12 (same annual amount); a rebased rate is not modelled. Foresight 12CP may overstate (hourly peaks). Both are in the note.
- Print layout was not eyeballed, only tested for the two rows.
