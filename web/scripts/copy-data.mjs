// Copies the committed backtest results (../results/*.json) and the custom-run
// price files (../results/prices/) into public/data so Vite serves them in dev
// and bundles them into dist/ at build time.
//
// Also writes src/data/data-version.json: a short hash of those files. The data
// loader appends it to every data URL (?v=...), so a build with new results never
// reads JSON the browser cached from the previous build (GitHub Pages sends
// max-age=600), while unchanged data keeps its URL and stays cached.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
const version = hash.digest('hex').slice(0, 12);
writeFileSync(join(here, '..', 'src', 'data', 'data-version.json'), JSON.stringify({ version }) + '\n');
console.log(
  `copied ${n} files from results/ to public/data/, ${(priceBytes / 1048576).toFixed(1)} MB of price files (data version ${version})`,
);
