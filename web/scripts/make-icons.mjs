// Builds the icon set and og-image.png in public/ from the C-line mark (public/favicon.svg).
// Usage: PW_CHROMIUM_PATH=<chromium or edge> node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = readFileSync(join(pub, 'favicon.svg'), 'utf8').trim();
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
// Mark on a full-bleed graphite square, shrunk to the maskable safe zone (inner 80%).
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#171A1D"/><g transform="translate(9.6 9.6) scale(.7)">${svg
  .replace(/<svg[^>]*>/, '')
  .replace('</svg>', '')
  .replace(/<rect[^>]*\/>/, '')}</g></svg>`;
const maskUri = 'data:image/svg+xml;base64,' + Buffer.from(maskable).toString('base64');

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function raster(src, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}body{background:transparent}img{width:${size}px;height:${size}px;display:block}</style><img src="${src}">`);
  await page.evaluate(() => document.images[0].decode());
  return page.screenshot({ type: 'png', omitBackground: true });
}

const out = (name, buf) => { writeFileSync(join(pub, name), buf); console.log('wrote public/' + name); };
out('apple-touch-icon.png', await raster(uri, 180));
out('icon-192.png', await raster(uri, 192));
out('icon-512.png', await raster(uri, 512));
out('icon-512-maskable.png', await raster(maskUri, 512));

// favicon.ico: PNG-compressed entries at 16, 32 and 48.
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) pngs.push(await raster(uri, s));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const o = 6 + 16 * i;
  head[o] = s; head[o + 1] = s;
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(pngs[i].length, o + 8);
  head.writeUInt32LE(offset, o + 12);
  offset += pngs[i].length;
});
out('favicon.ico', Buffer.concat([head, ...pngs]));

// Social image.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#171A1D;font-family:'Space Grotesk',Inter,system-ui,sans-serif;color:#E8E6E1;padding:72px;display:flex;flex-direction:column;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:24px;font-size:48px;font-weight:700;letter-spacing:-0.02em}
  .brand img{width:96px;height:96px;border-radius:22px;box-shadow:0 0 0 2px #3A3F45}
  h1{font-size:84px;line-height:1.05;font-weight:700;letter-spacing:-0.03em;max-width:980px}
  p{font-size:30px;color:#A9A7A1}
</style>
<div class="brand"><img src="${uri}">Chargeline</div>
<h1>Where in Texas does a battery earn the most?</h1>
<p>Real ERCOT prices replayed through a battery at every hub and node.</p>`);
await page.evaluate(() => document.fonts.ready);
out('og-image.png', await page.screenshot({ type: 'png' }));
await browser.close();
