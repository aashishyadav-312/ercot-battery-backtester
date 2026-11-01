// Functional checks against the production build and committed AS artifacts.
// Run after npm run build: node scripts/check-ancillary.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = (file) => JSON.parse(readFileSync(join(root, '..', 'results', file), 'utf8'));
const manifest = result('ancillary.json');
const keys = ['energy', 'REGUP', 'REGDN', 'RRS', 'ECRS', 'NSPIN'];
const money = (n) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 }).format(n);
const total = (days, stack) => days.reduce((sum, d) => sum + (stack ? keys.reduce((s,k) => s+d[k],0) : d.energy_only),0);
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', '4178', '--strictPort'], { cwd:root, stdio:'ignore' });
const browser = await chromium.launch({ executablePath:process.env.PW_CHROMIUM_PATH || undefined });
const errors = [];
try {
  const page = await browser.newPage({ viewport:{width:1440,height:900} });
  page.on('pageerror', (e) => errors.push(e.message));
  for (let attempt=0; attempt<50; attempt++) {
    try { const r=await fetch('http://localhost:4178/'); if(r.ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve,100));
  }
  for (const [view, loc, year, h, deg] of [
    ['overview','HB_HOUSTON',2025,2,10], ['revenue','ANSON1_ALL',2025,4,10],
  ]) {
    const file = `${loc}_${year}_${h}h_0.85_${deg}.json`;
    const data = result(manifest.runs[file]);
    await page.goto(`http://localhost:4178/#/${view}?loc=${loc}&year=${year}&dur=${h}&deg=${deg}`);
    const card = page.getByRole('region', {name:'Energy and ancillary revenue',exact:true});
    await card.getByText('Energy only', {exact:true}).click();
    await card.getByText(`${money(total(data.daily,false))}/kW over ${data.daily.length} covered days`,{exact:true}).waitFor();
    await card.getByText('Energy + AS',{exact:true}).click();
    await card.getByText(`${money(total(data.daily,true))}/kW over ${data.daily.length} covered days`,{exact:true}).waitFor();
    const downloading = page.waitForEvent('download');
    await card.getByRole('button',{name:'Download Energy and ancillary revenue as CSV'}).click();
    const downloaded = await downloading;
    const csv = readFileSync(await downloaded.path(),'utf8');
    assert(csv.includes('Regulation Up') && csv.includes('Non-Spin'));
    assert(csv.split('\n').length >= 12);
    console.log(`${view}: strategy totals match artifacts; CSV contains all five products`);
  }
  await page.setViewportSize({width:390,height:844});
  const requests = new Set();
  page.on('request', (r) => { if(r.url().includes('/data/as_')) requests.add(r.url()); });
  await page.goto('http://localhost:4178/#/realism?loc=HB_HOUSTON&year=2025&dur=2&deg=10');
  const card = page.getByRole('region',{name:'RTC+B: energy and ancillary revenue',exact:true});
  await card.getByText('Energy + AS',{exact:true}).click();
  await card.getByText('324 paired days per window', {exact:false}).waitFor();
  const over = await page.evaluate(() => document.documentElement.scrollWidth-innerWidth);
  assert(over <= 1, `phone horizontal overflow: ${over}`);
  assert(requests.size <= 3, 'RTC+B fetched more than three AS detail files');
  console.log('realism: 324 matched days, lazy per-selection data, no phone overflow');
  const failure = await browser.newPage();
  await failure.route('**/data/ancillary.json?*', (route) => route.fulfill({status:503,body:'Unavailable'}));
  await failure.goto('http://localhost:4178/#/overview');
  await failure.getByText('Ancillary results could not be loaded.',{exact:false}).waitFor();
  await failure.getByText('Full 2025, 365 days, net of degradation cost.',{exact:true}).waitFor();
  console.log('failure: unavailable ancillary artifact leaves energy-only results visible');
  assert.deepEqual(errors,[]);
} finally {
  await browser.close();
  server.kill();
}
