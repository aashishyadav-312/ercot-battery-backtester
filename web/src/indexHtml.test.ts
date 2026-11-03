import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

describe('index.html', () => {
  it('links only icon and manifest files that exist in public/', () => {
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="\/([^"?]+)/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const h of hrefs) expect(existsSync(resolve(root, 'public', h)), h).toBe(true);
  });

  it('cache-busts every icon link with ?v=3', () => {
    for (const m of html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)) expect(m[1]).toContain('?v=3');
  });

  it('points og and twitter images at a file in public/', () => {
    const imgs = [...html.matchAll(/(?:og|twitter):image" content="[^"]*\/([^/"]+)"/g)].map((m) => m[1]);
    expect(imgs.length).toBe(2);
    for (const i of imgs) expect(existsSync(resolve(root, 'public', i)), i).toBe(true);
  });

  it('lists manifest icons that exist', () => {
    const m = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
    for (const i of m.icons) expect(existsSync(resolve(root, 'public', i.src)), i.src).toBe(true);
  });
});
