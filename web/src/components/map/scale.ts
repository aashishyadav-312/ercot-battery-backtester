import type { IndexRun } from '../../data/types';

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

/** One sequential blue ramp per colour scheme. Light mode: darker = higher. Dark mode: lighter = higher. */
const RAMP = {
  light: ['#cfe3fa', '#86b6ef', '#3987e5', '#1c5cab', '#104281'],
  dark: ['#27456f', '#3269b0', '#4f8fe0', '#86b6ef', '#d0e4fb'],
};
/** Colour for a location with no capture rate. */
export const NO_DATA = { light: '#a8a7a0', dark: '#6f6e68' };

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Colour at position t in [0, 1] along the ramp. */
export function rampAt(t: number, mode: 'light' | 'dark'): string {
  const r = RAMP[mode];
  const x = Math.min(1, Math.max(0, t)) * (r.length - 1);
  const i = Math.min(r.length - 2, Math.floor(x));
  const a = hex(r[i]);
  const b = hex(r[i + 1]);
  return toHex(a.map((v, k) => v + (b[k] - v) * (x - i)));
}

export function captureColor(c: number | null | undefined, d: Domain, mode: 'light' | 'dark'): string {
  if (c == null) return NO_DATA[mode];
  return rampAt((c - d.capMin) / (d.capMax - d.capMin), mode);
}

export const SIZE_MIN = 12;
export const SIZE_MAX = 42;
/** Marker diameter in px; area grows with revenue. Zero or negative revenue gets the smallest marker. */
export function markerSize(rev: number | null | undefined, d: Domain): number {
  if (rev == null || rev <= 0) return SIZE_MIN;
  return SIZE_MIN + (SIZE_MAX - SIZE_MIN) * Math.sqrt(Math.min(1, rev / d.revMax));
}
