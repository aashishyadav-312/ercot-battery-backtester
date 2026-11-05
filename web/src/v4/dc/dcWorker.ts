/// <reference lib="webworker" />
// Web Worker for Data Center mode: one node-year takes about a second, so it runs off the main thread. HiGHS loads once and the
// price files are cached, so later runs only solve.
import highsLoader, { type Highs } from 'highs';
import wasmUrl from 'highs/runtime?url';
import { parsePriceFile, type PriceFile } from '../../custom/prices';
import { runDataCenterCase, type DataCenterResult } from '../../custom/datacenter';
import type { DcEngineInputs } from './dcForm';

export type DcRequest = { id: number; inputs: DcEngineInputs; priceUrl: string };
export type DcMessage =
  | { id: number; type: 'done'; result: DataCenterResult; ms: number }
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

self.onmessage = async (e: MessageEvent<DcRequest>) => {
  const { id, inputs, priceUrl } = e.data;
  const post = (m: DcMessage) => self.postMessage(m);
  try {
    const t0 = performance.now();
    highs ??= highsLoader({ locateFile: () => wasmUrl });
    const [solver, prices] = await Promise.all([highs, loadFile(priceUrl)]);
    const result = runDataCenterCase({ ...inputs, highs: solver, prices });
    post({ id, type: 'done', result, ms: performance.now() - t0 });
  } catch (err) {
    highs = null; // a failed runtime is reloaded on the next run
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
