// Main-thread side of Data Center mode: one Web Worker that runs requests in order. A newer request does not stop an older one
// (the solver stays loaded); the page simply ignores results for inputs it no longer shows.
import { priceUrl } from '../../custom/client';
import type { DataCenterResult } from '../../custom/datacenter';
import type { TwelveCpComparison, TwelveCpYear } from '../../custom/twelvecp';
import type { DcEngineInputs } from './dcForm';
import type { DcMessage, DcRequest } from './dcWorker';

export interface DcSolved { result: DataCenterResult; ms: number; comparison?: TwelveCpComparison }
/** With `twelveCp` (V5) the worker also runs the 12CP rule; `result` stays the 4CP run, exactly as without it. */
export type DcSolve = (inputs: DcEngineInputs, twelveCp?: TwelveCpYear) => Promise<DcSolved>;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: DcSolved) => void; reject: (e: Error) => void }>();

function start(): Worker {
  const w = new Worker(new URL('./dcWorker.ts', import.meta.url), { type: 'module' });
  w.addEventListener('message', (e: MessageEvent<DcMessage>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.type === 'done') p.resolve({ result: m.result, ms: m.ms, ...(m.comparison ? { comparison: m.comparison } : {}) });
    else p.reject(new Error(m.message));
  });
  // The worker script failed to load or crashed (for example a tab left open across a deploy).
  w.addEventListener('error', (e) => {
    e.preventDefault();
    w.terminate();
    worker = null;
    for (const p of pending.values()) p.reject(new Error('Could not start the solver in this tab. Reload the page and try again.'));
    pending.clear();
  });
  return w;
}

export const solveDcInWorker: DcSolve = (inputs, twelveCp) => {
  worker ??= start();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, inputs, priceUrl: priceUrl(inputs.node, inputs.year), ...(twelveCp ? { twelveCp } : {}) } satisfies DcRequest);
  });
};
