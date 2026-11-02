// The Live page solves at most two single-day LPs at a time (today so far and
// tomorrow), a few milliseconds each, so it loads HiGHS on the main thread
// instead of going through the Custom run's Web Worker.
import highsLoader, { type Highs } from 'highs';
import wasmUrl from 'highs/runtime?url';
import { optimizeDay, type DayResult } from '../custom/dispatch';
import { SOC0_FRAC } from '../custom/runner';

let highs: Promise<Highs> | null = null;

export const LIVE_RTE = 0.85;

/** Perfect-foresight dispatch of a 1 MW battery with `durationH` hours of storage, starting and ending empty. */
export async function solveDay(prices: number[], dtHours: number, durationH: number): Promise<DayResult> {
  highs ??= highsLoader({ locateFile: () => wasmUrl });
  try {
    return optimizeDay(await highs, prices, dtHours, 1, durationH, LIVE_RTE, 0, SOC0_FRAC);
  } catch (e) {
    highs = null;
    throw e;
  }
}
