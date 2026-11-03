import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { alpha, mix } from './chartColors';

// Chart components take every colour from the tokens through chartColors.ts (polish step 4). This fails if one draws
// with a hex value, or names the old blue, orange or green palette in a colour or in copy.
const SRC = fileURLToPath(new URL('..', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

/** A chart component: draws with the Chart wrapper or the chart tokens, or is one of the map and diagram drawers. */
const CHART_FILES = files(SRC).filter((p) => {
  const s = readFileSync(p, 'utf8');
  return /from '(\.\.?\/)+(components\/)?Chart'|chartColors'|ChartTheme|var\(--chart-/.test(s) || /components[\\/](map|research)[\\/]/.test(p);
}).filter((p) => !p.endsWith('chartColors.ts'));

/** The categorical set the charts drew with before step 4 (theme.ts CHART and Ancillary). */
const OLD = ['2a78d6', 'eb6834', '1baf7a', '6250d6', '3987e5', 'd95926', '199e70', '9085e9', '3182ce', '2f9e7a', '79b86a', '9566bb', 'd79740', 'bd6173', 'f2c200'];

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('chart colours come from tokens', () => {
  it('finds the chart components', () => {
    const names = CHART_FILES.map((p) => relative(SRC, p).replace(/\\/g, '/'));
    for (const f of ['components/Chart.tsx', 'components/cards.tsx', 'components/realism.tsx', 'components/Ancillary.tsx', 'components/ContextSection.tsx', 'components/map/TexasMap.tsx', 'components/map/scale.ts', 'pages/Live.tsx', 'pages/Economics.tsx']) {
      expect(names).toContain(f);
    }
  });

  it.each(CHART_FILES.map((p) => [relative(SRC, p).replace(/\\/g, '/'), p]))('%s has no hex colour', (_name, p) => {
    expect(code(readFileSync(p, 'utf8')).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it.each(CHART_FILES.map((p) => [relative(SRC, p).replace(/\\/g, '/'), p]))('%s does not use the old blue, orange or green', (_name, p) => {
    const s = readFileSync(p, 'utf8');
    expect(OLD.filter((h) => s.toLowerCase().includes(h))).toEqual([]);
    // Mantine colour props (Badge color="green") name a theme colour, not a chart mark; they map to the tokens in theme.ts.
    const text = code(s).replace(/color=(\{[^}]*\}|"[^"]*")/g, '');
    expect(text.match(/\b(blue|orange|green)\b/gi) ?? []).toEqual([]);
  });

  it('theme.ts no longer carries a chart palette', () => {
    const s = readFileSync(join(SRC, 'theme.ts'), 'utf8').toLowerCase();
    expect(OLD.filter((h) => s.includes(h))).toEqual([]);
  });
});

describe('colour helpers', () => {
  it('turns hex into rgba and mixes two hex colours', () => {
    expect(alpha('#F2A93B', 0.5)).toBe('rgba(242,169,59,0.5)');
    expect(alpha('', 0.5)).toBe('');
    expect(mix('#ffffff', '#000000', 0.5)).toBe('rgb(128,128,128)');
  });
});
