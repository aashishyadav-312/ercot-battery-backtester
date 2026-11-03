## Step 10: Support button, popover and progress bar

Model: Opus 5.5, high. Branch: `polish/10-support`. Standalone: save as `docs/STEP_10_SUPPORT.md` and run it in a fresh
session with "Read docs/STEP_10_SUPPORT.md and do it." Do not merge. Do not deploy the Worker or set secrets.

### Efficiency rules (these override anything in other plan files)

- Read only what you need: the header component, the theme toggle, the Worker entry and its test setup, the shared money
  formatter, the Learn › About page, and the footer. Use grep to find them. Do not read the rest of the repo or other
  plan files.
- Do not run an impeccable audit or critique, a full accessibility audit, or a full-site screenshot sweep.
- Screenshots: exactly 3 at the end, 1440px wide, with the screenshot script limited to this page set: (1) header with
  the button, dark; (2) open popover, light; (3) the header at 390px. Attach the popover one to the PR. No other
  screenshots, no before/after pairs.
- Tests: write only the tests listed below. While working, run only the new test files. Run the full `npm test`, the
  build and the Worker tests once at the end.
- Make edits in as few tool calls as possible: write each new file in one go, batch related edits.
- Do not re-read files you just wrote. Do not narrate. The final report is at most 12 lines: what changed, test result,
  anything I must do, anything you skipped.

### Facts (do not change)

| Item | Value |
|---|---|
| Goal | $210, a Worker variable `GOAL_USD` |
| Card and Apple Pay | https://ko-fi.com/x0aashish |
| Venmo | https://venmo.com/u/x0aashish , shown as `@x0aashish` |
| Buy Me a Coffee | https://buymeacoffee.com/x0aashish |
| Zelle | Worker secret `ZELLE_NUMBER` only. Never in the repo, this file, the built site or logs. |

Only Ko-fi payments reach the bar automatically. Venmo, Zelle and Buy Me a Coffee gifts are added by hand.

### A. Worker (follow the existing Worker's structure and test setup; new KV binding `SUPPORT_KV`)

1. `POST /support/kofi`
   - Form-encoded body with a `data` field holding JSON. First read Ko-fi's current webhook docs and confirm the exact
     field names (event type, verification token, amount, currency, unique id). Do not guess; if the docs cannot be
     reached, stop and ask me for a sample payload.
   - Constant-time compare of the token with secret `KOFI_VERIFY_TOKEN`; mismatch returns 401 and stores nothing.
   - Count only one-time "Donation" events in USD. Ignore the rest and still return 200. Store non-USD under
     `review:<id>`, not counted.
   - Store each counted payment as its own key `don:<unique id>` holding integer cents and a timestamp. No names, emails
     or messages are ever stored or returned. This makes retries idempotent without read-modify-write.
2. `GET /support/total`: `{ raised, goal, updated }`, where raised is the sum of `don:` and `manual:` keys in dollars
   (handle key-list pagination). CORS only for the site origin (config). Cache 60 seconds. On KV failure return 503
   with no details.
3. `GET /support/zelle`: returns `{ zelle }` only when the `Origin` header equals the site origin, else 403;
   `Cache-Control: no-store`; 404 if the secret is unset; never log it.
4. Manual entries use `wrangler kv key put --binding SUPPORT_KV "manual:<date>-<label>" "<cents>"`. No admin route.
5. Worker tests (fake data only): valid token adds a donation; bad token returns 401 and stores nothing; the same id
   twice counts once; non-USD and non-donation are not counted; total sums `don:` and `manual:`; Zelle returns 403 on a
   wrong origin; responses never contain a name, email or message.

### B. Site

- Header: a "Support" button immediately left of the theme toggle. 44px high, pill, outlined in `--line2`, text in
  `--text`, small amber inline heart icon (`aria-hidden`). Under 640px it becomes icon-only with
  `aria-label="Support Chargeline"`; the tabs must still fit at 320px and 390px.
- Mantine Popover (non-modal dialog), anchored to the button. Esc closes; focus goes in on open and returns on close.
  On phones it docks to the bottom. Motion: opacity and scale from 0.96, 200ms, origin at the button; opacity only under
  reduced motion.
- Config: goal, Ko-fi, Venmo and Buy Me a Coffee URLs in one config file. Base URL for the Worker from the existing
  live-feed setting. Use the shared money formatter. No third-party scripts, no embedded widgets, no analytics.

Popover copy (exact):

- Title: `Support Chargeline`
- `Chargeline cost $210 in AI credits to build. Any amount helps cover it. Nothing is promised in return.` (the $210
  comes from the Worker's goal value, not typed)
- Progress bar: `role="progressbar"` with `aria-valuemin=0`, `aria-valuemax` the goal, `aria-valuenow` the raised
  amount capped at the goal, label `$<raised> of $<goal>`. Fill grows with `transform: scaleX`, 700ms,
  `cubic-bezier(.23,1,.32,1)`, none under reduced motion. Amber fill on `--track`.
- Primary amber button, full width: `Card or Apple Pay`, small line `via Ko-fi`. Opens in a new tab with
  `rel="noopener noreferrer"`.
- Small line: `Apple Pay shows at checkout on Apple devices in Safari. On Ko-fi you can leave a message or stay anonymous.`
- `Other ways`, three plain rows: `Venmo` (`@x0aashish`, link); `Zelle` with a `Show number` button that fetches
  `/support/zelle`, then shows the number with a `Copy` button and an `aria-live="polite"` "Copied" message (remove the
  row if the fetch fails or returns 404); `Buy Me a Coffee` (link).
- Small line: `Venmo, Zelle and Buy Me a Coffee gifts are added to the bar by hand.`
- Fine print: `This is a personal gift to the author, not a charity donation, and is not tax-deductible.`
- States: loading shows the track with a neutral label and usable buttons; if `/support/total` fails, hide the bar and
  amount and keep the buttons; at or above the goal show `Goal reached. Thank you.` instead of the bar and keep the links.
- Also add: one short paragraph plus a `Support` button that opens the same popover in Learn › About (below the contact
  links), and a `Support` text link in the footer. No tour step, no header tab.

### C. Site tests (only these)

Bar math (0, partial, over goal capped at 100%) and label; goal-reached and error states; Zelle reveal success and
failure; Esc closes and focus returns. After the build, search `dist/` once for the pattern
`[0-9]{3}[-. ]?[0-9]{3}[-. ]?[0-9]{4}` and report hits (there must be none caused by the Zelle number).

### D. Docs and PR

Write `docs/support-setup.md` (short) with the exact commands I must run: create the KV namespace and binding; `wrangler
secret put KOFI_VERIFY_TOKEN`; `wrangler secret put ZELLE_NUMBER`; set `GOAL_USD` and the site-origin variable; deploy;
in Ko-fi set the webhook URL to `<worker>/support/kofi` and copy the verification token; send a test payment; check
`curl <worker>/support/total`; how to add a manual entry. Open the PR with a description that lists those steps.

Done when: new tests, the full test run, the Worker tests and the build all pass; `docs/support-setup.md` exists; the
popover works against a mocked Worker locally; 3 screenshots taken.
