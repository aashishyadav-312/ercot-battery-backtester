// Fails the build when made-up FIXTURE data is in the files the site serves. Runs after `vite build` (postbuild), so the
// deploy workflow and CI both run it, and again over public/data in the unit tests (src/v4/noFixture.test.ts).
// FIXTURE stack files say FIXTURE in meta.generated; the interface code mentions the word too, so only data files are scanned.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function findFixtureData(dir) {
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && /FIXTURE/.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return hits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dist = join(here, '..', 'dist', 'data');
  if (!existsSync(dist)) { console.error(`check-no-fixture: ${dist} not found; run it after vite build`); process.exit(1); }
  const hits = findFixtureData(dist);
  if (hits.length) {
    console.error(`check-no-fixture: FIXTURE data in the build:\n${hits.map((h) => `  ${h}`).join('\n')}`);
    process.exit(1);
  }
  console.log('check-no-fixture: no FIXTURE data in dist/data');
}
