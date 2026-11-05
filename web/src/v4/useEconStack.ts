import { useEffect, useState } from 'react';
import { loadStack, loadStackIndex } from '../data/loader';
import { hasStack, parseStackIndex, type StackKey } from './site/stackIndex';
import { offeredStack, stackModeOf, type PlanSource } from './revenueSource';
import type { StackFile } from './stack';

interface Loaded { key: string; keys: StackKey[]; file: StackFile | null }

/**
 * The full-stack row for Project economics: the same node, year, duration and mode as the scenario, offered only when
 * results/v4/stack/index.json lists the file and it has a row for the node. `status` is 'loading' until the index (and the file it
 * lists) has settled; a missing index or file settles as "not offered", never an error on the page.
 */
export function useEconStack(year: number, durationH: number, plan: PlanSource, location: string, enabled: boolean) {
  const mode = stackModeOf(plan);
  const key = `${year}|${durationH}|${mode}`;
  const [state, setState] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadStackIndex().then(parseStackIndex, () => [] as StackKey[]).then(async (keys) => {
      const file = hasStack(keys, year, durationH, mode) ? await loadStack(year, durationH, mode).catch(() => null) : null;
      if (live) setState({ key, keys, file });
    });
    return () => { live = false; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = enabled && state?.key === key ? state : null;
  const got = ready ? offeredStack(ready.keys, ready.file, year, durationH, plan, location) : null;
  return { status: !enabled || ready ? ('ready' as const) : ('loading' as const), offered: got };
}
