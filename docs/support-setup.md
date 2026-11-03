# Support bar setup

The Support popover reads `GET /support/total` and `GET /support/zelle` from the live Worker (`worker/`), and Ko-fi
posts payments to `POST /support/kofi`. Only one-time USD Ko-fi tips are counted automatically; Venmo, Zelle and
Buy Me a Coffee gifts are added by hand. No names, emails or messages are stored.

Run these from `worker/`.

1. Create the KV namespace, then paste the printed `id` into `wrangler.toml` in place of `REPLACE_WITH_SUPPORT_KV_ID`
   (the `SUPPORT_KV` binding is already declared there):

   ```bash
   npx wrangler kv namespace create SUPPORT_KV
   ```

2. Secrets (each command prompts for the value; never commit them):

   ```bash
   npx wrangler secret put KOFI_VERIFY_TOKEN
   ```

   ```bash
   npx wrangler secret put ZELLE_NUMBER
   ```

   For `KOFI_VERIFY_TOKEN`, copy the verification token from Ko-fi › Settings › API › Webhooks (step 4).

3. Variables in `wrangler.toml` `[vars]` (already set; change if needed): `GOAL_USD = "210"` and
   `ALLOWED_ORIGIN = "https://aashishyadav-312.github.io"` (the site origin; the only origin that can read the total
   or the Zelle number from a browser). Then deploy:

   ```bash
   npx wrangler deploy
   ```

4. In Ko-fi › Settings › API › Webhooks, set the webhook URL to
   `https://ercot-live.aashishyadav312.workers.dev/support/kofi` and copy the verification token into step 2.

5. On the same Ko-fi page, send a test payment, then check the total (a test donation counts like a real one; remove
   it afterwards with `npx wrangler kv key delete --binding SUPPORT_KV --remote "don:<id>"`, the id shown by
   `npx wrangler kv key list --binding SUPPORT_KV --remote --prefix don:`):

   ```bash
   curl https://ercot-live.aashishyadav312.workers.dev/support/total
   ```

6. Add a gift made another way (amount in cents, one key per gift):

   ```bash
   npx wrangler kv key put --binding SUPPORT_KV --remote "manual:2026-11-02-venmo" "1500"
   ```

Non-USD Ko-fi payments are kept under `review:<id>` and not counted; add them by hand as a `manual:` entry after
conversion if you want them on the bar.
