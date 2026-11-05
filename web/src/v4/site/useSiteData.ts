import { useEffect, useState } from 'react';
import { loadIndex, loadNodesFile, loadNodesManifest, loadPriceIndex, loadStack, loadStackIndex } from '../../data/loader';
import type { IndexRun, NodesFile } from '../../data/types';
import type { StackFile, StackMode } from '../stack';
import { EMPTY_DATA, type Settings, type SiteData } from './siteValue';
import { parseNodesManifest, parseStackIndex } from './stackIndex';

/** Where the card's result files come from. The default fetches them; tests pass files read from disk. */
export interface SiteSource {
  nodesManifest: () => Promise<unknown>;
  nodesFile: (file: string) => Promise<NodesFile>;
  runs: () => Promise<IndexRun[]>;
  stackIndex: () => Promise<unknown>;
  stackFile: (year: number, durationH: number, mode: StackMode) => Promise<StackFile>;
  /** Locations Studio has price files for. */
  priceLocations: () => Promise<string[]>;
}
export const REAL_SITE_SOURCE: SiteSource = {
  nodesManifest: loadNodesManifest,
  nodesFile: loadNodesFile,
  runs: loadIndex,
  stackIndex: loadStackIndex,
  stackFile: loadStack,
  priceLocations: () => loadPriceIndex().then((p) => [...new Set(p.files.map((f) => f.location))]),
};

type Base = Pick<SiteData, 'manifest' | 'runs' | 'stackKeys'> & { priceLocations: Set<string> };
const NONE: Base = { manifest: [], runs: [], stackKeys: [], priceLocations: new Set() };

/** The small lists: which all-node files, which stack files, the hub runs. A list that fails to load is empty, so the card still opens with what it has. */
export function useSiteBase(source: SiteSource, enabled: boolean): { base: Base; ready: boolean } {
  const [state, setState] = useState<Base | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const soft = <T,>(p: Promise<T>, empty: T) => p.catch(() => empty);
    Promise.all([
      soft(source.nodesManifest(), null), soft(source.runs(), [] as IndexRun[]), soft(source.stackIndex(), null), soft(source.priceLocations(), [] as string[]),
    ]).then(([m, runs, si, pl]) => live && setState({ manifest: parseNodesManifest(m), runs, stackKeys: parseStackIndex(si), priceLocations: new Set(pl) }));
    return () => { live = false; };
  }, [source, enabled]);
  return { base: state ?? NONE, ready: !!state };
}

/**
 * The result files for the chosen size: every all-node file of that size (Energy) or every listed stack file of that size and mode
 * (Full stack). Only files the lists name are requested, so nothing is fetched for a combination that does not exist.
 */
export function useSiteFiles(source: SiteSource, base: Base, ready: boolean, s: Settings): { files: Pick<SiteData, 'nodeFiles' | 'stackFiles'>; loading: boolean } {
  const key = `${s.basis}:${s.durationH}:${s.mode}`;
  const [state, setState] = useState<{ key: string; nodeFiles: Map<number, NodesFile>; stackFiles: Map<number, StackFile> } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const done = (nodeFiles: Map<number, NodesFile>, stackFiles: Map<number, StackFile>) => live && setState({ key, nodeFiles, stackFiles });
    if (s.basis === 'energy') {
      const want = base.manifest.filter((f) => f.durationH === s.durationH);
      Promise.all(want.map((f) => source.nodesFile(f.file).then((x) => [f.year, x] as const, () => null)))
        .then((got) => done(new Map(got.flatMap((g) => (g ? [g] : []))), new Map()));
    } else {
      const want = base.stackKeys.filter((k) => k.durationH === s.durationH && k.mode === s.mode);
      Promise.all(want.map((k) => source.stackFile(k.year, k.durationH, k.mode).then((x) => [k.year, x] as const, () => null)))
        .then((got) => done(new Map(), new Map(got.flatMap((g) => (g ? [g] : [])))));
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, ready, key, base]);
  const cur = state && state.key === key ? state : null;
  return { files: { nodeFiles: cur?.nodeFiles ?? EMPTY_DATA.nodeFiles, stackFiles: cur?.stackFiles ?? EMPTY_DATA.stackFiles }, loading: ready && !cur };
}
