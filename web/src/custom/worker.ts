/// <reference lib="webworker" />
// Web Worker that runs a custom battery backtest off the main thread: loads
// HiGHS (WebAssembly) once, fetches the price files for the requested years,
// solves every day and posts progress after each month.
import highsLoader, { type Highs } from 'highs';
import wasmUrl from 'highs/runtime?url';
import { parsePriceFile, type PriceFile } from './prices';
import { runCustom, type CustomParams } from './runner';

export type WorkerRequest = { id: number; params: CustomParams; priceUrls: string[] };
export type WorkerMessage =
  | { id: number; type: 'progress'; stage: 'loading' | 'solving'; month?: string; daysDone: number; daysTotal: number }
  | { id: number; type: 'done'; result: ReturnType<typeof runCustom>; ms: number }
  | { id: number; type: 'error'; message: string };

let highs: Promise<Highs> | null = null;
const files = new Map<string, Promise<PriceFile>>();

function loadFile(url: string): Promise<PriceFile> {
  let p = files.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return parsePriceFile(await r.arrayBuffer());
    });
    p.catch(() => files.delete(url));
    files.set(url, p);
  }
  return p;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, params, priceUrls } = e.data;
  const post = (m: WorkerMessage) => self.postMessage(m);
  try {
    const t0 = performance.now();
    post({ id, type: 'progress', stage: 'loading', daysDone: 0, daysTotal: 0 });
    highs ??= highsLoader({ locateFile: () => wasmUrl });
    const [solver, prices] = await Promise.all([highs, Promise.all(priceUrls.map(loadFile))]);
    const result = runCustom(solver, prices, params, (x) => post({ id, type: 'progress', stage: 'solving', ...x }));
    post({ id, type: 'done', result, ms: performance.now() - t0 });
  } catch (err) {
    highs = null; // a failed or aborted runtime is reloaded on the next run
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
