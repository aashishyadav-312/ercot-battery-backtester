import type { IndexRun, Run, Selection } from './types';
import { pct, usd } from './format';
import type { Page } from '../state';

/** A sentence split into plain text and the one figure to emphasise. */
export type Part = string | { em: string };
export interface Hero {
  parts: Part[];
  /** Plain-text version, used as a React key so the sentence cross-fades when it changes. */
  plain: string;
}

const ORD = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const period = (r: Run) => (r.metrics.annualized ? `${r.meta.year} year-to-date` : String(r.meta.year));
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
const make = (parts: Part[]): Hero => ({ parts, plain: parts.map((p) => (typeof p === 'string' ? p : p.em)).join('') });

/** How concentrated the year was: the headline finding of the project. */
function concentration(r: Run): Hero | null {
  const s = r.metrics.top10_day_share;
  if (s == null) return null;
  if (s < 0.2) return make(['Revenue was spread out: the ten best days earned only ', { em: pct(s, 0) }, ` of this battery’s ${period(r)} revenue.`]);
  return make(['Ten days earned ', { em: pct(s, 0) }, ` of this battery’s ${period(r)} revenue.`]);
}

function bestMonth(r: Run): Hero | null {
  const m = r.metrics.monthly_revenue_per_kw;
  const entries = Object.entries(m).filter(([, v]) => v != null);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!(total > 0)) return null;
  const [k, v] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return make([`${MONTH_NAMES[Number(k) - 1]} was the best month, earning `, { em: pct(v / total, 0) }, ` of this battery’s ${period(r)} revenue.`]);
}

function dispatchShape(r: Run): Hero | null {
  const { values } = r.metrics.heatmap_net_mw;
  const last = Number(r.meta.last_day.slice(5, 7));
  const months = Array.from({ length: last }, (_, i) => i);
  const avg = Array.from({ length: 24 }, (_, h) => months.reduce((s, m) => s + values[m][h], 0) / months.length);
  let lo = 0;
  let hi = 0;
  avg.forEach((v, h) => {
    if (v < avg[lo]) lo = h;
    if (v > avg[hi]) hi = h;
  });
  return make(['On a typical day this battery charged hardest at ', { em: hour(lo) }, ' and discharged hardest at ', { em: hour(hi) }, '.']);
}

function rank(sel: Selection, index: IndexRun[]): Hero | null {
  const rows = index
    .filter((r) => r.year === sel.year && r.duration_h === sel.duration && r.deg_cost_per_mwh === sel.deg)
    .sort((a, b) => b.revenue_per_kw_year - a.revenue_per_kw_year);
  const i = rows.findIndex((r) => r.location === sel.location);
  if (i < 0) return null;
  const yr = rows[i].annualized ? `${sel.year} so far` : String(sel.year);
  return make([`${sel.location} ranks `, { em: ORD(i + 1) }, ` of ${rows.length} locations for a ${sel.duration}-hour battery in ${yr}.`]);
}

function capture(r: Run): Hero | null {
  const c = r.metrics.capture_rate;
  if (c == null) return null;
  if (c <= 0) return make(['Scheduled on day-ahead prices, this battery ', { em: 'lost money' }, ` in real time in ${period(r)}.`]);
  return make(['Scheduling on day-ahead prices captured ', { em: pct(c, 0) }, ` of the perfect-foresight revenue in ${period(r)}.`]);
}

export function heroFor(page: Page, run: Run | undefined, sel: Selection, index: IndexRun[] | null): Hero | null {
  if (page === 'compare') return index ? rank(sel, index) : null;
  if (!run) return null;
  if (page === 'realism') return capture(run);
  if (page === 'revenue') return bestMonth(run) ?? concentration(run);
  if (page === 'dispatch') return dispatchShape(run) ?? concentration(run);
  return concentration(run);
}

/** One quiet line of context under the hero: what was modelled, and the headline $/kW-yr. */
export function ledeFor(run: Run | undefined, page?: Page): string | null {
  if (!run) return null;
  const m = run.meta;
  const r = run.metrics;
  if (page === 'realism' && r.da_rt_revenue_per_kw_year != null) {
    const ann = r.annualized ? ' (annualized)' : '';
    return `A ${m.duration_h}-hour battery at ${m.location} scheduled on day-ahead prices and paid real-time prices would have earned ${usd(r.da_rt_revenue_per_kw_year, 1)}/kW-yr${ann} in ${period(run)}, against ${usd(r.pf_revenue_per_kw_year_matched, 1)} with perfect foresight.`;
  }
  const amount = `${usd(r.revenue_per_kw_year, 1)}/kW-yr${r.annualized ? ' (annualized)' : ''}`;
  return `A ${m.duration_h}-hour battery at ${m.location} would have earned ${amount} in ${period(run)} arbitraging real-time prices with perfect foresight, net of $${m.deg_cost_per_mwh}/MWh degradation.`;
}
