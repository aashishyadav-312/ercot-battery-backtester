// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Header } from './Header';
import { ViewBar } from './ViewBar';
import { tourSteps } from '../tour/steps';
import type { Selection } from '../../data/types';

vi.mock('../../config/features', async (orig) => ({ ...(await orig<typeof import('../../config/features')>()), V5: true }));

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
});
const SEL: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };

describe('V5 header and view bar', () => {
  it('shows four tabs as links, in order, with the current one marked', () => {
    render(<MantineProvider><Header active="learn" sel={SEL} scheme="dark" onToggleScheme={() => {}} /></MantineProvider>);
    const links = within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'Atlas', 'Studio', 'Learn']);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, null, null, 'page']);
    expect(links[3].getAttribute('href')).toContain('#/learn');
  });

  it('Learn lists Research as one item, and the Research pages on a second row', () => {
    render(<ViewBar tab="learn" page="revenue" sel={SEL} />);
    const top = within(screen.getByRole('navigation', { name: 'Learn pages' })).getAllByRole('link');
    expect(top.map((a) => a.textContent)).toEqual(['Basics', 'Research', 'Site guide', 'Limits', 'Glossary', 'About']);
    expect(top.find((a) => a.textContent === 'Research')!.getAttribute('aria-current')).toBe('page');
    const sub = within(screen.getByRole('navigation', { name: 'Research pages' })).getAllByRole('link');
    expect(sub.map((a) => a.textContent)).toEqual(['Findings', 'Revenue', 'Charging pattern', 'Reality check', 'Method']);
    expect(sub.find((a) => a.textContent === 'Revenue')!.getAttribute('aria-current')).toBe('page');
    expect(sub[1].getAttribute('href')).toMatch(/^#\/learn\/revenue\?/);
  });

  it('the second row appears on Findings too, and not on the other Learn pages', () => {
    const { unmount } = render(<ViewBar tab="learn" page="research" sel={SEL} />);
    expect(screen.getByRole('navigation', { name: 'Research pages' })).toBeTruthy();
    unmount();
    render(<ViewBar tab="learn" page="glossary" sel={SEL} />);
    expect(screen.queryByRole('navigation', { name: 'Research pages' })).toBeNull();
  });
});

describe('V5 tour', () => {
  it('has no stop for the Research tab, and the Learn stop says where Research went', () => {
    const steps = tourSteps(true, true);
    expect(steps.map((s) => s.anchor)).toEqual(['hero', 'tab-atlas', 'tab-studio', 'tab-learn', 'support']);
    expect(steps.find((s) => s.anchor === 'tab-learn')!.body).toContain('research');
  });
  it('is unchanged with V5 off', () => {
    expect(tourSteps(true).map((s) => s.anchor)).toContain('tab-research');
    expect(tourSteps(true, false)).toEqual(tourSteps(true));
  });
});
