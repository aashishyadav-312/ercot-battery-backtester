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
// The FIXTURE stack (web/fixtures/v4/stack, made-up numbers for the unit tests) is never copied here. Tests read it from disk.
// It used to be served with V4_FIXTURE=1 while Step 1 was unmerged; that path is gone so a build can never ship it.
// scripts/check-no-fixture.mjs checks the finished build for it as well.
// Site Value card (v4 Step 5): which all-node files exist (nodes_<year>_<dur>h.json), so the card never asks for one that is not there.
const nodeFiles = readdirSync(src).sort().flatMap((f) => {
  const m = /^nodes_(\d{4})_(\d+(?:\.\d+)?)h\.json$/.exec(f);
  return m ? [{ year: Number(m[1]), durationH: Number(m[2]), file: f }] : [];
});
mkdirSync(join(dst, 'v4'), { recursive: true });
writeFileSync(join(dst, 'v4', 'nodes_index.json'), JSON.stringify({ files: nodeFiles }) + '\n');
// The stack index lists the stack files that exist. Step 1 writes results/v4/stack/index.json; until then an empty list is served,
// so the card finds no Full stack results and makes no request for a file that is missing.
if (!existsSync(join(dst, 'v4', 'stack', 'index.json'))) {
  mkdirSync(join(dst, 'v4', 'stack'), { recursive: true });
  writeFileSync(join(dst, 'v4', 'stack', 'index.json'), JSON.stringify({ files: [] }) + '\n');
}
const version = hash.digest('hex').slice(0, 12);
writeFileSync(join(here, '..', 'src', 'data', 'data-version.json'), JSON.stringify({ version }) + '\n');
console.log(
  `copied ${n} files from results/ to public/data/, ${(priceBytes / 1048576).toFixed(1)} MB of price files (data version ${version})`,
);
