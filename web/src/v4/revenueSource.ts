// Project economics revenue source (v4 Step 9). Pure: which sources are offered, what each is worth, and how the choice is written
// in the URL. Energy is the default and writes nothing, so existing numbers and links do not change.
//
//   #/research/economics?loc=..&dur=..&year=..&deg=..            energy, perfect foresight (the old URL)
//   ...&src=da                                                    day-ahead plan
//   ...&rev=stack                                                 full stack (energy plus ancillary services)
//   ...&rev=dc&dc=<$/kW-yr>&dcd=<hours>                           the Data Center case total and its battery duration (MWh / MW)

import { AS_UPPER_BOUND_NOTE } from './config';
import { isUpperBoundYear, yearTag, type StackFile, type StackMode, type StackRow } from './stack';
import { hasStack, type StackKey } from './site/stackIndex';

export type RevSource = 'energy' | 'stack' | 'dc';
/** The existing control on the page: perfect foresight (pf) or the day-ahead plan (da). */
export type PlanSource = 'pf' | 'da';

export const REV_LABEL: Record<RevSource, string> = { energy: 'Energy', stack: 'Full stack', dc: 'Data Center site' };

/** Stack files carry two modes: the upper bound is the perfect-foresight run, the realistic one is the day-ahead plan. */
export const stackModeOf = (plan: PlanSource): StackMode => (plan === 'da' ? 'realistic' : 'foresight');

export interface RevParams { rev: RevSource; plan: PlanSource; dc: number | null; dcDur: number | null }

const EXTRA_KEYS = ['rev', 'src', 'dc', 'dcd'] as const;

const num = (v: string | null): number | null => (v != null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Read the choice from a query string. Anything unknown is the default. */
export function parseRevParams(query: string): RevParams {
  const q = new URLSearchParams(query);
  const rev = q.get('rev');
  const dcDur = num(q.get('dcd'));
  return {
    rev: rev === 'stack' || rev === 'dc' ? rev : 'energy', plan: q.get('src') === 'da' ? 'da' : 'pf',
    dc: num(q.get('dc')), dcDur: dcDur != null && dcDur > 0 ? dcDur : null,
  };
}

/** Read the choice from a full hash (`#/research/economics?...`). */
export const parseRevHash = (hash: string): RevParams => parseRevParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');

/** Write the choice into a hash, leaving every other parameter as it was. Defaults are left out. */
export function withRevParams(hash: string, p: RevParams): string {
  const qi = hash.indexOf('?');
  const base = qi < 0 ? hash : hash.slice(0, qi);
  const q = new URLSearchParams(qi < 0 ? '' : hash.slice(qi + 1));
  for (const k of EXTRA_KEYS) q.delete(k);
  if (p.plan === 'da') q.set('src', 'da');
  if (p.rev !== 'energy') q.set('rev', p.rev);
  if (p.rev === 'dc' && p.dc != null) q.set('dc', String(p.dc));
  if (p.rev === 'dc' && p.dc != null && p.dcDur != null) q.set('dcd', String(p.dcDur));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Copy the revenue-source parameters of one hash onto another (the selection bar rebuilds the URL and would drop them). */
export function carryRevParams(from: string, to: string): string {
  const qi = from.indexOf('?');
  if (qi < 0) return to;
  const f = new URLSearchParams(from.slice(qi + 1));
  const keep = EXTRA_KEYS.filter((k) => f.has(k));
  if (!keep.length) return to;
  const tq = to.indexOf('?');
  const q = new URLSearchParams(tq < 0 ? '' : to.slice(tq + 1));
  for (const k of keep) q.set(k, f.get(k)!);
  return `${tq < 0 ? to : to.slice(0, tq)}?${q}`;
}

/** The Data Center case total, as carried to Economics. */
export interface DcCase { perKwYr: number; label: string; /** Battery MWh / MW of the case. */ durationH?: number }

export interface Offered {
  stack: StackRow | null;
  stackMeta: StackFile['meta'] | null;
  dc: DcCase | null;
}

/** Full stack is offered only when the index lists the combination and the loaded file has a row for the node. */
export function offeredStack(
  keys: StackKey[] | null, file: StackFile | null, year: number, durationH: number, plan: PlanSource, location: string,
): { row: StackRow; meta: StackFile['meta'] } | null {
  if (!keys || !file || !hasStack(keys, year, durationH, stackModeOf(plan))) return null;
  const row = file.nodes[location];
  return row && Number.isFinite(row.total) ? { row, meta: file.meta } : null;
}

/** The sources to show in the pill. Energy is always first; fewer than two means the pill is hidden. */
export function revOptions(o: Pick<Offered, 'stack' | 'dc'>): RevSource[] {
  return ['energy', ...(o.stack ? (['stack'] as const) : []), ...(o.dc ? (['dc'] as const) : [])];
}

/** The source in use: the requested one if it is offered, else energy. */
export const effectiveSource = (want: RevSource, o: Pick<Offered, 'stack' | 'dc'>): RevSource =>
  (revOptions(o).includes(want) ? want : 'energy');

/** $/kW-yr before haircut for a source. */
export function revenueOf(src: RevSource, energy: number, o: Offered): number {
  if (src === 'stack' && o.stack) return o.stack.total;
  if (src === 'dc' && o.dc) return o.dc.perKwYr;
  return energy;
}

export interface SourceDetail {
  label: string;
  /** Energy and ancillary parts of a full-stack figure. */
  split: { energy: number; ancillary: number } | null;
  /** "2026 YTD (10 months)" or "2023 (upper bound)" when the stack year needs a tag. */
  yearNote: string | null;
  upperBoundNote: string | null;
  extra: string | null;
}

/** What the "Revenue source" line says about the chosen source, built from the files (no typed figures). */
export function sourceDetail(src: RevSource, o: Offered, plan: PlanSource): SourceDetail {
  if (src === 'stack' && o.stack && o.stackMeta) {
    const m = o.stackMeta;
    return {
      label: `Full stack, ${plan === 'da' ? 'day-ahead plan' : 'perfect foresight'}`,
      split: { energy: o.stack.energy, ancillary: o.stack.total - o.stack.energy },
      yearNote: m.partialYear || isUpperBoundYear(m.year) ? yearTag(m) + (m.partialYear ? ', annualized' : '') : null,
      upperBoundNote: isUpperBoundYear(m.year) ? AS_UPPER_BOUND_NOTE : null,
      extra: 'Cycles per year, used for levelized cost, stay at the energy value.',
    };
  }
  if (src === 'dc' && o.dc) {
    const dur = o.dc.durationH != null
      ? `The battery duration is the case's (${o.dc.durationH} h), so installed cost uses it. Change the duration above to return to Energy.`
      : 'Installed cost follows the duration above.';
    return { label: 'Data Center site', split: null, yearNote: null, upperBoundNote: null, extra: `${o.dc.label}. ${dur}` };
  }
  return { label: 'Energy only', split: null, yearNote: null, upperBoundNote: null, extra: null };
}

/** Link from a Data Center result to Project economics with that case as the revenue. `hash` is the economics hash for the case. */
export function economicsLink(hash: string, dc: number, durationH?: number): string {
  return withRevParams(hash, { rev: 'dc', plan: 'pf', dc: Math.round(dc * 100) / 100, dcDur: durationH != null ? Math.round(durationH * 1000) / 1000 : null });
}

/** Duration the economics use: the Data Center case's while that source is in use, else the scenario's. */
export const economicsDuration = (src: RevSource, dc: DcCase | null, scenarioH: number): number =>
  src === 'dc' && dc?.durationH != null && dc.durationH > 0 ? dc.durationH : scenarioH;
