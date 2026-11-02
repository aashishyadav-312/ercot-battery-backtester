import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HUBS } from './loader';
import { cappedTotals, stackTotals, standard, windowEnd, windowRevenue, yearsOf, type ResearchData } from './research';
import type { StackRun } from './ancillary';
import type { IndexRun, NodesFile, Rtcb, Run } from './types';

// Real results files: every figure checked here is recomputed from the same data the page loads.
// Tests run from web/, so results/ is one level up (a template URL here would be rewritten into an asset import by Vite).
const readText = (f: string) => readFileSync(resolve(process.cwd(), '../results', f), 'utf8');
const read = <T,>(f: string): T => JSON.parse(readText(f));
export const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
export const NODES = read<NodesFile>('nodes_2025_2h.json');
export const RTCB = read<Rtcb>('rtcb.json');
export const FINDINGS_MD = readText('FINDINGS.md');
export const STD = standard(NODES);
const { year: Y, durationH: H, deg: DEG } = STD;
export const row = (code: string, y = Y, h = H, d = DEG) => INDEX.find((r) => r.location === code && r.year === y && r.duration_h === h && r.deg_cost_per_mwh === d)!;
export const stackRun = (code: string, y: number): StackRun => {
  const f = read<{ runs: Record<string, string> }>('ancillary.json').runs[row(code, y).file];
  return read<StackRun>(f);
};

/** The model the page builds once every file has loaded. */
export function fullData(): ResearchData {
  const stack = yearsOf(INDEX).map((y) => stackTotals(y, stackRun('HB_HOUSTON', y).daily));
  const capFile = read<{ meta: { max_as_share: number }; runs: Record<string, string> }>('ancillary_share_0.5.json');
  const capped = cappedTotals(Y, capFile.meta.max_as_share, read<StackRun>(capFile.runs[row('HB_HOUSTON').file]).daily);
  const end = windowEnd(INDEX, standard(NODES))!;
  const byHub: Record<string, Record<number, number>> = {};
  for (const h of HUBS) for (const y of yearsOf(INDEX)) (byHub[h] ??= {})[y] = windowRevenue(read<Run>(row(h, y).file), end);
  return { index: INDEX, nodes: NODES, rtcb: RTCB, stack, capped, windows: { end, years: yearsOf(INDEX), byHub } };
}
export const DATA = fullData();
export const bare = (): ResearchData => ({ index: INDEX, nodes: NODES, rtcb: RTCB, stack: [], capped: null, windows: null });

