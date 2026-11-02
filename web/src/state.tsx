import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { IndexRun, NodeSelection, Run, Selection } from './data/types';
import { DEGS, DURATIONS, YEARS, loadIndex, loadNodeSelection, loadRun } from './data/loader';
import { buildHash, resolveHash, type Page, type Tab } from './shell/route';

export { PAGES, buildHash } from './shell/route';
export type { Page, Tab } from './shell/route';

const DEFAULT: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };

/**
 * State lives in the URL hash (#/research/revenue?loc=HB_WEST&dur=4&year=2025&deg=10) so views are shareable on static hosting.
 * Routes from before the redesign (#/revenue?...) resolve to their new home; `redirected` tells the provider to rewrite the URL.
 */
function parseHash(): { page: Page; tab: Tab; redirected: boolean; canonical: string; sel: Selection } {
  const r = resolveHash(window.location.hash);
  const q = new URLSearchParams(r.query);
  const dur = Number(q.get('dur'));
  const year = Number(q.get('year'));
  const deg = Number(q.get('deg'));
  return {
    page: r.page,
    tab: r.tab,
    redirected: r.redirected,
    canonical: r.canonical,
    sel: {
      location: q.get('loc') || DEFAULT.location,
      duration: DURATIONS.includes(dur) ? dur : DEFAULT.duration,
      year: YEARS.includes(year) ? year : DEFAULT.year,
      deg: q.has('deg') && DEGS.includes(deg) ? deg : DEFAULT.deg,
    },
  };
}

interface Ctx {
  page: Page;
  tab: Tab;
  sel: Selection;
  setSel: (patch: Partial<Selection>) => void;
  go: (page: Page, patch?: Partial<Selection>) => void;
  index: IndexRun[] | null;
  nodes: NodeSelection | null;
  error: string | null;
}
const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState(parseHash);
  const [index, setIndex] = useState<IndexRun[] | null>(null);
  const [nodes, setNodes] = useState<NodeSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An old or unknown URL is rewritten in place (no new history entry), so Back does not return to the old route.
  useEffect(() => {
    if (route.redirected) window.history.replaceState(null, '', route.canonical);
  }, [route]);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    Promise.all([loadIndex(), loadNodeSelection()])
      .then(([i, n]) => {
        setIndex(i);
        setNodes(n);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const go = useCallback((page: Page, patch: Partial<Selection> = {}) => {
    const next = { ...parseHash().sel, ...patch };
    window.location.hash = buildHash(page, next);
    window.scrollTo({ top: 0 });
  }, []);
  const setSel = useCallback((patch: Partial<Selection>) => {
    const cur = parseHash();
    window.location.hash = buildHash(cur.page, { ...cur.sel, ...patch });
  }, []);

  const value = useMemo(
    () => ({ page: route.page, tab: route.tab, sel: route.sel, setSel, go, index, nodes, error }),
    [route, setSel, go, index, nodes, error],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/**
 * Load one run file; `file` undefined means "no such combination".
 * While a new file loads, the previous run stays on screen (`stale`) so charts can animate
 * from the old values to the new ones instead of unmounting to a skeleton. Everything a
 * card shows is derived from the run object itself, so stale content is self-consistent.
 */
export function useRun(file: string | undefined) {
  const [state, setState] = useState<{ file?: string; run?: Run; error?: string }>({});
  useEffect(() => {
    if (!file) return;
    let live = true;
    loadRun(file)
      .then((run) => live && setState({ file, run }))
      .catch((e) => live && setState({ file, error: String(e) }));
    return () => {
      live = false;
    };
  }, [file]);
  const ready = state.file === file;
  return {
    run: file ? state.run : undefined,
    error: ready ? state.error : undefined,
    loading: !!file && !ready,
    stale: !!file && !ready && !!state.run,
  };
}

/**
 * Load several run files together (order preserved; undefined entries stay undefined).
 * Like useRun, the previous set stays available while the next loads; `files` names the
 * files the returned runs belong to, so callers label stale data correctly.
 */
export function useRuns(files: (string | undefined)[]) {
  const key = files.join('|');
  const [state, setState] = useState<{ key?: string; runs?: (Run | undefined)[]; error?: string }>({});
  useEffect(() => {
    let live = true;
    Promise.all(files.map((f) => (f ? loadRun(f) : Promise.resolve(undefined))))
      .then((runs) => live && setState({ key, runs }))
      .catch((e) => live && setState({ key, error: String(e) }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = state.key === key;
  return {
    runs: state.runs,
    files: state.key != null ? state.key.split('|').map((f) => f || undefined) : undefined,
    error: ready ? state.error : undefined,
    loading: !ready,
  };
}
