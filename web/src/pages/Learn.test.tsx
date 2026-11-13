// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Guide from './Guide';
import { About, Glossary, LIMITS, Limits, SITE_CARDS, SUB_TABS, SiteGuide } from './Learn';
import { Footer } from '../components/shell/Footer';
import { Markdown } from '../components/Markdown';
import { parseDoc } from '../data/markdown';
import { GLOSSARY, glossaryEntries, SITE } from '../data/site';
import { V5 } from '../config/features';
import { TERMS } from '../copy/terms';
import { retiredIn } from '../copy/retired';

const go = vi.fn();
vi.mock('../state', async () => {
  const route = await import('../shell/route');
  return { useApp: () => ({ go }), buildHash: route.buildHash };
});
vi.mock('../hooks', () => ({ useWalkthrough: () => ({}) }));

const tour = vi.fn();
vi.mock('../components/tour/steps', () => ({ requestTour: () => tour() }));

afterEach(() => { cleanup(); go.mockClear(); tour.mockClear(); });
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  Element.prototype.scrollIntoView ??= () => {};
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const view = (ui: React.ReactElement) => render(<MantineProvider>{ui}</MantineProvider>);
const FINDINGS_LINKS = '# Findings\n\nSee [the methodology](../docs/ANCILLARY_METHOD.md) and [a source](https://example.com/x).';
const SEL = { location: 'HB_WEST', duration: 4, year: 2025, deg: 10 };

describe('Site guide', () => {
  it('has one card per page with a WebP picture, a one-line question and a link', () => {
    view(<SiteGuide />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Site guide');
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual(['Home', 'Atlas', 'Studio', 'Research']);
    for (const [i, c] of SITE_CARDS.entries()) {
      const img = cards[i].querySelector('img')!;
      expect(img.getAttribute('src')).toMatch(new RegExp(`images/site-guide/${c.page}\\.webp$`));
      expect(img.getAttribute('alt')).toBe(c.alt);
      fireEvent.click(within(cards[i]).getByRole('link', { name: `Open ${c.title} →` }));
      expect(go).toHaveBeenLastCalledWith(c.page, expect.objectContaining({ location: 'HB_HOUSTON' }));
    }
  });

  it('lists the Research and Atlas sub-tabs with a line each, and offers the tour', () => {
    view(<SiteGuide />);
    expect(SUB_TABS.map((g) => [g.group, g.items.map((i) => i.label)])).toEqual([
      ['Research', ['Findings', 'Revenue', 'Charging pattern', 'Reality check', 'Method']],
      ['Atlas', ['All nodes', 'Study sites']],
    ]);
    for (const g of SUB_TABS) {
      const box = screen.getByRole('heading', { name: `Inside ${g.group}` }).closest('section')!;
      expect(within(box).getAllByRole('listitem')).toHaveLength(g.items.length);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(tour).toHaveBeenCalledOnce();
  });
});

describe('Limits', () => {
  it('has the five points, the perfect-foresight upper bound and a link to Method', () => {
    view(<Limits />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(LIMITS.map((l) => l.title));
    expect(LIMITS).toHaveLength(5);
    expect(document.body.textContent).toContain(`${TERMS.perfectForesight.label} is an upper bound`);
    fireEvent.click(screen.getByRole('link', { name: /Read the full list on the Method page/ }));
    expect(go).toHaveBeenCalledWith('method');
  });
});

describe('Glossary', () => {
  it('lists every term A to Z, with the short definition for the shared terms', () => {
    view(<Glossary />);
    const terms = [...document.querySelectorAll('dt')].map((t) => t.textContent!);
    // With V5 on (the web-v5 CI job) the page also lists the four V5 terms (src/v5/glossary.ts).
    expect(terms).toHaveLength(Object.keys(GLOSSARY).filter((id) => !id.endsWith('_v4')).length + (V5 ? 4 : 0));
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    const def = (label: string) => [...document.querySelectorAll('dt')].find((t) => t.textContent === label)!.nextElementSibling!.textContent;
    expect(def(TERMS.captureRate.label)).toBe(TERMS.captureRate.definition);
    expect(def(TERMS.hub.label)).toBe(TERMS.hub.definition);
    // Terms that are not in terms.ts keep their definition.
    expect(glossaryEntries().find((g) => g.id === 'cycles')!.definition).toBe(GLOSSARY.cycles.definition);
  });
});

describe('About', () => {
  it('shows the photo (WebP with a JPEG fallback), the exact text and the two links', () => {
    view(<About />);
    const img = screen.getByAltText('Aashish Yadav');
    expect(img.getAttribute('src')).toMatch(/images\/aashish-yadav\.jpg$/);
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.style.borderRadius).toBe('20px');
    expect(img.style.width).toBe('160px');
    expect(img.previousElementSibling!.getAttribute('srcset')).toMatch(/images\/aashish-yadav\.webp$/);
    const text = document.body.textContent!;
    expect(text).toContain('Aashish Yadav is a final-year graduate student at Duke University studying energy economics and policy.');
    expect(text).toContain('Chargeline is an experiment he built for fun over Halloween 2026. It is an independent project, not affiliated with ERCOT or any company. Suggestions are welcome.');
    expect(screen.getByRole('link', { name: 'LinkedIn' }).getAttribute('href')).toBe(SITE.linkedin);
    expect(screen.getByRole('link', { name: SITE.email }).getAttribute('href')).toBe(`mailto:${SITE.email}`);
  });
});

describe('links', () => {
  it('no github.com link renders on Learn, in the footer or in the findings text', () => {
    const blocks = parseDoc(FINDINGS_LINKS).intro;
    for (const ui of [<Guide />, <SiteGuide />, <Limits />, <Glossary />, <About />, <Footer index={null} sel={SEL} />, <Markdown blocks={blocks} />]) {
      const { container, unmount } = view(ui);
      const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
      expect(hrefs.filter((h) => /github\.com/i.test(h))).toEqual([]);
      expect(container.textContent).not.toMatch(/Source code on GitHub|GitHub Issues/);
      unmount();
    }
  });

  it('renders a repository link from the findings as plain text and keeps web links', () => {
    const { container } = view(<Markdown blocks={parseDoc(FINDINGS_LINKS).intro} />);
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/x']);
    expect(container.textContent).toContain('See the methodology and a source.');
  });
});

describe('Learn uses the shared vocabulary', () => {
  it('shows none of the retired labels', () => {
    for (const ui of [<SiteGuide />, <Limits />, <Glossary />, <About />]) {
      const { unmount } = view(ui);
      expect(retiredIn(document.body.textContent ?? '')).toEqual([]);
      unmount();
    }
  });
});
