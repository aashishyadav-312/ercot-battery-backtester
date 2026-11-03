import { describe, expect, it } from 'vitest';
import { OLD_PAGES, PAGES, TABS, TAB_IDS, buildHash, hashParam, pathOf, resolveHash, tabOf, tabPath, type OldRoute } from './route';

/** Where every route from before the redesign now lives (docs/REDESIGN.md, "Old to new routes"). */
const OLD_TO_NEW: Record<OldRoute, string> = {
  start: '#/learn',
  guide: '#/learn',
  map: '#/atlas',
  live: '#/home/live',
  overview: '#/research/revenue',
  revenue: '#/research/revenue',
  dispatch: '#/research/charging',
  realism: '#/research/reality',
  compare: '#/studio',
  custom: '#/studio',
  economics: '#/studio/economics',
  method: '#/research/method',
  about: '#/learn?s=about',
};

describe('old routes redirect to their new home', () => {
  it('has a redirect for every page the app had', () => {
    expect(Object.keys(OLD_TO_NEW).sort()).toEqual([...OLD_PAGES].sort());
  });

  it.each(OLD_PAGES)('#/%s resolves to its new home and asks for the URL to be rewritten', (page) => {
    const r = resolveHash(`#/${page}`);
    expect(r.canonical).toBe(OLD_TO_NEW[page as keyof typeof OLD_TO_NEW]);
    // The Map page was replaced by the Atlas; Custom run and Compare by Studio; Start here, Guide and About by Learn.
    expect(r.page).toBe(page === 'map' ? 'atlas' : page === 'custom' || page === 'compare' ? 'studio' : ['start', 'guide', 'about'].includes(page) ? 'learn' : page === 'overview' ? 'revenue' : page);

    expect(r.redirected).toBe(true);
  });

  it.each(OLD_PAGES)('#/%s keeps its query string exactly as written', (page) => {
    const q = 'loc=HB_WEST&dur=4&year=2025&deg=10&mw=100&from=2025-06-01&view=heat';
    const r = resolveHash(`#/${page}?${q}`);
    expect(r.query).toBe(q);
    const to = OLD_TO_NEW[page as keyof typeof OLD_TO_NEW];
    // An old link that now lands on a section of its replacement names the section first, then keeps the query as written.
    expect(r.canonical).toBe(to.includes('?') ? `${to}&${q}` : `${to}?${q}`);
  });

  it('accepts the hash with or without the slash', () => {
    expect(resolveHash('#overview').canonical).toBe('#/research/revenue');
    expect(resolveHash('overview?loc=HB_PAN').canonical).toBe('#/research/revenue?loc=HB_PAN');
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
    expect(TAB_IDS).toEqual(['home', 'atlas', 'studio', 'research', 'learn']);
    expect(TABS.map((t) => t.label)).toEqual(['Home', 'Atlas', 'Studio', 'Research', 'Learn']);
  });

  it('puts every page under exactly one tab', () => {
    const all = TABS.flatMap((t) => t.views.map((v) => v.page));
    expect([...all].sort()).toEqual([...PAGES].sort());
  });

  it('serves the Research findings at #/research, with the run pages under it', () => {
    const r = resolveHash('#/research?f=4');
    expect([r.page, r.tab, r.redirected, r.canonical]).toEqual(['research', 'research', false, '#/research?f=4']);
    expect(tabPath('research')).toBe('research');
    expect(tabPath('studio')).toBe('studio');
    expect(resolveHash('#/research/revenue').page).toBe('revenue');
    expect(hashParam('#/research?loc=HB_WEST&f=11', 'f')).toBe('11');
    expect(hashParam('#/research', 'f')).toBeNull();
    // An old link still being redirected already answers with the section it will land on.
    expect(hashParam('#/about', 's')).toBe('about');
    expect(hashParam('#/guide/start', 's')).toBeNull();
    expect(hashParam('#/guide/about', 's')).toBe('about');
  });

  it('falls back to the default view of a tab for an unknown view', () => {
    const r = resolveHash('#/learn/nonsense');
    expect(r.canonical).toBe('#/learn');
    expect(r.redirected).toBe(true);
    expect(resolveHash('#/research/nonsense?loc=HB_PAN').canonical).toBe('#/research?loc=HB_PAN');
  });

  it('serves Learn at #/learn, and sends every Guide URL there with its query', () => {
    expect([resolveHash('#/learn').page, resolveHash('#/learn').redirected]).toEqual(['learn', false]);
    expect(resolveHash('#/guide?loc=HB_WEST&s=glossary').canonical).toBe('#/learn?loc=HB_WEST&s=glossary');
    expect(resolveHash('#/guide').redirected).toBe(true);
    expect(resolveHash('#/guide/start?loc=HB_WEST').canonical).toBe('#/learn?loc=HB_WEST');
    expect(resolveHash('#/guide/about?loc=HB_WEST').canonical).toBe('#/learn?s=about&loc=HB_WEST');
    expect(resolveHash('#/learn/start?loc=HB_WEST').canonical).toBe('#/learn?loc=HB_WEST');
    // A link that already names a section keeps it.
    expect(resolveHash('#/about?s=glossary').canonical).toBe('#/learn?s=glossary');
    expect(buildHash('learn', { location: 'HB_WEST', duration: 4, year: 2025, deg: 10 })).toBe('#/learn?loc=HB_WEST&dur=4&year=2025&deg=10');
  });

  it('opens the renamed Research and Atlas views from their old slugs, keeping the query', () => {
    const q = 'loc=HB_WEST&dur=4&year=2025&deg=10';
    for (const [old, now, page] of [
      ['#/research/dispatch', '#/research/charging', 'dispatch'],
      ['#/research/realism', '#/research/reality', 'realism'],
      ['#/atlas/detailed', '#/atlas/sites', 'map'],
    ] as const) {
      const r = resolveHash(`${old}?${q}`);
      expect([r.page, r.redirected, r.canonical]).toEqual([page, true, `${now}?${q}`]);
      const fresh = resolveHash(`${now}?${q}`);
      expect([fresh.page, fresh.redirected]).toEqual([page, false]);
    }
    // Run overview was merged into Revenue (polish step 4): its link opens Revenue with the query kept.
    const o = resolveHash('#/research/overview?loc=HB_WEST&dur=4');
    expect([o.page, o.redirected, o.canonical]).toEqual(['revenue', true, '#/research/revenue?loc=HB_WEST&dur=4']);
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

  it('opens the all-node Atlas for old #/map links, and keeps the 10-location view at #/atlas/sites', () => {
    expect(resolveHash('#/map?view=heat').page).toBe('atlas');
    expect(resolveHash('#/atlas').page).toBe('atlas');
    expect(resolveHash('#/atlas').redirected).toBe(false);
    const d = resolveHash('#/atlas/sites?loc=HB_WEST&dur=4');
    expect([d.page, d.tab, d.redirected]).toEqual(['map', 'atlas', false]);
    expect(buildHash('map', { location: 'HB_WEST', duration: 4, year: 2025, deg: 10 })).toBe('#/atlas/sites?loc=HB_WEST&dur=4&year=2025&deg=10');
  });

  it('serves Studio at #/studio, and sends the step 1-3 Studio URLs there with their inputs', () => {
    expect([resolveHash('#/studio').page, resolveHash('#/studio').redirected]).toEqual(['studio', false]);
    const q = 'loc=HB_WEST&mw=250&dur=1.5&rte=90&deg=5&soc=20&from=2025-06-01&to=2025-08-31&strat=da';
    for (const old of ['#/studio/custom', '#/studio/compare', '#/custom', '#/compare']) {
      const r = resolveHash(`${old}?${q}`);
      expect([r.page, r.tab, r.redirected, r.canonical]).toEqual(['studio', 'studio', true, `#/studio?${q}`]);
    }
    expect(resolveHash('#/studio/economics').page).toBe('economics');
    expect(buildHash('studio', { location: 'RUSSEKST_RN', duration: 4, year: 2024, deg: 0 })).toBe('#/studio?loc=RUSSEKST_RN&dur=4&year=2024&deg=0');
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
