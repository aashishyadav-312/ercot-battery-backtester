// Screenshots every page at 1440px and 390px, light and dark, from a production build, and
// checks for console errors and sideways scrolling.
//
// Usage:  npm run build && npm run screenshots                 -> screenshots/*-after.png
//         node scripts/screenshots.mjs --suffix before --root /path/to/other/web/checkout
//
// --root   web/ directory whose dist/ is served (default: this one)
// --suffix appended to every file name (default: after), so runs of two versions sit side by side
// --pages  comma-separated subset of pages (e.g. --pages realism); skips the extra node/expanded shots
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const root = resolve(arg('root', here));
const suffix = arg('suffix', 'after');
const out = join(here, 'screenshots');
mkdirSync(out, { recursive: true });

const PORT = Number(arg('port', 4173));
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const base = `http://localhost:${PORT}/`;
const ALL_PAGES = ['start', 'map', 'overview', 'revenue', 'dispatch', 'compare', 'realism', 'economics', 'method'];
const only = arg('pages', '');
const pages = only ? only.split(',') : ALL_PAGES;
const sizes = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const name = (...parts) => join(out, `${parts.join('-')}-${suffix}.png`);

// Set PW_CHROMIUM_PATH to use a pre-installed Chromium (e.g. in CI or cloud containers).
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const problems = [];
let shots = 0;

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1400); // let chart enter animations finish
}
async function overflow(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) problems.push(`${where}: horizontal overflow ${over}px`);
}

try {
  for (const [size, viewport] of Object.entries(sizes)) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport, colorScheme: scheme, deviceScaleFactor: size === 'phone' ? 2 : 1, hasTouch: size === 'phone', isMobile: size === 'phone',
      });
      const page = await ctx.newPage();
      const tag = `${size}/${scheme}`;
      page.on('console', (m) => m.type() === 'error' && problems.push(`${tag} console: ${m.text()}`));
      page.on('pageerror', (e) => problems.push(`${tag} pageerror: ${e.message}`));

      for (const p of pages) {
        await page.goto(`${base}#/${p}?loc=HB_HOUSTON&dur=2&year=2025&deg=10`);
        await settle(page);
        await overflow(page, `${tag}/${p}`);
        await page.screenshot({ path: name(p, size, scheme), fullPage: true });
        shots++;
      }

      // Data-quality note on a volatile node, and node-vs-hub on Compare.
      for (const [file, url] of [
        ...(only ? [] : [
          ['data-quality', 'overview?loc=RHESS2_ESS1&dur=2&year=2025&deg=10'],
          ['compare-node', 'compare?loc=RUSSEKST_RN&dur=2&year=2025&deg=10'],
        ]),
        // A resource node selected on the map (side panel showing a node vs its hub).
        ...(!only || pages.includes('map') ? [['map-node', 'map?loc=RUSSEKST_RN&dur=2&year=2025&deg=10']] : []),
        // Heat mode: every resource node (Phase 12). Runs last because the mode is remembered in localStorage.
        ...(!only || pages.includes('map') ? [['map-heat', 'map?view=heat&loc=HB_HOUSTON&dur=2&year=2025&deg=10']] : []),
      ]) {
        await page.goto(`${base}#/${url}`);
        await settle(page);
        await overflow(page, `${tag}/${file}`);
        await page.screenshot({ path: name(file, size, scheme), fullPage: true });
        shots++;
      }

      if (size === 'desktop' && !only) {
        await page.goto(`${base}#/overview?loc=HB_HOUSTON&dur=2&year=2026&deg=10`);
        await settle(page);
        await page.getByRole('button', { name: /Expand Dispatch pattern/ }).click();
        await page.waitForTimeout(1400);
        await page.screenshot({ path: name('expanded-heatmap', size, scheme) });
        shots++;
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`${shots} screenshots (${suffix}) from ${root}`);
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no console errors or horizontal overflow');
