import { Suspense, lazy, useEffect, useRef } from 'react';
import { Group, Skeleton, Text } from '@mantine/core';
import { useApp } from './state';
import { Selectors } from './components/Selectors';
import { SelectorNotes } from './components/SelectorNotes';
import { CardHeadingLevel } from './components/Card';
import { Ticker } from './components/shell/Ticker';
import { Header } from './components/shell/Header';
import { ViewBar } from './components/shell/ViewBar';
import { Footer } from './components/shell/Footer';
import { Tour } from './components/tour/Tour';
import { useScheme } from './components/shell/SchemeProvider';
import { tabsFor } from './shell/route';
import Guide from './pages/Guide';
import { About, Glossary, Limits, SiteGuide } from './pages/Learn';
import Home from './pages/Home';
import HomeV5 from './pages/HomeV5';
import { V5 } from './config/features';
const Atlas = lazy(() => import('./pages/Atlas'));
const MapPage = lazy(() => import('./pages/Map')); // pulls in echarts' geo component; other pages don't need it
import Revenue from './pages/Revenue';
import Dispatch from './pages/Dispatch';
import Realism from './pages/Realism';
import Economics from './pages/Economics';
const Studio = lazy(() => import('./pages/Studio')); // the solver and worker load only when someone opens this page
const Live = lazy(() => import('./pages/Live')); // likewise the solver, and the live fetch runs only on this page
import Method from './pages/Method';
const SiteReport = lazy(() => import('./v5/site/SiteReport')); // V5 site report: its geo and result loaders come with the chunk
const Research = lazy(() => import('./pages/Research')); // the findings text and the hub run files load only when someone opens this page
import type { Page } from './state';
import classes from './App.module.css';

/** Pages without the scenario selectors (they have none, or their own inputs). */
const OWN_INPUTS: Page[] = ['site', 'home', 'atlas', 'studio', 'research', 'learn', 'siteguide', 'limits', 'glossary', 'author', 'method', 'live'];

/** Run pages whose cards sit directly under the h1. */
const FLAT_HEADINGS: Page[] = ['revenue', 'dispatch', 'realism', 'live'];

const VIEWS: Record<Page, React.ComponentType> = {
  site: SiteReport, home: V5 ? HomeV5 : Home, atlas: Atlas, studio: Studio, research: Research, learn: Guide, siteguide: SiteGuide, limits: Limits, glossary: Glossary, author: About, map: MapPage, revenue: Revenue, dispatch: Dispatch,
  realism: Realism, economics: Economics, live: Live, method: Method,
};

export default function App() {
  const { page, tab, sel, error, index } = useApp();
  const { scheme, toggle } = useScheme();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  const tabLabel = tabsFor().find((t) => t.tab === tab)!;
  const viewLabel = page === 'site' ? 'Site report' : tabLabel.views.find((v) => v.page === page)!.label;
  const title = page === 'site' ? viewLabel : tabLabel.views.length > 1 && page !== 'home' ? `${viewLabel} · ${tabLabel.label}` : tabLabel.label;

  useEffect(() => {
    document.title = `${title} · Chargeline`;
    // GoatCounter (privacy-friendly, cookie-free): count each page view, since hash routing never reloads the page.
    // window.goatcounter is only defined in production (see index.html), so this is a no-op in dev and previews.
    try { (window as unknown as { goatcounter?: { count: (o: object) => void } }).goatcounter?.count({ path: `/${page}`, title: document.title }); } catch { /* blocked */ }
    // After a navigation (not the first load) start at the top and move focus to the content, so keyboard
    // and screen-reader users land where a sighted visitor looks.
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0 });
    main.current?.focus({ preventScroll: true });
  }, [page, title]);

  const Page = VIEWS[page];
  const selectors = !OWN_INPUTS.includes(page);
  return (
    <div className={classes.app}>
      <a className={classes.skip} href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <Ticker />
      <Header active={tab} sel={sel} scheme={scheme} onToggleScheme={toggle} />
      <main id="main" ref={main} tabIndex={-1} className={classes.main}>
        {/* Home is the landing page: no sub-navigation above the hero. Its "Live prices" view links back to it. */}
        {page !== 'home' && page !== 'site' && (
          <ViewBar tab={tab} page={page} sel={sel}>
            {selectors && <Group visibleFrom="md"><Selectors /></Group>}
          </ViewBar>
        )}
        {selectors && <Group hiddenFrom="md" mb="md"><div style={{ width: '100%' }}><Selectors fullWidth /></div></Group>}
        {selectors && <SelectorNotes />}
        {/* Keyed by page so each page arrives with a short rise-and-fade (fade only under reduced motion). */}
        <div key={page} className="app-enter">
          {error ? <Text c="var(--down)">Could not load results: {error}</Text> : !index && page === 'method' ? <Skeleton h={300} radius="lg" /> : <Suspense fallback={<Skeleton h={400} radius="lg" />}><CardHeadingLevel.Provider value={FLAT_HEADINGS.includes(page) ? 2 : 3}><Page /></CardHeadingLevel.Provider></Suspense>}
        </div>
      </main>
      <Footer index={index} sel={sel} />
      <Tour />
    </div>
  );
}
