import { useEffect, useState } from 'react';
import { loadStack } from '../data/loader';
import { STACK_YEARS } from './config';
import type { StackFile, StackMode } from './stack';

export interface StackSet {
  realistic: Map<number, StackFile>;
  foresight: Map<number, StackFile>;
}

/** Combinations the server has no file for, so a remount does not ask again. */
const absent = new Set<string>();

/**
 * Stack files for one duration, both modes, for the given years. A combination with no file is simply left out (Tier 1 and 2
 * of Step 1 do not cover every year, duration and mode). `set` is null until the first load settles; `enabled` false loads nothing.
 */
export function useStackSet(durationH: number | null | undefined, years: readonly number[] = STACK_YEARS, enabled = true) {
  const [state, setState] = useState<{ key: string; set: StackSet } | null>(null);
  const key = `${durationH}:${years.join(',')}`;
  useEffect(() => {
    if (!enabled || durationH == null) return;
    let live = true;
    const jobs = years.flatMap((y) => (['realistic', 'foresight'] as StackMode[]).map((m) => [y, m] as const))
      .filter(([y, m]) => !absent.has(`${y}_${durationH}_${m}`));
    Promise.all(jobs.map(([y, m]) => loadStack(y, durationH, m).then((f) => [y, m, f] as const, () => {
      absent.add(`${y}_${durationH}_${m}`);
      return null;
    }))).then((got) => {
      if (!live) return;
      const set: StackSet = { realistic: new Map(), foresight: new Map() };
      for (const g of got) if (g) set[g[1]].set(g[0], g[2]);
      setState({ key, set });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return { set: state && state.key === key ? state.set : null, loading: enabled && durationH != null && (!state || state.key !== key) };
}
