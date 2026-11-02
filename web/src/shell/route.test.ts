import { describe, expect, it } from 'vitest';
import { OLD_PAGES, PAGES, TABS, TAB_IDS, buildHash, pathOf, resolveHash, tabOf, tabPath, type Page } from './route';

/** Where every route from before the redesign now lives (docs/REDESIGN.md, "Old to new routes"). */
const OLD_TO_NEW: Record<Exclude<Page, 'home'>, string> = {
  start: '#/guide/start',
  map: '#/atlas',
  live: '#/home/live',
  overview: '#/research/overview',
  revenue: '#/research/revenue',
  dispatch: '#/research/dispatch',
  realism: '#/research/realism',
  compare: '#/studio/compare',
  custom: '#/studio/custom',
  economics: '#/studio/economics',
  method: '#/research/method',
  about: '#/guide/about',
};

describe('old routes redirect to their new home', () => {
  it('has a redirect for every page the app had', () => {
    expect(Object.keys(OLD_TO_NEW).sort()).toEqual([...OLD_PAGES].sort());
  });

  it.each(OLD_PAGES)('#/%s resolves to its new home and asks for the URL to be rewritten', (page) => {
    const r = resolveHash(`#/${page}`);
    expect(r.canonical).toBe(OLD_TO_NEW[page as keyof typeof OLD_TO_NEW]);
    expect(r.page).toBe(page);
    expect(r.redirected).toBe(true);
  });

  it.each(OLD_PAGES)('#/%s keeps its query string exactly as written', (page) => {
    const q = 'loc=HB_WEST&dur=4&year=2025&deg=10&mw=100&from=2025-06-01&view=heat';
    const r = resolveHash(`#/${page}?${q}`);
    expect(r.query).toBe(q);
    expect(r.canonical).toBe(`${OLD_TO_NEW[page as keyof typeof OLD_TO_NEW]}?${q}`);
  });

  it('accepts the hash with or without the slash', () => {
    expect(resolveHash('#overview').canonical).toBe('#/research/overview');
    expect(resolveHash('overview?loc=HB_PAN').canonical).toBe('#/research/overview?loc=HB_PAN');
  });
});

describe('new routes', () => {
  it.each(PAGES)('%s round-trips through its own path without a redirect', (page) => {
    const r = resolveHash(`#/${pathOf(page)}`);
    expect(r.page).toBe(page);
    expect(r.tab).toBe(tabOf(page));
    expect(r.redirected).toBe(false);
  });

  it('has the five tabs in navigation order', () => {
    expect(TAB_IDS).toEqual(['home', 'atlas', 'studio', 'research', 'guide']);
    expect(TABS.map((t) => t.label)).toEqual(['Home', 'Atlas', 'Studio', 'Research', 'Guide']);
  });

  it('puts every page under exactly one tab', () => {
    const all = TABS.flatMap((t) => t.views.map((v) => v.page));
    expect([...all].sort()).toEqual([...PAGES].sort());
  });

  it('opens a multi-view tab on its first view, and says to rewrite the URL', () => {
    const r = resolveHash('#/research?loc=HB_PAN');
    expect(r.page).toBe('overview');
    expect(r.canonical).toBe('#/research/overview?loc=HB_PAN');
    expect(r.redirected).toBe(true);
    expect(tabPath('studio')).toBe('studio/custom');
  });

  it('falls back to the default view of a tab for an unknown view', () => {
    const r = resolveHash('#/guide/nonsense');
    expect(r.canonical).toBe('#/guide/start');
    expect(r.redirected).toBe(true);
  });

  it('opens Home for an empty or unknown hash', () => {
    expect(resolveHash('').page).toBe('home');
    expect(resolveHash('').redirected).toBe(false);
    expect(resolveHash('#/').tab).toBe('home');
    const r = resolveHash('#/no-such-page?loc=HB_PAN');
    expect(r.tab).toBe('home');
    expect(r.redirected).toBe(true);
    expect(r.canonical).toBe('#/home?loc=HB_PAN');
  });

  it("serves Home at #/home and today's prices at #/home/live, without a redirect", () => {
    expect(resolveHash('#/home').page).toBe('home');
    expect(resolveHash('#/home').redirected).toBe(false);
    expect(resolveHash('#/home/live?loc=HB_WEST').page).toBe('live');
    expect(resolveHash('#/home/live?loc=HB_WEST').redirected).toBe(false);
    expect(tabPath('home')).toBe('home');
  });

  it('builds a hash with the scenario in the query that resolves back to the same page', () => {
    const h = buildHash('revenue', { location: 'HB_WEST', duration: 4, year: 2025, deg: 10 });
    expect(h).toBe('#/research/revenue?loc=HB_WEST&dur=4&year=2025&deg=10');
    expect(resolveHash(h).page).toBe('revenue');
  });
});
