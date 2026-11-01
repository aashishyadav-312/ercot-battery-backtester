import { useEffect, useState } from 'react';
import { useApp, useRun } from './state';
import { findRun, loadLocations, loadTexas, loadWalkthrough } from './data/loader';
import type { Walkthrough } from './data/types';

/** The run (index row + full JSON) for the current top-bar selection. While a new run loads, the previous one is kept (`stale`). */
export function useSelectedRun() {
  const { sel, index } = useApp();
  const row = index ? findRun(index, sel) : undefined;
  const { run, loading, stale, error } = useRun(row?.file);
  return { sel, row, run, loading: loading || !index, stale, error, missing: !!index && !row };
}

/** The featured-day file for the Start-here walkthrough (loaded once, cached by the loader). */
export function useWalkthrough() {
  const [state, setState] = useState<{ data?: Walkthrough; error?: string }>({});
  useEffect(() => {
    let live = true;
    loadWalkthrough()
      .then((data) => live && setState({ data }))
      .catch((e) => live && setState({ error: String(e) }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** Load a cached JSON file once, with `data` / `error` state. */
function useLoaded<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    load()
      .then((data) => live && setState({ data }))
      .catch((e) => live && setState({ error: String(e) }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

/** Settlement points with coordinates for the Map page (results/locations.json). */
export const useLocations = () => useLoaded(loadLocations);
/** Texas outline and counties for the Map page; only fetched when the Map page opens. */
export const useTexas = () => useLoaded(loadTexas);
