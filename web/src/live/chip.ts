// The live chip in the Home hero: one hub's latest real-time price from the Worker snapshot (src/live/live.ts).
// Pure, so every state can be tested without a network. Nothing here invents a price.
import { usd } from '../data/format';
import { locName } from '../data/site';
import { STALE_MIN, ago, ctTime, intervalStart, latest, type LiveLoad } from './live';

export type ChipState = 'loading' | 'live' | 'delayed' | 'unavailable';

export interface LiveChip {
  state: ChipState;
  text: string;
  /** Changes with every new snapshot, so the dot can pulse once per refresh; null when there is nothing live. */
  stamp: string | null;
}

export function liveChip(load: LiveLoad | null, now: number, loc = 'HB_HOUSTON'): LiveChip {
  if (load === null) return { state: 'loading', text: 'Loading live prices', stamp: null };
  if (load.source === 'none') return { state: 'unavailable', text: 'Live prices unavailable', stamp: null };
  const s = load.state;
  const name = locName(loc).replace(/ hub$/i, '');
  const l = latest(s.today.rt[loc] ?? []);
  if (!l) return { state: 'unavailable', text: `No ${name} price posted yet today`, stamp: null };
  const end = intervalStart(s.today, l.index + 1);
  const price = `${name} ${usd(l.price, 2)}/MWh`;
  if (load.source === 'cache' || now - end > STALE_MIN * 60_000) {
    return { state: 'delayed', text: `Delayed · ${ago(end, now).replace(/ ago$/, '')} old · ${price}`, stamp: s.checkedAt };
  }
  return { state: 'live', text: `Live · ${price} · ${ctTime(end)} CT`, stamp: s.checkedAt };
}
