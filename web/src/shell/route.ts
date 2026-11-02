// Routing for the five-tab shell. Pure functions only (no window access), so the redirect table is testable.
//
// A "page" is one of the twelve original views, or a page the redesign added (Home, Atlas); each lives under one of five tabs. Hash URLs are
// `#/<tab>[/<view>]?<query>`. Every URL from before the redesign (`#/overview?loc=...`) resolves to its new home
// with the query kept as written, so shared links and bookmarks keep working.

import type { Selection } from '../data/types';

export type Page = 'home' | 'atlas' | 'start' | 'map' | 'live' | 'overview' | 'revenue' | 'dispatch' | 'compare' | 'realism' | 'economics' | 'custom' | 'method' | 'about';
/** The pages from before the redesign. Their bare hash (`#/live`) is an old route that redirects to its new home. */
export const OLD_PAGES: Page[] = ['start', 'map', 'live', 'overview', 'revenue', 'dispatch', 'compare', 'realism', 'economics', 'custom', 'method', 'about'];
export const PAGES: Page[] = ['home', 'atlas', ...OLD_PAGES];
/**
 * Old routes whose content the redesign replaced: they open the new page, not the old one. The old Map page became the
 * Atlas (all nodes); its 10-location view lives on as Atlas > Detailed locations (`#/atlas/detailed`).
 */
const REPLACED: Partial<Record<Page, Page>> = { map: 'atlas' };

export type Tab = 'home' | 'atlas' | 'studio' | 'research' | 'guide';

interface View { page: Page; slug: string; label: string }

/** Tabs in navigation order. The first view of a tab is its default; `slug` is empty for a tab with one view. */
export const TABS: { tab: Tab; label: string; views: View[] }[] = [
  { tab: 'home', label: 'Home', views: [{ page: 'home', slug: '', label: 'Overview' }, { page: 'live', slug: 'live', label: 'Today in ERCOT' }] },
  { tab: 'atlas', label: 'Atlas', views: [{ page: 'atlas', slug: '', label: 'All nodes' }, { page: 'map', slug: 'detailed', label: 'Detailed locations' }] },
  {
    tab: 'studio', label: 'Studio',
    views: [
      { page: 'custom', slug: 'custom', label: 'Custom run' },
      { page: 'compare', slug: 'compare', label: 'Compare' },
      { page: 'economics', slug: 'economics', label: 'Economics' },
    ],
  },
  {
    tab: 'research', label: 'Research',
    views: [
      { page: 'overview', slug: 'overview', label: 'Overview' },
      { page: 'revenue', slug: 'revenue', label: 'Revenue' },
      { page: 'dispatch', slug: 'dispatch', label: 'Dispatch' },
      { page: 'realism', slug: 'realism', label: 'Realism' },
      { page: 'method', slug: 'method', label: 'Method' },
    ],
  },
  { tab: 'guide', label: 'Guide', views: [{ page: 'start', slug: 'start', label: 'Start here' }, { page: 'about', slug: 'about', label: 'About' }] },
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
  const withQuery = (page: Page) => `#/${pathOf(page)}${query ? `?${query}` : ''}`;

  let page: Page;
  let redirected: boolean;
  if ((TAB_IDS as string[]).includes(first)) {
    const views = viewsOf(first as Tab);
    const hit = views.find((v) => v.slug === second);
    page = (hit ?? views[0]).page;
    redirected = !hit; // an unknown view, or a bare tab whose first view has its own slug (#/studio)
  } else if ((OLD_PAGES as string[]).includes(first)) {
    page = REPLACED[first as Page] ?? (first as Page); // an old route: its content, in its new home
    redirected = true;
  } else {
    page = 'home';
    redirected = raw !== '';
  }
  return { tab: tabOf(page), page, query, canonical: withQuery(page), redirected };
}

/** Hash for a page with the scenario selection in the query: `#/research/revenue?loc=HB_WEST&dur=2&year=2025&deg=10`. */
export function buildHash(page: Page, s: Selection) {
  const q = new URLSearchParams({ loc: s.location, dur: String(s.duration), year: String(s.year), deg: String(s.deg) });
  return `#/${pathOf(page)}?${q}`;
}
