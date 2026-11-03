// Everything the Home page shows, derived from loaded results files. Pure functions only, so the tests can build the
// same model from results/*.json and check that every figure on screen equals the data.
//
// Two sources on purpose (docs/REDESIGN.md, "Known data caveats"): hub figures come from the detailed hub runs
// (results/index.json), and node figures, including the node-vs-hub ratio, from the all-node run
// (results/nodes_<year>_<h>h.json), whose hub rows were solved the same way as its nodes.

import { DURATIONS, HUBS } from './loader';
import type { IndexRun, LocationsFile, NodeRec, NodesFile, TexasGeo } from './types';
import { TERMS } from '../copy/terms';

export type Metric = 'rev' | 'capture' | 'top10';

export const METRICS: { id: Metric; label: string; long: string }[] = [
  { id: 'rev', label: 'Revenue', long: `Perfect-foresight revenue, ${TERMS.revenueUnit.label}` },
  { id: 'capture', label: TERMS.captureRate.label, long: TERMS.captureRate.definition },
  { id: 'top10', label: TERMS.top10DayShare.label, long: TERMS.top10DayShare.definition },
];

export interface HubRow {
  code: string;
  /** Perfect-foresight revenue, $/kW-yr (detailed run). */
  pf: number;
  /** Day-ahead plan settled at real-time prices, $/kW-yr. */
  da: number | null;
  /** da / pf on the same days. */
  kept: number | null;
  /** Share of perfect-foresight revenue from the 10 best days. */
  top10: number | null;
  /** pf minus da-matched pf: what perfect foresight adds. */
  gap: number | null;
}

export interface BestNode {
  node: NodeRec;
  /** The node's trading hub in the same all-node run, and node revenue divided by it. */
  hub: string | null;
  hubRev: number | null;
  ratio: number | null;
  /** Geocoded by hand and still waiting for review: say so wherever the node is placed. */
  underReview: boolean;
}

export interface HomeModel {
  year: number;
  durationH: number;
  deg: number;
  rte: number;
  /** Nodes in the all-node run, how many have coordinates, and how many do not. */
  nNodes: number;
  nPlaced: number;
  nUnplaced: number;
  /** Hubs ranked by perfect-foresight revenue, highest first. */
  hubs: HubRow[];
  west: HubRow | null;
  houston: HubRow | null;
  /** West / Houston - 1, or null if either is missing. */
  westOverHouston: number | null;
  /** Lowest and highest share kept across the hubs. */
  keptRange: [number, number] | null;
  best: BestNode | null;
  /** Houston perfect-foresight revenue by duration, shortest first. */
  durations: { h: number; pf: number }[];
}

function hubRow(r: IndexRun): HubRow {
  const da = r.da_rt_revenue_per_kw_year ?? null;
  return {
    code: r.location,
    pf: r.revenue_per_kw_year,
    da,
    kept: r.capture_rate ?? null,
    top10: r.top10_day_share,
    gap: r.value_of_perfect_foresight_per_kw_year ?? (da == null ? null : r.revenue_per_kw_year - da),
  };
}

function findHubRun(index: IndexRun[], code: string, year: number, h: number, deg: number) {
  return index.find((r) => r.location === code && r.year === year && r.duration_h === h && r.deg_cost_per_mwh === deg);
}

export function buildHome(index: IndexRun[], nodes: NodesFile): HomeModel {
  const { year, duration_h: durationH, deg_cost_per_mwh: deg, rte } = nodes.meta;
  const hubs = HUBS.map((c) => findHubRun(index, c, year, durationH, deg)).filter((r): r is IndexRun => !!r).map(hubRow)
    .sort((a, b) => b.pf - a.pf);
  const west = hubs.find((h) => h.code === 'HB_WEST') ?? null;
  const houston = hubs.find((h) => h.code === 'HB_HOUSTON') ?? null;
  const kept = hubs.map((h) => h.kept).filter((k): k is number => k != null);

  const top = [...nodes.nodes].sort((a, b) => a.rank - b.rank)[0];
  let best: BestNode | null = null;
  if (top) {
    const hubRev = nodes.hubs.find((h) => h.code === top.hub)?.rev ?? null;
    best = { node: top, hub: top.hub, hubRev, ratio: hubRev ? top.rev / hubRev : null, underReview: top.geo === 'manual_review' };
  }

  const durations = DURATIONS.map((h) => ({ h, run: findHubRun(index, 'HB_HOUSTON', year, h, deg) }))
    .filter((d): d is { h: number; run: IndexRun } => !!d.run)
    .map((d) => ({ h: d.h, pf: d.run.revenue_per_kw_year }));

  const nPlaced = nodes.nodes.filter((n) => n.lat != null && n.lon != null).length;
  return {
    year, durationH, deg, rte,
    nNodes: nodes.nodes.length,
    nPlaced,
    nUnplaced: nodes.nodes.length - nPlaced,
    hubs, west, houston,
    westOverHouston: west && houston && houston.pf > 0 ? west.pf / houston.pf - 1 : null,
    keptRange: kept.length ? [Math.min(...kept), Math.max(...kept)] : null,
    best,
    durations,
  };
}

/** The headline percentage, rounded as printed; null when West no longer beats Houston (the page then uses a neutral line). */
export function headlinePct(m: HomeModel): number | null {
  if (m.westOverHouston == null) return null;
  const p = Math.round(m.westOverHouston * 100);
  return p > 0 ? p : null;
}

/**
 * The hub comparison in the hero: West over Houston while West earns more (the published finding), otherwise the top
 * and bottom hubs of the ranked list. `pct` is rounded as printed; null when there is nothing to compare.
 */
export function heroComparison(m: HomeModel): { top: string; bottom: string; pct: number } | null {
  const westPct = headlinePct(m);
  if (westPct != null) return { top: 'HB_WEST', bottom: 'HB_HOUSTON', pct: westPct };
  const top = m.hubs[0];
  const bottom = m.hubs.at(-1);
  if (!top || !bottom || top === bottom || !(bottom.pf > 0)) return null;
  const p = Math.round((top.pf / bottom.pf - 1) * 100);
  return p > 0 ? { top: top.code, bottom: bottom.code, pct: p } : null;
}

/** First and last year with any hub run in the results index. */
export function yearSpan(index: IndexRun[]): [number, number] | null {
  const ys = index.map((r) => r.year);
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}

/** Revenue per kWh of storage for each duration, and what the longest-but-one to longest step adds. */
export function durationStory(m: HomeModel) {
  const perKwh = m.durations.map((d) => ({ h: d.h, v: d.pf / d.h }));
  const flips = perKwh.length > 1 && perKwh.every((d, i) => i === 0 || d.v < perKwh[i - 1].v)
    && m.durations.every((d, i) => i === 0 || d.pf > m.durations[i - 1].pf);
  const a = m.durations.at(-2);
  const b = m.durations.at(-1);
  const step = a && b && a.pf > 0 ? { from: a.h, to: b.h, revenue: b.pf / a.pf - 1, energy: b.h / a.h - 1 } : null;
  return { perKwh, flips, step };
}

// ------------------------------------------------------------ map

/** Spec projection (docs/REDESIGN.md, "Map projection") on a VIEW_W x VIEW_H viewBox. */
export const VIEW_W = 560;
export const VIEW_H = 540;
export function project(lon: number, lat: number): [number, number] {
  return [14 + (lon + 106.6) * 40.99, 15 + (36.5 - lat) * 47.5];
}

/** Texas outline as one SVG path in the same projection, thinned to points at least `minStep` viewBox units apart. */
export function outlinePath(geo: TexasGeo, minStep = 1.2): string {
  const g = geo.state.geometry;
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  return rings.map((ring) => {
    const pts: [number, number][] = [];
    for (const [lon, lat] of ring) {
      const p = project(lon, lat);
      const last = pts.at(-1);
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) pts.push(p);
    }
    return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
  }).join('');
}

export type Tier = 'low' | 'mid' | 'top';

export interface MapDot {
  code: string;
  x: number;
  y: number;
  value: number;
  /** Min-max normalised value of the active metric across placed nodes. */
  norm: number;
  r: number;
  opacity: number;
  /** Glow behind the dot, drawn only for norm above the spec's threshold. */
  halo: boolean;
  haloR: number;
  /** Colour class by rank: lower half, upper half, top tenth. */
  tier: Tier;
  county: boolean;
}

export const TIER_LABEL: Record<Tier, string> = { low: 'Lower half', mid: 'Upper half', top: 'Top tenth' };

export const metricValue = (n: NodeRec, m: Metric): number | null => (m === 'rev' ? n.rev : m === 'capture' ? n.capture : n.top10);

/** Placed nodes for one metric. Size and opacity follow the spec formula; colour tier follows rank so it reads at a glance. */
export function mapDots(nodes: NodeRec[], metric: Metric): MapDot[] {
  const placed = nodes
    .map((n) => ({ n, v: metricValue(n, metric) }))
    .filter((d): d is { n: NodeRec & { lat: number; lon: number }; v: number } => d.n.lat != null && d.n.lon != null && d.v != null);
  if (!placed.length) return [];
  const vs = placed.map((d) => d.v);
  const lo = Math.min(...vs);
  const span = Math.max(...vs) - lo || 1;
  const sorted = [...vs].sort((a, b) => a - b);
  const rankOf = (v: number) => sorted.filter((x) => x < v).length / sorted.length;
  return placed
    .map(({ n, v }) => {
      const norm = (v - lo) / span;
      const [x, y] = project(n.lon, n.lat);
      const q = rankOf(v);
      return {
        code: n.code, x, y, value: v, norm,
        r: 2.6 + 8.5 * norm ** 0.75,
        opacity: 0.45 + 0.55 * norm,
        halo: norm > 0.55,
        haloR: (2.6 + 8.5 * norm ** 0.75) * 2.4,
        tier: (q >= 0.9 ? 'top' : q >= 0.5 ? 'mid' : 'low') as Tier,
        county: n.prec === 'county',
      };
    })
    .sort((a, b) => a.norm - b.norm); // larger dots drawn last, on top
}

/** Hub marker position: the representative city in results/locations.json. Schematic, never a site. */
export function hubPoint(locs: LocationsFile, code: string) {
  const l = locs.locations.find((x) => x.code === code);
  if (!l || l.lat == null || l.lon == null) return null;
  const [x, y] = project(l.lon, l.lat);
  return { x, y, city: l.marker_city ?? l.name };
}
