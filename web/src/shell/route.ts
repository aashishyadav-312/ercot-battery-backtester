// Routing for the five-tab shell. Pure functions only (no window access), so the redirect table is testable.
//
// A "page" is one of the original views, or a page the redesign added (Home, Atlas, Studio, Research, Guide); each lives under one of five tabs. Hash URLs are
// `#/<tab>[/<view>]?<query>`. Every URL from before the redesign (`#/overview?loc=...`) resolves to its new home
// with the query kept as written, so shared links and bookmarks keep working.

import type { Selection } from '../data/types';

export type Page = 'home' | 'atlas' | 'studio' | 'research' | 'guide' | 'map' | 'live' | 'overview' | 'revenue' | 'dispatch' | 'realism' | 'economics' | 'method';
/** Pages from before the redesign that no longer exist on their own: Studio replaced Custom run and Compare, Guide replaced Start here and About. */
type Retired = 'custom' | 'compare' | 'start' | 'about';
export type OldRoute = Exclude<Page, 'home' | 'atlas' | 'studio' | 'research' | 'guide'> | Retired;
/** The pages from before the redesign. Their bare hash (`#/live`) is an old route that redirects to its new home. */
export const OLD_PAGES: OldRoute[] = ['start', 'map', 'live', 'overview', 'revenue', 'dispatch', 'compare', 'realism', 'economics', 'custom', 'method', 'about'];
export const PAGES: Page[] = ['home', 'atlas', 'studio', 'research', 'guide', ...OLD_PAGES.filter((p): p is Exclude<OldRoute, Retired> => !['custom', 'compare', 'start', 'about'].includes(p))];
/**
 * Old routes whose content the redesign replaced: they open the new page, not the old one. The old Map page became the
 * Atlas (all nodes); its 10-location view lives on as Atlas > Detailed locations (`#/atlas/detailed`). Custom run and
 * Compare became Studio, which keeps their inputs from the query (`loc`, `dur`, `year`, `deg`, `mw`, ...).
 */
const REPLACED: Partial<Record<OldRoute, Page>> = { map: 'atlas', custom: 'studio', compare: 'studio', start: 'guide', about: 'guide' };
/** Old routes that land on one section of a page that absorbed them: `#/about` opens the Guide at its About section (`?s=about`). */
const SECTION: Partial<Record<OldRoute, string>> = { about: 'about' };
/**
 * Views of a tab that were removed: `#/studio/custom` and `#/studio/compare` were Studio's canonical URLs from step 1
 * to step 3 of the redesign, and `#/guide/start` and `#/guide/about` Guide's until step 5, so links to them open the
 * page that replaced them with their query. `#/guide/about` opens the Guide at its About section.
 */
const RETIRED_VIEWS: Partial<Record<Tab, Record<string, Page>>> = { studio: { custom: 'studio', compare: 'studio' }, guide: { start: 'guide', about: 'guide' } };
const RETIRED_SECTION: Partial<Record<Tab, Record<string, string>>> = { guide: { about: 'about' } };

export type Tab = 'home' | 'atlas' | 'studio' | 'research' | 'guide';

interface View { page: Page; slug: string; label: string }

/** Tabs in navigation order. The first view of a tab is its default; `slug` is empty for a tab with one view. */
export const TABS: { tab: Tab; label: string; views: View[] }[] = [
  { tab: 'home', label: 'Home', views: [{ page: 'home', slug: '', label: 'Overview' }, { page: 'live', slug: 'live', label: 'Today in ERCOT' }] },
  { tab: 'atlas', label: 'Atlas', views: [{ page: 'atlas', slug: '', label: 'All nodes' }, { page: 'map', slug: 'detailed', label: 'Detailed locations' }] },
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
      { page: 'overview', slug: 'overview', label: 'Run overview' },
      { page: 'revenue', slug: 'revenue', label: 'Revenue' },
      { page: 'dispatch', slug: 'dispatch', label: 'Dispatch' },
      { page: 'realism', slug: 'realism', label: 'Realism' },
      { page: 'method', slug: 'method', label: 'Method' },
    ],
  },
  { tab: 'guide', label: 'Guide', views: [{ page: 'guide', slug: '', label: 'Guide' }] },
];

export const TAB_IDS: Tab[] = TABS.map((t) => t.tab);

export function tabOf(page: Page): Tab {
  return TABS.find((t) => t.views.some((v) => v.page === page))!.tab;
}

export function viewsOf(tab: Tab): View[] {
  return TABS.find((t) => t.tab === tab)!.views;
}

/** Path (no leading `#/`, no query) of a page: "research/overview", "atlas". */
export function pathOf(page: Page): string {
  const tab = tabOf(page);
  const v = viewsOf(tab).find((x) => x.page === page)!;
  return v.slug ? `${tab}/${v.slug}` : tab;
}

/** Hash for a tab's default view, e.g. the header links. */
export function tabPath(tab: Tab): string {
  return pathOf(viewsOf(tab)[0].page);
}

export interface ResolvedRoute {
  tab: Tab;
  page: Page;
  /** Query string without the "?", exactly as written. */
  query: string;
  /** The URL this route should have, `#/research/overview?...`. */
  canonical: string;
  /** True when the incoming hash was an old route, an unknown path or an unknown view, so the URL should be rewritten. */
  redirected: boolean;
}

/** Resolve any hash, current or from before the redesign, to a route. */
export function resolveHash(hash: string): ResolvedRoute {
  const raw = hash.replace(/^#\/?/, '');
  const qi = raw.indexOf('?');
  const path = qi < 0 ? raw : raw.slice(0, qi);
  const query = qi < 0 ? '' : raw.slice(qi + 1);
  const [first = '', second = ''] = path.replace(/\/+$/, '').split('/');
  // A retired route that now lands on a section of its replacement adds `s=<section>` unless the link already names one.
  const q = query;
  const withQuery = (page: Page, section?: string) => {
    const qs = section && !new URLSearchParams(q).has('s') ? `s=${section}${q ? `&${q}` : ''}` : q;
    return `#/${pathOf(page)}${qs ? `?${qs}` : ''}`;
  };
  let section: string | undefined;

  let page: Page;
  let redirected: boolean;
  if ((TAB_IDS as string[]).includes(first)) {
    const views = viewsOf(first as Tab);
    const hit = views.find((v) => v.slug === second);
    // An unknown view, or a bare tab whose first view has its own slug (#/research), opens the tab's first view.
    page = hit?.page ?? RETIRED_VIEWS[first as Tab]?.[second] ?? views[0].page;
    section = hit ? undefined : RETIRED_SECTION[first as Tab]?.[second];
    redirected = !hit;
  } else if ((OLD_PAGES as string[]).includes(first)) {
    page = REPLACED[first as OldRoute] ?? (first as Page); // an old route: its content, in its new home
    section = SECTION[first as OldRoute];
    redirected = true;
  } else {
    page = 'home';
    redirected = raw !== '';
  }
  return { tab: tabOf(page), page, query, canonical: withQuery(page, section), redirected };
}

/**
 * One value from a hash's query string (`#/research?f=4` gives "4"), or null. Read from where the hash will be rewritten to,
 * so an old link that is still being redirected (`#/about` is `#/guide?s=about`) already answers.
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
