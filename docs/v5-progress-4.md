# V5 step 4: site report (progress note)

Branch `v5/4-site-report`. All behind `?v5=1`. With V5 off `#/site` is an unknown address and opens Home, as before.

Done
- Route `#/site?lat=&lon=&dur=&year=[&basis=stack][&mode=foresight]` (V5 only), page in `web/src/v5/site/`. Atlas tab stays marked; no view bar.
- Sections: Where, Battery value, Storage nearby (hidden if `tx_batteries.json` is missing or odd), For a data center, Limits. Actions: Copy link, CSV, Print, Open in Studio, Open on the Atlas.
- The address is rewritten with the settings once loaded (replaceState), other parameters such as `v5=1` kept, so a pasted link gives the same page.
- Home search now goes to `#/site` (`siteHash`). The Atlas card gets an "Open site report" link under V5.
- Empty and error states: no point in the address, point outside Texas, no priced node near the point, load error, loading.

Reuse
- Moved the settings pills, range figure and year strip out of `SiteCard` into `v4/site/SiteParts.tsx`; the card and the report both render them. `SitePrint` takes an optional Storage nearby block. V4 card output is unchanged (its tests pass).

Decisions
- No locator map: the Atlas map component needs many props, not cheap to reuse.
- Title is the county name (from the point), with nearest city and hub below. The address carries no place name.
- Atlas "Pick a site" keeps its card and gains the link; it does not navigate away on a pick.
- Year picker is the by-year strip. Strategy pills (Day-ahead plan, Perfect foresight) stay, as on the card; `mode=foresight` is written only when not the default.
- CSV: Storage nearby is a second table under the V4 rows, with its own header rows.
- Storage radius is 40 km, the Step 3 `assumption: true` value, and the page says it is a screening choice.
- Data center section has no numbers and one button (`dcLinkFromSite`).

Unverified
- Print layout checked only by its markup and tests, not in a print dialog.
- Screenshots taken once, light theme, desktop and mobile (not committed).
