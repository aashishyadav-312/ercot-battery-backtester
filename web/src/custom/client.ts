// Main-thread side of the custom run: one Web Worker, one run at a time.
import dataVersion from '../data/data-version.json';
import type { CustomParams } from './runner';
import type { WorkerMessage, WorkerRequest } from './worker';

export type { CustomParams };
export type CustomRunResult = Extract<WorkerMessage, { type: 'done' }>['result'];
export type RunProgress = Extract<WorkerMessage, { type: 'progress' }>;

const PRICES = `${import.meta.env.BASE_URL}data/prices/`;

export function priceUrl(location: string, year: number) {
  return `${PRICES}${location}_${year}.ebp?v=${dataVersion.version}`;
}

let worker: Worker | null = null;
let nextId = 1;
let cancelRunning: (() => void) | null = null;

/**
 * Run a custom backtest in the worker. Solving blocks the worker, so starting a
 * new run while one is in progress terminates it (its promise rejects with an
 * AbortError) and starts a fresh worker.
 */
export function runInWorker(
  params: CustomParams,
  onProgress?: (p: RunProgress) => void,
): Promise<{ result: CustomRunResult; ms: number }> {
  cancelRunning?.();
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  const first = Number(params.startDate.slice(0, 4));
  const last = Number(params.endDate.slice(0, 4));
  const priceUrls = Array.from({ length: last - first + 1 }, (_, i) => priceUrl(params.location, first + i));
  return new Promise((resolve, reject) => {
    const finish = () => {
      w.removeEventListener('message', onMessage);
      cancelRunning = null;
    };
    const onMessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') return onProgress?.(m);
      finish();
      if (m.type === 'done') resolve({ result: m.result, ms: m.ms });
      else reject(new Error(m.message));
    };
    cancelRunning = () => {
      finish();
      w.terminate();
      worker = null;
      reject(new DOMException('custom run replaced by a newer one', 'AbortError'));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, params, priceUrls } satisfies WorkerRequest);
  });
}
