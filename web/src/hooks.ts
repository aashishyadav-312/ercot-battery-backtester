import { useApp, useRun } from './state';
import { findRun } from './data/loader';

/** The run (index row + full JSON) for the current top-bar selection. */
export function useSelectedRun() {
  const { sel, index } = useApp();
  const row = index ? findRun(index, sel) : undefined;
  const { run, loading, error } = useRun(row?.file);
  return { sel, row, run, loading: loading || !index, error, missing: !!index && !row };
}
