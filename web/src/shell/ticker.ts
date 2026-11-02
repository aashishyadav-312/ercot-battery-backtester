// The ticker's content, derived from the live snapshot the Phase 16 Worker serves (src/live/live.ts).
// Nothing here invents a price: with no snapshot the model says so and carries no items.
import { STALE_MIN, ago, ctTime, latest, moveDir, pricesThrough, type LiveLoad, type MoveDir } from '../live/live';

export interface TickerItem {
  loc: string;
  price: string;
  /** Change from the previous 15-minute interval, signed, or null when that interval is missing. */
  change: string | null;
  dir: MoveDir;
}

export type TickerStatus = 'loading' | 'live' | 'delayed' | 'cached' | 'empty' | 'unavailable';

export interface TickerModel {
  status: TickerStatus;
  items: TickerItem[];
  /** Short label next to the strip title ("Delayed", "Saved 3 h ago"), or null when the feed is current. */
  badge: string | null;
  /** Plain sentence for screen readers and for the states with no items. */
  summary: string;
}

const money = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${money(Math.abs(n))}`;

function itemsOf(load: Extract<LiveLoad, { state: unknown }>): TickerItem[] {
  const { state } = load;
  const out: TickerItem[] = [];
  for (const loc of state.hubs) {
    const l = latest(state.today.rt[loc] ?? []);
    if (!l) continue;
    out.push({
      loc,
      price: money(l.price),
      change: l.change === null ? null : signed(Math.round(l.change * 100) / 100),
      dir: l.change === null ? 'flat' : moveDir(l.change),
    });
  }
  return out;
}

export function tickerModel(load: LiveLoad | null, now: number): TickerModel {
  if (load === null) return { status: 'loading', items: [], badge: null, summary: 'Loading live prices' };
  if (load.source === 'none') return { status: 'unavailable', items: [], badge: null, summary: 'Live prices unavailable' };

  const items = itemsOf(load);
  if (items.length === 0) return { status: 'empty', items, badge: null, summary: 'No prices posted yet today' };

  const through = pricesThrough(load.state);
  if (load.source === 'cache') {
    const saved = Date.parse(load.state.checkedAt);
    return {
      status: 'cached', items, badge: `Saved ${ago(saved, now)}`,
      summary: `Live prices are unavailable. Showing hub prices saved ${ago(saved, now)}.`,
    };
  }
  const delayed = through !== null && now - through > STALE_MIN * 60_000;
  return {
    status: delayed ? 'delayed' : 'live', items, badge: delayed ? 'Delayed' : null,
    summary: `Hub real-time prices through ${through === null ? 'the latest interval' : `${ctTime(through)} Central`}${delayed ? ', delayed' : ''}.`,
  };
}
