import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static guard for the motion rules in DESIGN.md: only transform, opacity and paint-only properties move, UI transitions
// stay short, and the global reduced-motion backstop stays in place. Reads the real source files.
const SRC = join(process.cwd(), 'src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const all = files(SRC).filter((p) => !/\.test\./.test(p));
const css = all.filter((p) => p.endsWith('.css'));
const read = (p: string) => readFileSync(p, 'utf8');
const rel = (p: string) => relative(SRC, p).replace(/\\/g, '/');

/** Every `transition:` / `transition-property:` value and every CSS or inline-style `transition: '...'` in the source. */
function transitions(): { file: string; value: string }[] {
  const out: { file: string; value: string }[] = [];
  for (const p of all.filter((f) => /\.(css|tsx?)$/.test(f))) {
    for (const m of read(p).matchAll(/transition(?:-property)?\s*:\s*['"`]?([^;'"`}\n]+)/g)) out.push({ file: rel(p), value: m[1] });
  }
  return out;
}
const LAYOUT = /\b(all|width|height|min-width|max-width|min-height|max-height|margin\S*|padding\S*|top|left|right|bottom|inset|gap|flex\S*|grid\S*|font-size|line-height)\b/;

describe('motion', () => {
  it('no transition animates layout (or uses `all`)', () => {
    const bad = transitions().filter((t) => LAYOUT.test(t.value.replace(/var\([^)]*\)/g, '')));
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });

  it('no keyframe animates layout', () => {
    const bad: string[] = [];
    for (const p of css) {
      for (const m of read(p).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
        const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
        const layout = props.filter((x) => /^(width|height|min-.*|max-.*|margin.*|padding.*|top|left|right|bottom|inset|gap|flex.*|grid.*|font-size)$/.test(x));
        if (layout.length) bad.push(`${rel(p)} ${m[1]}: ${layout.join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('UI transitions are 300ms or less; only the map marks recolour over 420ms and the support bar fills over 700ms', () => {
    const long = transitions().flatMap((t) =>
      [...t.value.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map((m) => ({ ...t, ms: m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]) })),
    ).filter((t) => t.ms > 300);
    const unexpected = long.filter((t) => !(t.ms === 420 && /^components\/(home\/HomeMap|atlas\/AtlasMap)\.module\.css$/.test(t.file))
      && !(t.ms === 700 && t.file === 'support/Support.module.css'));
    expect(unexpected, JSON.stringify(unexpected)).toEqual([]);
  });

  it('the global reduced-motion backstop stays in place', () => {
    const base = read(join(SRC, 'styles.css'));
    const block = base.slice(base.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it('infinite animations are the ticker, the map breathing and rings, the skeleton sheen and the indeterminate bar', () => {
    const found: string[] = [];
    for (const p of css) for (const m of read(p).matchAll(/animation\s*:[^;]*\binfinite\b[^;]*;/g)) found.push(`${rel(p)}: ${m[0].match(/:\s*([\w-]+)/)?.[1]}`);
    expect(found.sort()).toEqual([
      'components/home/HomeMap.module.css: breathe',
      'components/home/HomeMap.module.css: ring',
      'components/shell/Ticker.module.css: tick-slide',
      'pages/Studio.module.css: slide',
      'theme.module.css: sheen',
    ]);
  });
});
