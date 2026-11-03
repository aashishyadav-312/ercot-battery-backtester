import type { IndexRun } from '../../data/types';
import { mix, type ChartTheme } from '../../theme/chartColors';

/** Value ranges for the whole results grid, so marker size and colour mean the same thing whichever selector is chosen. */
export interface Domain {
  revMax: number;
  capMin: number;
  capMax: number;
}

export function domainOf(index: IndexRun[]): Domain {
  const caps = index.map((r) => r.capture_rate).filter((c): c is number => c != null);
  return {
    revMax: Math.max(...index.map((r) => r.revenue_per_kw_year)),
    capMin: Math.floor(Math.min(...caps) * 20) / 20,
    capMax: Math.ceil(Math.max(...caps) * 20) / 20,
  };
}

/**
 * Capture rate runs from the faintest chart grey (low) to mint (high), both tokens. `mix` blends the two in sRGB; the
 * DOM legend draws the same ramp with CSS (MapLegend), so map and legend match in both themes.
 */
export function rampAt(x: number, t: ChartTheme): string {
  return mix(t.mint, t.grey[2], Math.min(1, Math.max(0, x)));
}

export function captureColor(c: number | null | undefined, d: Domain, t: ChartTheme): string {
  if (c == null) return t.noData;
  return rampAt((c - d.capMin) / (d.capMax - d.capMin), t);
}

export const SIZE_MIN = 12;
export const SIZE_MAX = 42;
/** Marker diameter in px; area grows with revenue. Zero or negative revenue gets the smallest marker. */
export function markerSize(rev: number | null | undefined, d: Domain): number {
  if (rev == null || rev <= 0) return SIZE_MIN;
  return SIZE_MIN + (SIZE_MAX - SIZE_MIN) * Math.sqrt(Math.min(1, rev / d.revMax));
}

// ------------------------------------------------------------ planned-storage layer (Phase 17)
/**
 * Queue layer: county shades from the land colour toward the text colour, so they never read as the mint capture scale.
 * Class i is QUEUE_MIX[i] percent text over land; QueueLegend draws the same steps with CSS color-mix.
 */
export const QUEUE_MIX = [14, 28, 42, 56, 70];
export const QUEUE_CLASSES = QUEUE_MIX.length;

/** Colour class 0..QUEUE_CLASSES-1 of a county's queued MW; breaks come from quantileBreaks over counties that have any. */
export function queueColor(mw: number, breaks: number[], t: ChartTheme): string {
  let i = 0;
  while (i < breaks.length && mw > breaks[i]) i++;
  return mix(t.text, t.land, QUEUE_MIX[i] / 100);
}
export const queueSwatch = (i: number) => `color-mix(in srgb, var(--text) ${QUEUE_MIX[i]}%, var(--land))`;

// ------------------------------------------------------------ equal-count classes
/**
 * Quantile class breaks: k - 1 interior cut points so each colour holds about the same number of counties.
 * A quantile scale keeps the many ordinary values from collapsing into one colour next to a handful of extreme ones.
 */
export function quantileBreaks(values: number[], k = QUEUE_CLASSES): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return [];
  return Array.from({ length: k - 1 }, (_, i) => {
    const pos = ((i + 1) / k) * (v.length - 1);
    const lo = Math.floor(pos);
    return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (pos - lo);
  });
}
