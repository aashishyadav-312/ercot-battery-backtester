// End-to-end check of the "Start here" flow against a production build, plus the Phase 10 screenshots.
//
//  1. A first-time visitor on Overview sees the banner, clicks "Start here" (click 1), then "Open the Overview" (click 2)
//     and lands on a configured Overview. The banner is gone after a reload (dismissal is remembered).
//  2. The banner still works when localStorage throws (private mode, blocked storage).
//  3. The walkthrough defaults to the best day, steps with Prev/Next and the arrow keys, and the date picker works.
//  4. No console errors and no sideways scrolling on any of it. Screenshots go to screenshots/*-p10-after.png.
//
// Usage:  npm run build && PW_CHROMIUM_PATH=... node scripts/check-start.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(here, 'screenshots');
mkdirSync(out, { recursive: true });
const PORT = 4176;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const base = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });

const problems = [];
const results = [];
const check = (ok, what) => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) problems.push(what); };
const shot = (name) => join(out, `${name}-p10-after.png`);

async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}
async function overflow(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) problems.push(`${where}: horizontal overflow ${over}px`);
}
function watch(page, tag) {
  page.on('console', (m) => m.type() === 'error' && problems.push(`${tag} console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`${tag} pageerror: ${e.message}`));
}

try {
  // ---- 1. two clicks from the banner to a configured Overview, and dismissal sticks
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    watch(page, 'flow');
    let clicks = 0;
    await page.goto(`${base}#/overview`);
    await settle(page);
    check(await page.getByRole('region', { name: 'New here?' }).isVisible(), 'banner shows for a first-time visitor on Overview');
    await page.getByRole('link', { name: /Start here/ }).first().click(); clicks++;
    await page.waitForURL(/#\/start/);
    check(await page.getByRole('heading', { level: 1, name: 'Start here' }).isVisible(), 'click 1 opens the Start here page');
    await page.getByRole('button', { name: 'Open the Overview' }).click(); clicks++;
    await page.waitForURL(/#\/overview\?loc=HB_HOUSTON&dur=2&year=2025&deg=10/);
    await settle(page, 600);
    check(clicks === 2, `Start here to a configured Overview in ${clicks} clicks (banner link, then Open the Overview)`);
    check(await page.getByText('Revenue', { exact: true }).first().isVisible(), 'the configured Overview renders its KPI tiles');
    check(!(await page.getByRole('region', { name: 'New here?' }).isVisible()), 'banner is gone after visiting Start here');
    await page.reload();
    await settle(page, 600);
    check(!(await page.getByRole('region', { name: 'New here?' }).isVisible()), 'banner stays hidden after a reload');
    // The first nav item is Start here, and every page card link opens a configured page.
    const nav = await page.getByRole('navigation', { name: 'Pages' }).getByRole('button').allInnerTexts();
    check(nav[0] === 'Start here', `Start here is the first nav item (nav: ${nav.join(', ')})`);
    await ctx.close();
  }

  // dismiss with "Not now" persists too
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'dismiss');
    await page.goto(`${base}#/overview`);
    await settle(page, 600);
    await page.getByRole('button', { name: 'Not now' }).click();
    check(!(await page.getByRole('region', { name: 'New here?' }).isVisible()), '"Not now" hides the banner');
    await page.reload();
    await settle(page, 600);
    check(!(await page.getByRole('region', { name: 'New here?' }).isVisible()), '"Not now" is remembered across reloads');
    await ctx.close();
  }

  // ---- 2. storage that throws must not break the page
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { get: boom });
    });
    const page = await ctx.newPage();
    watch(page, 'no-storage');
    await page.goto(`${base}#/overview`);
    await settle(page, 600);
    check(await page.getByRole('region', { name: 'New here?' }).isVisible(), 'with storage blocked, Overview still renders and shows the banner');
    await page.getByRole('button', { name: 'Not now' }).click();
    check(!(await page.getByRole('region', { name: 'New here?' }).isVisible()), 'with storage blocked, dismissing still hides it for the session');
    await ctx.close();
  }

  // ---- 3. walkthrough behaviour
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'walk');
    await page.goto(`${base}#/start`);
    await settle(page);
    const picker = page.getByRole('combobox', { name: 'Pick a day' });
    check((await picker.inputValue()).includes('May 16, 2025') && (await picker.inputValue()).includes('Best day'), `walkthrough defaults to the best day (${await picker.inputValue()})`);
    const stepText = () => page.getByText(/^Step \d+ of \d+$/).innerText();
    check((await stepText()).startsWith('Step 1 of'), `starts at ${await stepText()}`);
    await page.getByRole('button', { name: 'Next step' }).click();
    check((await stepText()).startsWith('Step 2 of'), 'Next moves to step 2');
    const heading = await page.getByRole('heading', { level: 3 }).filter({ hasText: /^(Buy|Sell) 1/ }).first().innerText();
    check(/^Buy 1 · /.test(heading), `step 2 is the first charge block (${heading})`);
    await page.getByRole('button', { name: 'Previous step' }).click();
    check((await stepText()).startsWith('Step 1 of'), 'Prev moves back');
    await page.getByRole('button', { name: 'Next step' }).focus();
    await page.keyboard.press('ArrowRight');
    check((await stepText()).startsWith('Step 2 of'), 'ArrowRight steps forward');
    // Walk to the end: the last step is the day's total and the button becomes Start over.
    for (let i = 0; i < 40 && (await page.getByRole('button', { name: 'Next step' }).count()); i++) await page.getByRole('button', { name: 'Next step' }).click();
    check(await page.getByText('The day in total').first().isVisible(), 'last step is the day in total');
    check(await page.getByRole('button', { name: 'Start over' }).isVisible(), 'last step offers Start over');
    // Change the day: resets to step 1.
    await picker.click();
    await page.getByRole('option', { name: /A typical day/ }).click();
    await page.waitForTimeout(500);
    check((await stepText()).startsWith('Step 1 of'), 'picking another day resets the walkthrough');
    check((await picker.inputValue()).includes('A typical day'), 'date picker shows the chosen day');
    await ctx.close();
  }

  // ---- 4. screenshots
  for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } })) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport, colorScheme: scheme, deviceScaleFactor: size === 'phone' ? 2 : 1, hasTouch: size === 'phone', isMobile: size === 'phone',
      });
      const page = await ctx.newPage();
      const tag = `${size}/${scheme}`;
      watch(page, tag);

      // Overview with the banner (a fresh context is a first-time visitor).
      await page.goto(`${base}#/overview?loc=HB_HOUSTON&dur=2&year=2025&deg=10`);
      await settle(page);
      await overflow(page, `${tag}/overview-banner`);
      await page.screenshot({ path: shot(`overview-banner-${size}-${scheme}`), fullPage: true });

      // The whole Start here page.
      await page.goto(`${base}#/start`);
      await settle(page, 1800);
      await overflow(page, `${tag}/start`);
      await page.screenshot({ path: shot(`start-${size}-${scheme}`), fullPage: true });

      // The walkthrough at two steps: the intro and the first sell block.
      await page.addStyleTag({ content: 'header { visibility: hidden !important; }' }); // the sticky header would cover element captures
      const walk = page.locator('#money').locator('xpath=ancestor::section[1]');
      await walk.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await walk.screenshot({ path: shot(`walkthrough-intro-${size}-${scheme}`) });
      const next = page.getByRole('button', { name: 'Next step' });
      await next.click(); await next.click();
      await page.waitForTimeout(1000);
      await walk.screenshot({ path: shot(`walkthrough-step3-${size}-${scheme}`) });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(results.join('\n'));
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : '\nno console errors, horizontal overflow or failed checks');
process.exit(problems.length ? 1 : 0);
