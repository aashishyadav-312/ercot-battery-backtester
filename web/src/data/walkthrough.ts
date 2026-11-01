import type { WalkDay, Walkthrough } from './types';
import { usd } from './format';

/** One continuous stretch of charging or discharging within a day. `end` is exclusive (an interval index). */
export interface Block {
  dir: 'charge' | 'discharge';
  start: number;
  end: number;
  /** Energy at the grid meter, MWh (bought when charging, sold when discharging). */
  mwh: number;
  /** Energy-weighted average price over the block, $/MWh. */
  avgPrice: number;
  /** Dollars paid (charge) or received (discharge) in the block, before wear cost. */
  dollars: number;
  peakMw: number;
  minPrice: { value: number; at: number };
  maxPrice: { value: number; at: number };
  socStartPct: number;
  socEndPct: number;
}

export interface DayTotals {
  boughtMwh: number;
  soldMwh: number;
  boughtDollars: number;
  soldDollars: number;
  wearDollars: number;
  netDollars: number;
  lossMwh: number;
}

const DT = 0.25;
const EPS = 0.01; // MW below which an interval counts as idle
/** Idle gaps up to this many intervals do not split a block (the battery pauses for a moment, then carries on). */
const MAX_GAP = 1;

/** "3:15 pm"; index 96 is the end of the day. */
export function clock(i: number): string {
  if (i >= 96) return 'midnight';
  const mins = i * 15;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "10:00 am to 12:45 pm" for a block covering intervals [start, end). */
export function span(start: number, end: number): string {
  return `${clock(start)} to ${clock(end)}`;
}

/** Group a day's non-idle intervals into charge and discharge blocks, in time order. */
export function findBlocks(day: WalkDay, energyMwh: number): Block[] {
  const n = day.net_mw.length;
  const dirAt = (i: number): 'charge' | 'discharge' | null => (day.net_mw[i] > EPS ? 'discharge' : day.net_mw[i] < -EPS ? 'charge' : null);
  const raw: { dir: 'charge' | 'discharge'; start: number; end: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = dirAt(i);
    if (!d) continue;
    const last = raw[raw.length - 1];
    if (last && last.dir === d && i - last.end <= MAX_GAP) last.end = i + 1;
    else raw.push({ dir: d, start: i, end: i + 1 });
  }
  return raw.map(({ dir, start, end }) => {
    let mwh = 0;
    let dollars = 0;
    let peakMw = 0;
    let lo = { value: Infinity, at: start };
    let hi = { value: -Infinity, at: start };
    for (let i = start; i < end; i++) {
      const mw = Math.abs(day.net_mw[i]);
      if (dirAt(i) !== dir) continue;
      mwh += mw * DT;
      dollars += mw * DT * day.price[i];
      peakMw = Math.max(peakMw, mw);
      if (day.price[i] < lo.value) lo = { value: day.price[i], at: i };
      if (day.price[i] > hi.value) hi = { value: day.price[i], at: i };
    }
    const socBefore = start === 0 ? 0 : day.soc_mwh[start - 1];
    return {
      dir, start, end, mwh, dollars, peakMw,
      avgPrice: mwh > 0 ? dollars / mwh : 0,
      minPrice: lo, maxPrice: hi,
      socStartPct: (socBefore / energyMwh) * 100,
      socEndPct: (day.soc_mwh[end - 1] / energyMwh) * 100,
    };
  });
}

export function dayTotals(day: WalkDay, wearPerMwh: number): DayTotals {
  let boughtMwh = 0, soldMwh = 0, boughtDollars = 0, soldDollars = 0;
  day.net_mw.forEach((mw, i) => {
    if (mw > EPS) { soldMwh += mw * DT; soldDollars += mw * DT * day.price[i]; }
    else if (mw < -EPS) { boughtMwh += -mw * DT; boughtDollars += -mw * DT * day.price[i]; }
  });
  const wearDollars = soldMwh * wearPerMwh;
  return {
    boughtMwh, soldMwh, boughtDollars, soldDollars, wearDollars,
    netDollars: soldDollars - boughtDollars - wearDollars,
    lossMwh: boughtMwh - soldMwh,
  };
}

export interface Step {
  /** Short label for the progress dots and the step heading. */
  title: string;
  /** Plain-language explanation. */
  body: string[];
  /** Index into the day's blocks, or null for the intro and summary steps. */
  block: number | null;
  stats: { label: string; value: string }[];
}

const mwh = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: 0 })} MWh`;
const price = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}/MWh`;
const dollars = (v: number) => usd(Math.round(v), 0);

/** The ordered steps of the walkthrough for one day: intro, one per block, then the day's total. */
export function buildSteps(w: Walkthrough, day: WalkDay): { steps: Step[]; blocks: Block[]; totals: DayTotals } {
  const { power_mw: P, energy_mwh: E, rte, deg_cost_per_mwh: wear, year_revenue_per_kw: yearKw } = w.meta;
  const blocks = findBlocks(day, E);
  const totals = dayTotals(day, wear);
  const lo = day.price.reduce((m, v, i) => (v < m.value ? { value: v, at: i } : m), { value: Infinity, at: 0 });
  const hi = day.price.reduce((m, v, i) => (v > m.value ? { value: v, at: i } : m), { value: -Infinity, at: 0 });
  const sorted = [...day.price].sort((a, b) => a - b);
  const median = (sorted[47] + sorted[48]) / 2;
  const perKw = day.revenue / (P * 1000);
  const pctYear = yearKw > 0 ? (perKw / yearKw) * 100 : null;
  const battery = `${P} MW / ${E} MWh battery (${w.meta.duration_h} hours of storage)`;

  const steps: Step[] = [];
  steps.push({
    title: 'The day',
    block: null,
    body: [
      `Prices on this day ran from ${price(lo.value)} (at ${clock(lo.at)}) up to ${price(hi.value)} (at ${clock(hi.at)}).`,
      `A ${battery} that knew these prices in advance would earn ${dollars(day.revenue)} after wear costs, which is ${usd(perKw, 2)} for every kW of power capacity` +
        (pctYear != null ? `, or ${pctYear.toFixed(1)}% of the whole year's ${usd(yearKw, 2)}/kW.` : '.'),
      blocks.length
        ? `The plan has ${blocks.length} step${blocks.length === 1 ? '' : 's'}: the chart shades each one. Press Next to walk through them.`
        : 'The battery stays idle on this day: prices never move far enough to pay for the energy lost in a round trip.',
    ],
    stats: [
      { label: 'Net revenue', value: dollars(day.revenue) },
      { label: 'Low / high price', value: `${price(lo.value)} / ${price(hi.value)}` },
      { label: 'Per kW of power', value: usd(perKw, 2) },
    ],
  });

  blocks.forEach((b, k) => {
    const when = span(b.start, b.end);
    const minutes = (b.end - b.start) * 15;
    const dur = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
    const next = day.price[b.end];
    const full = b.socEndPct >= 99.5;
    const empty = b.socEndPct <= 0.5;
    if (b.dir === 'charge') {
      const stored = b.mwh * Math.sqrt(rte);
      const why: string[] = [`Prices here are low: ${price(b.avgPrice)} on average against a median of ${price(median)} for the day, with the lowest at ${price(b.minPrice.value)} (${clock(b.minPrice.at)}).`];
      if (b.minPrice.value < 0) why[0] = `Prices dip below zero here (as low as ${price(b.minPrice.value)} at ${clock(b.minPrice.at)}), so the battery is paid to take in energy.`;
      let stop: string;
      if (full) stop = `Charging stops because the battery is full (${mwh(E)}); a ${w.meta.duration_h}-hour battery can only hold so much.`;
      else if (next !== undefined && next > b.avgPrice) stop = 'Charging stops as prices start to climb: energy is no longer cheap enough to be worth buying.';
      else stop = `Charging stops here because the price gap that remains is too small to pay for the ${Math.round((1 - rte) * 100)}% round-trip loss and wear cost.`;
      steps.push({
        title: `Buy ${k + 1}`,
        block: k,
        body: [
          `Charge from ${when}. The battery buys power from the grid for ${dur}, at up to ${Math.round(b.peakMw)} MW.`,
          `${why[0]} The battery takes in ${mwh(b.mwh)}, a cost of ${dollars(b.dollars)}. About ${mwh(stored)} ends up stored, because some energy is lost in charging.`,
          stop,
        ],
        stats: [
          { label: 'Bought', value: mwh(b.mwh) },
          { label: 'Average price paid', value: price(b.avgPrice) },
          { label: 'Cost', value: dollars(b.dollars) },
          { label: 'Battery level', value: `${Math.round(b.socStartPct)}% to ${Math.round(b.socEndPct)}%` },
        ],
      });
    } else {
      const stop = empty
        ? 'Selling stops because the battery is empty.'
        : next !== undefined && next < b.avgPrice
          ? `Selling stops as the price falls back to ${price(next)}. The charge that is left is held for a later, better price, or the battery buys again if the price drops far enough.`
          : 'Selling stops here: the charge that is left is worth more at a later, higher price.';
      const peak = b.maxPrice.value >= 1000
        ? `The best price in the block is ${price(b.maxPrice.value)} at ${clock(b.maxPrice.at)}, a price spike.`
        : `The best price in the block is ${price(b.maxPrice.value)} at ${clock(b.maxPrice.at)}.`;
      const wearCost = b.mwh * wear;
      steps.push({
        title: `Sell ${k + 1}`,
        block: k,
        body: [
          `Discharge from ${when}. The battery sends power back to the grid for ${dur}, at up to ${Math.round(b.peakMw)} MW.`,
          `${peak} It sells ${mwh(b.mwh)} at ${price(b.avgPrice)} on average and is paid ${dollars(b.dollars)}${wear > 0 ? `, less ${dollars(wearCost)} of wear cost` : ''}.`,
          stop,
        ],
        stats: [
          { label: 'Sold', value: mwh(b.mwh) },
          { label: 'Average price received', value: price(b.avgPrice) },
          { label: 'Revenue', value: dollars(b.dollars) },
          { label: 'Battery level', value: `${Math.round(b.socStartPct)}% to ${Math.round(b.socEndPct)}%` },
        ],
      });
    }
  });

  const spread = totals.soldMwh > 0 && totals.boughtMwh > 0 ? totals.soldDollars / totals.soldMwh - totals.boughtDollars / totals.boughtMwh : null;
  steps.push({
    title: 'The day in total',
    block: null,
    body: [
      totals.soldMwh > 0
        ? `Over the day the battery bought ${mwh(totals.boughtMwh)} for ${dollars(totals.boughtDollars)} and sold ${mwh(totals.soldMwh)} for ${dollars(totals.soldDollars)}. ` +
          `${mwh(totals.lossMwh)} was lost to the ${Math.round((1 - rte) * 100)}% round-trip efficiency${wear > 0 ? `, and wear cost another ${dollars(totals.wearDollars)}` : ''}.`
        : 'No trades today.',
      spread != null
        ? `That is ${dollars(totals.netDollars)} net: it sold at ${price(totals.soldDollars / totals.soldMwh)} and bought at ${price(totals.boughtDollars / totals.boughtMwh)}, a captured spread of ${price(spread)}.`
        : '',
      'A real operator would not know the day’s prices in advance. This is the best case, which is why the site treats the result as an upper bound.',
    ].filter(Boolean),
    stats: [
      { label: 'Sold', value: dollars(totals.soldDollars) },
      { label: 'Bought', value: `−${dollars(totals.boughtDollars)}` },
      ...(wear > 0 ? [{ label: 'Wear cost', value: `−${dollars(totals.wearDollars)}` }] : []),
      { label: 'Net', value: dollars(totals.netDollars) },
    ],
  });

  return { steps, blocks, totals };
}
