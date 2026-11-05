// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Guide, { GUIDE_SECTIONS } from './Guide';
import { Footer } from '../components/shell/Footer';
import { retiredIn } from '../copy/retired';
import { V4 } from '../config/features';

// The Guide only needs `go` from the app and the walkthrough day, which is a file fetch; both are replaced here.
vi.mock('../state', async () => {
  const route = await import('../shell/route');
  return { useApp: () => ({ go: () => {} }), buildHash: route.buildHash };
});
vi.mock('../hooks', () => ({ useWalkthrough: () => ({}) }));

afterEach(() => { cleanup(); window.location.hash = ''; });
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  Element.prototype.scrollIntoView ??= () => {};
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const view = () => render(<MantineProvider><Guide /></MantineProvider>);

describe('Learn > Basics', () => {
  it('keeps the two explainers and drops the sections that have their own pages', () => {
    view();
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual(V4 ? ['ercot', 'money', 'screening'] : ['ercot', 'money']);
    for (const s of GUIDE_SECTIONS) expect(document.getElementById(s.id)?.tagName, s.id).toBe('H2');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Basics');
    for (const gone of ['read', 'left-out', 'glossary', 'about']) expect(document.getElementById(gone), gone).toBeNull();
  });
});

describe('opening at a section', () => {
  it('scrolls to the section named in the hash', async () => {
    window.location.hash = '#/learn?s=money';
    const seen: Element[] = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { seen.push(this); };
    view();
    await waitFor(() => expect(seen.map((e) => e.id)).toContain('money'));
    Element.prototype.scrollIntoView = orig;
  });

  it('does not move for an unknown section', async () => {
    window.location.hash = '#/learn?s=nonsense';
    let moved = 0;
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () { moved++; };
    view();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(moved).toBe(0);
    Element.prototype.scrollIntoView = orig;
  });
});

describe('footer', () => {
  it('links About the author to the About page, and Report an issue to a mailto', () => {
    render(<Footer index={null} sel={{ location: 'HB_WEST', duration: 4, year: 2025, deg: 10 }} />);
    expect(screen.getByRole('link', { name: 'About the author' }).getAttribute('href')).toBe('#/learn/about?loc=HB_WEST&dur=4&year=2025&deg=10');
    expect(screen.getByRole('link', { name: 'Report an issue' }).getAttribute('href')).toBe('mailto:aashish.yadav@duke.edu?subject=Chargeline%20feedback');
  });
});

describe('Learn uses the shared vocabulary', () => {
  it('shows none of the retired labels', async () => {
    view();
    await new Promise((r) => setTimeout(r, 50));
    expect(retiredIn(document.body.textContent ?? '')).toEqual([]);
  });
});
