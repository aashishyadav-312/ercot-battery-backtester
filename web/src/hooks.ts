import { useApp, useRun } from './state';
import { findRun } from './data/loader';

/** The run (index row + full JSON) for the current top-bar selection. While a new run loads, the previous one is kept (`stale`). */
export function useSelectedRun() {
  const { sel, index } = useApp();
  const row = index ? findRun(index, sel) : undefined;
  const { run, loading, stale, error } = useRun(row?.file);
  return { sel, row, run, loading: loading || !index, stale, error, missing: !!index && !row };
}
