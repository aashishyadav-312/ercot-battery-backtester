// Builds public/og-image.png (1200x630) for Open Graph / Twitter cards from the Overview screenshot.
// Usage: npm run build && npm run screenshots -- --pages overview && node scripts/make-og-image.mjs [path/to/overview.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || join(here, 'screenshots', 'overview-desktop-light-p9-after.png');
const shot = readFileSync(src).toString('base64');

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#0f1a2b;font-family:Inter,system-ui,sans-serif;color:#fff;position:relative;overflow:hidden}
  .copy{position:absolute;left:56px;top:56px;width:1088px}
  h1{font-size:54px;font-weight:700;letter-spacing:-0.02em}
  p{font-size:26px;line-height:1.35;color:#c4d0e4;margin-top:12px;max-width:900px}
  .frame{position:absolute;left:56px;top:238px;width:1088px;height:392px;border-radius:14px 14px 0 0;overflow:hidden;
         box-shadow:0 0 0 1px rgba(255,255,255,.14),0 20px 60px rgba(0,0,0,.5);background:#f4f4f2}
  .frame img{width:1088px;display:block}
  .tag{position:absolute;right:56px;top:62px;font-size:20px;color:#8fb4ee}
</style>
<div class="copy"><h1>ERCOT Battery Backtester</h1><p>What a battery could have earned at each ERCOT location, 2024 to 2026, and what drove it.</p></div>
<div class="frame"><img src="data:image/png;base64,${shot}"></div>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
writeFileSync(join(here, 'public', 'og-image.png'), await page.screenshot({ type: 'png' }));
await browser.close();
console.log('wrote public/og-image.png');
