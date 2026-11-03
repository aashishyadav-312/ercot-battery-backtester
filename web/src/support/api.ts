import { usd } from '../data/format';
import { liveUrl } from '../live/live';

/** The support routes sit on the same Worker as the live feed (and go through the same dev proxy). */
export function supportBase(): string {
  return liveUrl().replace(/\/live\.json$/, '');
}

export interface Total { raised: number; goal: number }

export async function loadTotal(fetcher: typeof fetch = fetch): Promise<Total> {
  const res = await fetcher(`${supportBase()}/support/total`);
  if (!res.ok) throw new Error(`total ${res.status}`);
  const j = (await res.json()) as Partial<Total>;
  if (typeof j.raised !== 'number' || typeof j.goal !== 'number' || !(j.goal > 0)) throw new Error('bad total');
  return { raised: Math.max(0, j.raised), goal: j.goal };
}

/** The Zelle number, or null when it is unset or the request fails. Never logged or cached. */
export async function loadZelle(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher(`${supportBase()}/support/zelle`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json()) as { zelle?: unknown };
    return typeof j.zelle === 'string' && j.zelle ? j.zelle : null;
  } catch {
    return null;
  }
}

/** Whole dollars when whole, else cents: $0, $52.50, $210. */
export const money = (v: number) => usd(v, Number.isInteger(v) ? 0 : 2);

/** The bar: fill fraction and aria value are capped at the goal; the label shows the real amount. */
export function barState(raised: number, goal: number) {
  const now = Math.min(Math.max(raised, 0), goal);
  return { fraction: goal > 0 ? now / goal : 0, now, label: `${money(raised)} of ${money(goal)}`, reached: goal > 0 && raised >= goal };
}

// The header owns the one popover; About and the footer ask it to open.
const OPEN_EVENT = 'chargeline:support';
export function requestSupport(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
export function onSupportRequest(fn: () => void): () => void {
  window.addEventListener(OPEN_EVENT, fn);
  return () => window.removeEventListener(OPEN_EVENT, fn);
}
