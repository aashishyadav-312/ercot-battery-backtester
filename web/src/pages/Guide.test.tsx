// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Guide, { GUIDE_SECTIONS } from './Guide';
import { Footer } from '../components/shell/Footer';
import { GLOSSARY, SITE } from '../data/site';
import { GUIDE } from '../data/start';
import { retiredIn } from '../copy/retired';

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

describe('Guide merges Start here, the glossary and About', () => {
  it('has the six sections, each reachable from the list at the top', () => {
    view();
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual(['ercot', 'money', 'read', 'left-out', 'glossary', 'about']);
    const nav = screen.getByRole('navigation', { name: 'Sections on this page' });
    expect(within(nav).getAllByRole('button')).toHaveLength(GUIDE_SECTIONS.length);
    for (const s of GUIDE_SECTIONS) expect(document.getElementById(s.id)?.tagName, s.id).toBe('H2');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Learn');
  });

  it('lists every glossary term with its definition', () => {
    view();
    const terms = document.querySelectorAll('dt');
    for (const g of Object.values(GLOSSARY)) {
      const dt = [...terms].find((t) => t.textContent === g.term);
      expect(dt, g.term).toBeTruthy();
      expect(dt!.nextElementSibling!.textContent).toBe(g.definition);
    }
  });

  it('carries what About said: author, sources, license, feedback links and privacy', () => {
    view();
    const about = document.getElementById('about')!.closest('section')!;
    for (const h of ['Author', 'Data sources', 'License', 'Ideas and feedback', 'Privacy']) {
      expect(within(about).getByRole('heading', { name: h })).toBeTruthy();
    }
    expect(within(about).getByRole('link', { name: 'Source code on GitHub' }).getAttribute('href')).toBe(SITE.repo);
    expect(within(about).getByRole('link', { name: 'Report a problem' }).getAttribute('href')).toBe(SITE.issues);
    expect(within(about).getByRole('link', { name: 'Suggest a feature' }).getAttribute('href')).toBe(SITE.featureRequest);
  });

  it('still points every card at a page that exists', () => {
    view();
    const read = document.getElementById('read')!.closest('section')!;
    expect(within(read).getAllByRole('article')).toHaveLength(GUIDE.length);
  });
});

describe('opening at a section', () => {
  it('scrolls to the section named in the hash (the footer About link and old #/about links)', async () => {
    window.location.hash = '#/learn?s=about';
    const seen: Element[] = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { seen.push(this); };
    view();
    await waitFor(() => expect(seen.map((e) => e.id)).toContain('about'));
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

  it('is what the footer About link opens', () => {
    render(<Footer index={null} sel={{ location: 'HB_WEST', duration: 4, year: 2025, deg: 10 }} />);
    expect(screen.getByRole('link', { name: 'About' }).getAttribute('href')).toBe('#/learn?loc=HB_WEST&dur=4&year=2025&deg=10&s=about');
    fireEvent.click(screen.getByRole('link', { name: 'About' }));
  });
});

describe('Learn uses the shared vocabulary', () => {
  it('shows none of the retired labels', async () => {
    view();
    await new Promise((r) => setTimeout(r, 50));
    expect(retiredIn(document.body.textContent ?? '')).toEqual([]);
  });
});
