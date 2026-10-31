import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { IndexRun, NodeSelection, Run, Selection } from './data/types';
import { DEGS, DURATIONS, YEARS, loadIndex, loadNodeSelection, loadRun } from './data/loader';

export type Page = 'overview' | 'revenue' | 'dispatch' | 'compare' | 'method';
export const PAGES: Page[] = ['overview', 'revenue', 'dispatch', 'compare', 'method'];

const DEFAULT: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };

/** State lives in the URL hash (#/revenue?loc=HB_WEST&dur=4&year=2025&deg=10) so views are shareable on static hosting. */
function parseHash(): { page: Page; sel: Selection } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const page = (PAGES as string[]).includes(path) ? (path as Page) : 'overview';
  const q = new URLSearchParams(query);
  const dur = Number(q.get('dur'));
  const year = Number(q.get('year'));
  const deg = Number(q.get('deg'));
  return {
    page,
    sel: {
      location: q.get('loc') || DEFAULT.location,
      duration: DURATIONS.includes(dur) ? dur : DEFAULT.duration,
      year: YEARS.includes(year) ? year : DEFAULT.year,
      deg: q.has('deg') && DEGS.includes(deg) ? deg : DEFAULT.deg,
    },
  };
}

function buildHash(page: Page, s: Selection) {
  const q = new URLSearchParams({ loc: s.location, dur: String(s.duration), year: String(s.year), deg: String(s.deg) });
  return `#/${page}?${q}`;
}

interface Ctx {
  page: Page;
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
    () => ({ page: route.page, sel: route.sel, setSel, go, index, nodes, error }),
    [route, setSel, go, index, nodes, error],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Load one run file; `file` undefined means "no such combination". */
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
  return { run: ready ? state.run : undefined, error: ready ? state.error : undefined, loading: !!file && !ready };
}

/** Load several run files together (order preserved; undefined entries stay undefined). */
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
  return { runs: ready ? state.runs : undefined, error: ready ? state.error : undefined, loading: !ready };
}
