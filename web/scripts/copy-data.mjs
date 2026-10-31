// Copies the committed backtest results (../results/*.json) into public/data
// so Vite serves them in dev and bundles them into dist/ at build time.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'results');
const dst = join(here, '..', 'public', 'data');

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (f.endsWith('.json')) {
    cpSync(join(src, f), join(dst, f));
    n++;
  }
}
console.log(`copied ${n} JSON files from results/ to public/data/`);
