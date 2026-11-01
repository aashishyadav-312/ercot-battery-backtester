// Copies the committed backtest results (../results/*.json) into public/data
// so Vite serves them in dev and bundles them into dist/ at build time.
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
const version = hash.digest('hex').slice(0, 12);
writeFileSync(join(here, '..', 'src', 'data', 'data-version.json'), JSON.stringify({ version }) + '\n');
console.log(`copied ${n} JSON files from results/ to public/data/ (data version ${version})`);
