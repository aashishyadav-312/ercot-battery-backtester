// Screenshots every page at desktop and phone width from the production build.
// Usage: npm run build && npm run screenshots
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'screenshots');
mkdirSync(out, { recursive: true });

const PORT = 4173;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const base = `http://localhost:${PORT}/`;
const pages = ['overview', 'revenue', 'dispatch', 'compare', 'method'];
const sizes = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

// Set PW_CHROMIUM_PATH to use a pre-installed Chromium (e.g. in CI or cloud containers).
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const problems = [];
try {
  for (const [name, viewport] of Object.entries(sizes)) {
    for (const scheme of ['light', 'dark']) {
      if (scheme === 'dark' && name === 'phone') continue; // dark checked at desktop plus phone overview below
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: name === 'phone' ? 2 : 1, hasTouch: name === 'phone' });
      const page = await ctx.newPage();
      page.on('console', (m) => m.type() === 'error' && problems.push(`${name}/${scheme} console: ${m.text()}`));
      page.on('pageerror', (e) => problems.push(`${name}/${scheme} pageerror: ${e.message}`));
      for (const p of pages) {
        if (scheme === 'dark' && !['overview', 'dispatch'].includes(p)) continue;
        await page.goto(`${base}#/${p}?loc=HB_HOUSTON&dur=2&year=2025&deg=10`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1200);
        // horizontal overflow check (phone must not scroll sideways)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 1) problems.push(`${name}/${p}: horizontal overflow ${over}px`);
        await page.screenshot({ path: join(out, `${p}-${name}-${scheme}.png`), fullPage: true });
      }
      if (scheme === 'light') {
        // data-quality note + node vs hub for a volatile node
        await page.goto(`${base}#/overview?loc=RHESS2_ESS1&dur=2&year=2025&deg=10`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1200);
        await page.screenshot({ path: join(out, `data-quality-${name}.png`), fullPage: true });
        await page.goto(`${base}#/compare?loc=RUSSEKST_RN&dur=2&year=2025&deg=10`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1200);
        await page.screenshot({ path: join(out, `compare-node-${name}.png`), fullPage: true });
        if (name === 'desktop') {
          await page.goto(`${base}#/overview?loc=HB_HOUSTON&dur=2&year=2026&deg=10`);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(800);
          await page.getByRole('button', { name: /Expand Dispatch pattern/ }).click();
          await page.waitForTimeout(1200);
          await page.screenshot({ path: join(out, 'expanded-heatmap-desktop.png') });
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no console errors or horizontal overflow');
