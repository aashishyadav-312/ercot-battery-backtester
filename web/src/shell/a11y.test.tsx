// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Card, CardHeadingLevel } from '../components/Card';
import { Info } from '../components/Info';

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const src = (f: string) => readFileSync(resolve(process.cwd(), 'src', f), 'utf8');

describe('accessibility fixes (step 7)', () => {
  it('card titles are h3 by default and h2 on pages that go straight from the h1', () => {
    render(<MantineProvider><Card title="Plain">{() => <p>x</p>}</Card></MantineProvider>);
    expect(screen.getByRole('heading', { level: 3, name: 'Plain' })).toBeTruthy();
    cleanup();
    render(<MantineProvider><CardHeadingLevel.Provider value={2}><Card title="Flat">{() => <p>x</p>}</Card></CardHeadingLevel.Provider></MantineProvider>);
    expect(screen.getByRole('heading', { level: 2, name: 'Flat' })).toBeTruthy();
  });

  it('the expand dialog has a named close button and no banner inside it', async () => {
    render(<MantineProvider><Card title="Chart">{() => <p>x</p>}</Card></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Expand Chart' }));
    expect(await screen.findByRole('button', { name: 'Close' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('info icons are at least 24px, even when drawn at 12px', () => {
    render(<MantineProvider><Info terms="capture_rate" size={12} /></MantineProvider>);
    const btn = screen.getByRole('button', { name: /What does this mean/ });
    const size = (btn.getAttribute('style') ?? '').match(/--ai-size:\s*calc\(([\d.]+)rem/);
    expect(size, btn.getAttribute('style') ?? '').not.toBeNull();
    expect(Number(size![1]) * 16).toBeGreaterThanOrEqual(24);
  });

  it('keyboard focus scrolls clear of the sticky header, and links in text are underlined', () => {
    expect(src('styles.css')).toMatch(/scroll-padding-top:\s*calc\(var\(--app-header-h\)/);
    expect(src('theme.ts')).toMatch(/Anchor\.extend\(\{ defaultProps: \{ underline: 'always' \}/);
  });

  it('Mantine light-variant text takes the token colours on the light page', () => {
    const t = src('theme.ts');
    for (const c of ['yellow', 'orange', 'red', 'green', 'teal']) expect(t).toContain(`--mantine-color-${c}-light-color`);
  });
});
