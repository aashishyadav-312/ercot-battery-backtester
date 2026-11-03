// Writes the pictures on Learn > Site guide (public/images/site-guide/{home,atlas,studio,research}.webp, 640x400, light theme)
// from a production build. Each is the top of the page at 1440x900 with the default selection, scaled down.
// Every file must stay under 80 kB.
//
// Usage:  npm run build && npm run site-guide-images      (set PW_CHROMIUM_PATH to use an installed browser)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(here, 'public', 'images', 'site-guide');
mkdirSync(out, { recursive: true });
const PORT = 4175;
const server = spawn(process.execPath, [join(here, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const PAGES = { home: 'home', atlas: 'atlas', studio: 'studio', research: 'research' };
const MAX = 80 * 1024;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
let n = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  // Keep the first-visit tour off Home.
  await ctx.addInitScript(() => { try { localStorage.setItem('chargeline-tour-done', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  const work = await ctx.newPage();
  for (const [name, route] of Object.entries(PAGES)) {
    await page.goto(`http://localhost:${PORT}/#/${route}?loc=HB_HOUSTON&dur=2&year=2025&deg=10`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2200);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } });
    let bytes;
    for (const q of [0.82, 0.72, 0.62, 0.52, 0.42]) {
      const dataUrl = await work.evaluate(async ([b64, quality]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 640; c.height = 400;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, 640, 400);
        return c.toDataURL('image/webp', quality);
      }, [png.toString('base64'), q]);
      bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      if (bytes.length < MAX) break;
    }
    if (bytes.length >= MAX) throw new Error(`${name}.webp is ${bytes.length} bytes, over 80 kB`);
    writeFileSync(join(out, `${name}.webp`), bytes);
    console.log(`${name}.webp ${(bytes.length / 1024).toFixed(1)} kB`);
    n++;
  }
  await ctx.close();
} finally {
  await browser.close();
  server.kill();
}
console.log(`${n} pictures written to ${out}`);
