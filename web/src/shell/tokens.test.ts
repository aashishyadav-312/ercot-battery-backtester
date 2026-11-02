import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Reads the real token file and checks every text pair against WCAG 2.2 AA (4.5:1), in both themes.
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `${selector} not found in tokens.css`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [m[1], m[2]]));
}
const dark = block(':root[data-theme=\'dark\']');
const light = { ...dark, ...block(':root[data-theme=\'light\']') };

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [foreground token, background token] pairs that carry text. */
const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'], ['text', 'panel'], ['text', 'panel-hi'],
  ['muted', 'bg'], ['muted', 'panel'], ['muted', 'panel-hi'],
  ['faint', 'bg'], ['faint', 'panel'], ['faint', 'panel-hi'], ['faint', 'track'],
  ['amber-text', 'bg'], ['amber-text', 'panel'], ['amber-text', 'panel-hi'],
  ['mint-text', 'bg'], ['mint-text', 'panel'], ['mint-text', 'panel-hi'],
  ['on-accent', 'amber'], ['on-accent', 'mint'],
  ['up', 'bg'], ['up', 'panel'], ['up', 'panel-hi'], ['down', 'bg'], ['down', 'panel'], ['down', 'panel-hi'],
  ['tick-text', 'tick-bg'], ['tick-muted', 'tick-bg'], ['tick-up', 'tick-bg'], ['tick-down', 'tick-bg'],
];

describe.each([['dark', dark], ['light', light]] as const)('%s tokens', (_name, t) => {
  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(t[fg], `--${fg} missing`).toBeDefined();
    expect(t[bg], `--${bg} missing`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // Mantine's light alerts and badges tint the panel with 10-25% of their colour; the token text must still read on that.
  const mix = (a: string, b: string, k: number) =>
    '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * k + parseInt(b.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
  it.each([['amber-text', 'amber'], ['mint-text', 'mint']])('%s reads on a 25%% tint of %s over the panel', (fg, fill) => {
    expect(contrast(t[fg], mix(t[fill], t.panel, 0.25))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the focus ring (amber-text) at 3:1 against the page and panels', () => {
    for (const bg of ['bg', 'panel']) expect(contrast(t['amber-text'], t[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('price move colours', () => {
  it('use the same pair on the page as the ticker uses on a surface of the same lightness', () => {
    // The ticker inverts: its strip is light on the dark page, so the dark page's --up is the light theme's --tick-up.
    expect(dark.up).toBe(light['tick-up']);
    expect(dark.down).toBe(light['tick-down']);
    expect(light.up).toBe(dark['tick-up']);
    expect(light.down).toBe(dark['tick-down']);
  });
});
