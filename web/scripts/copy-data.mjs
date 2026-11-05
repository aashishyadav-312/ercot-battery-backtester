// Copies the committed backtest results (../results/*.json) and the custom-run
// price files (../results/prices/) into public/data so Vite serves them in dev
// and bundles them into dist/ at build time.
//
// Also writes src/data/data-version.json: a short hash of those files. The data
// loader appends it to every data URL (?v=...), so a build with new results never
// reads JSON the browser cached from the previous build (GitHub Pages sends
// max-age=600), while unchanged data keeps its URL and stays cached.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'results');
const dst = join(here, '..', 'public', 'data');

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
const hash = createHash('sha256');
let n = 0;
for (const f of readdirSync(src).sort()) {
  if (f.endsWith('.json')) {
    cpSync(join(src, f), join(dst, f));
    hash.update(f).update(readFileSync(join(src, f)));
    n++;
  }
}
// The written findings (results/FINDINGS.md) ship beside the numbers: the Research page renders each finding from this file,
// so the text on screen is the text in the repository.
cpSync(join(src, 'FINDINGS.md'), join(dst, 'findings.md'));
hash.update('findings.md').update(readFileSync(join(src, 'FINDINGS.md')));
n++;
// Price files for the in-browser custom run (results/prices/*.ebp + index.json, Phase 15).
const prices = join(src, 'prices');
let priceBytes = 0;
mkdirSync(join(dst, 'prices'), { recursive: true });
for (const f of readdirSync(prices).sort()) {
  if (f.endsWith('.ebp') || f === 'index.json') {
    const bytes = readFileSync(join(prices, f));
    cpSync(join(prices, f), join(dst, 'prices', f));
    hash.update(`prices/${f}`).update(bytes);
    priceBytes += bytes.length;
    n++;
  }
}
// V4 data (results/v4/**, for example results/v4/geo and results/v4/stack). Copied as-is, hashed with the rest.
function copyTree(from, to, rel = '') {
  for (const e of readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isDirectory()) { copyTree(join(from, e.name), join(to, e.name), `${rel}${e.name}/`); continue; }
    if (!e.name.endsWith('.json')) continue;
    mkdirSync(to, { recursive: true });
    cpSync(join(from, e.name), join(to, e.name));
    hash.update(`v4/${rel}${e.name}`).update(readFileSync(join(from, e.name)));
    n++;
  }
}
if (existsSync(join(src, 'v4'))) copyTree(join(src, 'v4'), join(dst, 'v4'));
// FIXTURE stack (web/fixtures/v4/stack: made-up numbers marked FIXTURE, for building the UI). Served at data/v4/stack/ only when
// V4_FIXTURE=1 is set and results/v4/stack does not exist. Real results always win.
const stackFixture = join(here, '..', 'fixtures', 'v4', 'stack');
if (process.env.V4_FIXTURE === '1' && !existsSync(join(src, 'v4', 'stack'))) {
  mkdirSync(join(dst, 'v4', 'stack'), { recursive: true });
  for (const f of readdirSync(stackFixture).sort()) {
    if (!f.endsWith('.json')) continue;
    cpSync(join(stackFixture, f), join(dst, 'v4', 'stack', f));
    hash.update(`v4/stack/${f}`).update(readFileSync(join(stackFixture, f)));
    n++;
  }
}
const version = hash.digest('hex').slice(0, 12);
writeFileSync(join(here, '..', 'src', 'data', 'data-version.json'), JSON.stringify({ version }) + '\n');
console.log(
  `copied ${n} files from results/ to public/data/, ${(priceBytes / 1048576).toFixed(1)} MB of price files (data version ${version})`,
);
