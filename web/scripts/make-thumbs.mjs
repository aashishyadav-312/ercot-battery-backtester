// Writes the page thumbnails shown on the "Start here" page (public/thumbs/{page}-{light|dark}.webp, 640x400)
// from a production build. Each is the top of the page at 1440x900 with the default selection, scaled down.
//
// Usage:  npm run build && node scripts/make-thumbs.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(here, 'public', 'thumbs');
mkdirSync(out, { recursive: true });
const PORT = 4175;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const PAGES = ['overview', 'revenue', 'dispatch', 'compare', 'realism', 'method'];
const query = { compare: 'loc=RUSSEKST_RN&dur=2&year=2025&deg=10' };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
let n = 0;
try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    // Keep the "new here" banner out of the Overview thumbnail.
    await ctx.addInitScript(() => { try { localStorage.setItem('ebb-start-seen', '1'); } catch { /* ignore */ } });
    const page = await ctx.newPage();
    const work = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`http://localhost:${PORT}/#/${p}?${query[p] ?? 'loc=HB_HOUSTON&dur=2&year=2025&deg=10'}`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1600);
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } });
      // Downscale in the browser (high-quality smoothing) and export as WebP.
      const dataUrl = await work.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 640; c.height = 400;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, 640, 400);
        return c.toDataURL('image/webp', 0.86);
      }, png.toString('base64'));
      writeFileSync(join(out, `${p}-${scheme}.webp`), Buffer.from(dataUrl.split(',')[1], 'base64'));
      n++;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`${n} thumbnails written to ${out}`);
