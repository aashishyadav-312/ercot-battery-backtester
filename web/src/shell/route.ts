// Routing for the five-tab shell. Pure functions only (no window access), so the redirect table is testable.
//
// A "page" is one of the original views, or a page the redesign added (Home, Atlas, Studio, Research, Learn); each lives under one of five tabs. Hash URLs are
// `#/<tab>[/<view>]?<query>`. Every URL from before the redesign (`#/overview?loc=...`) resolves to its new home
// with the query kept as written, so shared links and bookmarks keep working.

import type { Selection } from '../data/types';
import { V5 } from '../config/features';

/** V5 layout choice, parked: true puts the Research pages inside Learn (four tabs). False keeps Research as its own tab. */
export const V5_RESEARCH_IN_LEARN = false;

export type Page = 'site' | 'home' | 'atlas' | 'studio' | 'research' | 'learn' | 'siteguide' | 'limits' | 'glossary' | 'author' | 'map' | 'live' | 'revenue' | 'dispatch' | 'realism' | 'economics' | 'method';
/**
 * Pages that no longer exist on their own: Studio replaced Custom run and Compare, Learn (first called Guide) replaced Start here and About,
 * and Revenue absorbed Run overview (polish step 4).
 */
type Retired = 'custom' | 'compare' | 'start' | 'about' | 'guide' | 'overview';
type LearnPage = 'siteguide' | 'limits' | 'glossary' | 'author';
export type OldRoute = Exclude<Page, 'site' | 'home' | 'atlas' | 'studio' | 'research' | 'learn' | LearnPage> | Retired;
/** The pages from before the redesign. Their bare hash (`#/live`) is an old route that redirects to its new home. */
export const OLD_PAGES: OldRoute[] = ['start', 'guide', 'map', 'live', 'overview', 'revenue', 'dispatch', 'compare', 'realism', 'economics', 'custom', 'method', 'about'];
export const PAGES: Page[] = ['home', 'atlas', 'studio', 'research', 'learn', 'siteguide', 'limits', 'glossary', 'author', ...OLD_PAGES.filter((p): p is Exclude<OldRoute, Retired> => !['custom', 'compare', 'start', 'about', 'guide', 'overview'].includes(p))];
/**
 * Old routes whose content the redesign replaced: they open the new page, not the old one. The old Map page became the
 * Atlas (all nodes); its 10-location view lives on as Atlas > Study sites (`#/atlas/sites`). Custom run and
 * Compare became Studio, which keeps their inputs from the query (`loc`, `dur`, `year`, `deg`, `mw`, ...).
 */
const REPLACED: Partial<Record<OldRoute, Page>> = { map: 'atlas', custom: 'studio', compare: 'studio', start: 'learn', guide: 'learn', about: 'author', overview: 'revenue' };
/**
 * Views of a tab that were removed: `#/studio/custom` and `#/studio/compare` were Studio's canonical URLs from step 1
 * to step 3 of the redesign, and `#/guide/start` was Guide's until step 5, so links to them open the page that
 * replaced them with their query.
 */
const RETIRED_VIEWS: Partial<Record<Tab, Record<string, Page>>> = { studio: { custom: 'studio', compare: 'studio' }, learn: { start: 'learn' } };
/**
 * Learn was one long page with sections (`#/learn?s=glossary`, `#/about` was `#/learn?s=about`); the sections the sub-pages
 * took over open them, with the rest of the query kept. `ercot` and `money` stay on Basics, which still scrolls to them.
 */
const LEARN_SECTION: Record<string, LearnPage> = { read: 'siteguide', 'left-out': 'limits', glossary: 'glossary', about: 'author' };
/** Tabs that were renamed: `#/guide/...` is `#/learn/...`. */
const TAB_ALIAS: Record<string, Tab> = { guide: 'learn' };
/** Views that were renamed (polish step 1) or merged (step 4, Run overview into Revenue): the old slug opens the new one. */
const VIEW_ALIAS: Partial<Record<Tab, Record<string, string>>> = {
  atlas: { detailed: 'sites' },
  research: { dispatch: 'charging', realism: 'reality', overview: 'revenue' },
  learn: { basics: '' },
};

export type Tab = 'home' | 'atlas' | 'studio' | 'research' | 'learn';

interface View {
  page: Page;
  slug: string;
  label: string;
  /** V5 only: this view is a section inside another view (the Research pages inside Learn). The view bar lists it on a second row. */
  parent?: Page;
  /** V5 only: the label on that second row, when it differs from `label`. */
  subLabel?: string;
}
type TabDef = { tab: Tab; label: string; views: View[] };

/** Tabs in navigation order. The first view of a tab is its default; `slug` is empty for a tab with one view. */
export const TABS: TabDef[] = [
  { tab: 'home', label: 'Home', views: [{ page: 'home', slug: '', label: 'Overview' }, { page: 'live', slug: 'live', label: 'Live prices' }] },
  { tab: 'atlas', label: 'Atlas', views: [{ page: 'atlas', slug: '', label: 'All nodes' }, { page: 'map', slug: 'sites', label: 'Study sites' }] },
  {
    tab: 'studio', label: 'Studio',
    views: [
      { page: 'studio', slug: '', label: 'Your battery' },
      { page: 'economics', slug: 'economics', label: 'Economics' },
    ],
  },
  {
    tab: 'research', label: 'Research',
    views: [
      { page: 'research', slug: '', label: 'Findings' },
      { page: 'revenue', slug: 'revenue', label: 'Revenue' },
      { page: 'dispatch', slug: 'charging', label: 'Charging pattern' },
      { page: 'realism', slug: 'reality', label: 'Reality check' },
      { page: 'method', slug: 'method', label: 'Method' },
    ],
  },
  {
    tab: 'learn', label: 'Learn',
    views: [
      { page: 'learn', slug: '', label: 'Basics' },
      { page: 'siteguide', slug: 'site-guide', label: 'Site guide' },
      { page: 'limits', slug: 'limits', label: 'Limits' },
      { page: 'glossary', slug: 'glossary', label: 'Glossary' },
      { page: 'author', slug: 'about', label: 'About' },
    ],
  },
];

/**
 * V5 shell: four tabs. Research is no longer a tab; its pages sit inside Learn, with the same slugs under `#/learn/`
 * (`#/research` is `#/learn/research`, `#/research/revenue` is `#/learn/revenue`). Home, Atlas and Studio are the same as before.
 */
export const TABS_V5: TabDef[] = [
  TABS[0],
  TABS[1],
  TABS[2],
  {
    tab: 'learn', label: 'Learn',
    views: [
      { page: 'learn', slug: '', label: 'Basics' },
      { page: 'research', slug: 'research', label: 'Research', subLabel: 'Findings' },
      { page: 'revenue', slug: 'revenue', label: 'Revenue', parent: 'research' },
      { page: 'dispatch', slug: 'charging', label: 'Charging pattern', parent: 'research' },
      { page: 'realism', slug: 'reality', label: 'Reality check', parent: 'research' },
      { page: 'method', slug: 'method', label: 'Method', parent: 'research' },
      { page: 'siteguide', slug: 'site-guide', label: 'Site guide' },
      { page: 'limits', slug: 'limits', label: 'Limits' },
      { page: 'glossary', slug: 'glossary', label: 'Glossary' },
      { page: 'author', slug: 'about', label: 'About' },
    ],
  },
];

/** The tabs of the shell in use: five, unless V5 is on and the parked four-tab layout (Research inside Learn) is switched on. */
export const tabsFor = (v5: boolean = V5, inLearn: boolean = V5_RESEARCH_IN_LEARN): TabDef[] => (v5 && inLearn ? TABS_V5 : TABS);

export const TAB_IDS: Tab[] = TABS.map((t) => t.tab);

export function tabOf(page: Page, v5: boolean = V5): Tab {
  if (page === 'site') return 'atlas'; // V5 site report: not a view of any tab, but the Atlas tab is the one that stays marked
  return tabsFor(v5).find((t) => t.views.some((v) => v.page === page))!.tab;
}

export function viewsOf(tab: Tab, v5: boolean = V5): View[] {
  return (tabsFor(v5).find((t) => t.tab === tab) ?? TABS.find((t) => t.tab === tab)!).views;
}

/** Path (no leading `#/`, no query) of a page: "research/revenue", "atlas". */
export function pathOf(page: Page, v5: boolean = V5): string {
  if (page === 'site') return 'site';
  const tab = tabOf(page, v5);
  const v = viewsOf(tab, v5).find((x) => x.page === page)!;
  return v.slug ? `${tab}/${v.slug}` : tab;
}

/** Hash for a tab's default view, e.g. the header links. */
export function tabPath(tab: Tab, v5: boolean = V5): string {
  return pathOf(viewsOf(tab, v5)[0].page, v5);
}

export interface ResolvedRoute {
  tab: Tab;
  page: Page;
  /** Query string without the "?", exactly as written. */
  query: string;
  /** The URL this route should have, `#/research/revenue?...`. */
  canonical: string;
  /** True when the incoming hash was an old route, an unknown path or an unknown view, so the URL should be rewritten. */
  redirected: boolean;
}

/** Resolve any hash, current or from before the redesign, to a route. */
export function resolveHash(hash: string, v5: boolean = V5): ResolvedRoute {
  const raw = hash.replace(/^#\/?/, '');
  const qi = raw.indexOf('?');
  const path = qi < 0 ? raw : raw.slice(0, qi);
  const query = qi < 0 ? '' : raw.slice(qi + 1);
  const [first = '', second = ''] = path.replace(/\/+$/, '').split('/');
  let q = query;

  let page: Page;
  let redirected: boolean;
  const tabId = TAB_ALIAS[first] ?? first;
  if (v5 && first === 'site') {
    // V5: the site report, `#/site?lat=&lon=&dur=&year=`. Not a view of a tab; with V5 off the word is unknown and opens Home, as before.
    page = 'site';
    redirected = second !== '';
  } else if (v5 && V5_RESEARCH_IN_LEARN && tabId === 'research') {
    // V5: Research lives inside Learn. `#/research` opens Findings, `#/research/<view>` opens that view, old view names included.
    const renamed = VIEW_ALIAS.research?.[second];
    const hit = second === '' ? undefined : viewsOf('learn', true).find((v) => v.slug === (renamed ?? second));
    page = hit?.page ?? 'research';
    redirected = true;
  } else if ((TAB_IDS as string[]).includes(tabId)) {
    const views = viewsOf(tabId as Tab, v5);
    const renamed = VIEW_ALIAS[tabId as Tab]?.[second];
    const hit = views.find((v) => v.slug === (renamed ?? second));
    // An unknown view, or a bare tab whose first view has its own slug (#/research), opens the tab's first view.
    page = hit?.page ?? RETIRED_VIEWS[tabId as Tab]?.[second] ?? views[0].page;
    redirected = !hit || renamed != null || tabId !== first;
  } else if ((OLD_PAGES as string[]).includes(first)) {
    page = REPLACED[first as OldRoute] ?? (first as Page); // an old route: its content, in its new home
    redirected = true;
  } else {
    page = 'home';
    redirected = raw !== '';
  }
  // `#/learn?s=glossary` (before Learn had sub-pages) opens that sub-page.
  const params = new URLSearchParams(q);
  const moved = page === 'learn' ? LEARN_SECTION[params.get('s') ?? ''] : undefined;
  if (moved) {
    params.delete('s');
    q = params.toString();
    page = moved;
    redirected = true;
  }
  return { tab: tabOf(page, v5), page, query, canonical: `#/${pathOf(page, v5)}${q ? `?${q}` : ''}`, redirected };
}

/**
 * One value from a hash's query string (`#/research?f=4` gives "4"), or null. Read from where the hash will be rewritten to,
 * so an old link that is still being redirected (`#/about` is `#/learn?s=about`) already answers.
 */
export function hashParam(hash: string, key: string): string | null {
  const c = resolveHash(hash).canonical;
  const qi = c.indexOf('?');
  return qi < 0 ? null : new URLSearchParams(c.slice(qi + 1)).get(key);
}

/** Hash for a page with the scenario selection in the query: `#/research/revenue?loc=HB_WEST&dur=2&year=2025&deg=10`. */
export function buildHash(page: Page, s: Selection) {
  const q = new URLSearchParams({ loc: s.location, dur: String(s.duration), year: String(s.year), deg: String(s.deg) });
  return `#/${pathOf(page)}?${q}`;
}
