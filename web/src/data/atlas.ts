// Everything the Atlas shows, derived from the all-node run (results/nodes_<year>_<h>h.json). Pure functions only, so
// the tests can rebuild each figure from the same file and check the page against it.
//
// Hub-source rule (results/FINDINGS.md, section 9): every node-vs-hub ratio here divides by the hub row of the same
// all-node file (bulk prices, same pipeline as the node), never by the detailed hub runs in results/index.json.

import { metricValue, type Metric } from './home';
import type { NodeRec, NodesFile } from './types';

export { METRICS, mapDots, metricValue, outlinePath, project, VIEW_H, VIEW_W, type MapDot, type Metric } from './home';

/** How many nodes the ranked list shows. */
export const TOP_N = 12;

/** Load zones present in the file, in a fixed reading order (unknown zones last, alphabetically). */
const ZONE_ORDER = ['LZ_NORTH', 'LZ_HOUSTON', 'LZ_SOUTH', 'LZ_WEST'];
export function zonesOf(nodes: NodeRec[]): string[] {
  const set = [...new Set(nodes.map((n) => n.lz).filter((z): z is string => !!z))];
  const pos = (z: string) => (ZONE_ORDER.includes(z) ? ZONE_ORDER.indexOf(z) : ZONE_ORDER.length);
  return set.sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}

/** "LZ_SOUTH" -> "South". */
export const zoneShort = (lz: string | null) => (lz ? lz.replace(/^LZ_/, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'No zone');

export const placed = (n: NodeRec) => n.lat != null && n.lon != null;

/** Hub revenue from the all-node file itself, by hub code. */
export function hubRevenue(file: NodesFile): Map<string, number> {
  return new Map(file.hubs.map((h) => [h.code, h.rev]));
}

/** Node revenue divided by its own hub's revenue in the same file; null when the node has no hub. */
export function ratioOf(n: NodeRec, hubs: Map<string, number>): number | null {
  const h = n.hub ? hubs.get(n.hub) : undefined;
  return h && h > 0 ? n.rev / h : null;
}

/** The ranked list: the TOP_N highest values of the active metric, within one zone or all of them. */
export function topNodes(nodes: NodeRec[], metric: Metric, zone: string | null, k = TOP_N): NodeRec[] {
  return nodes
    .filter((n) => (!zone || n.lz === zone) && metricValue(n, metric) != null)
    .sort((a, b) => metricValue(b, metric)! - metricValue(a, metric)! || a.rank - b.rank)
    .slice(0, k);
}

// ------------------------------------------------------------ node vs hub distribution

/** Ratio classes from scripts/node_findings.py: each is [lo, hi), the last is open. */
export const BUCKETS: { lo: number; hi: number; label: string }[] = [
  { lo: 0, hi: 0.9, label: 'Under 0.9x' },
  { lo: 0.9, hi: 1.1, label: '0.9 to 1.1x' },
  { lo: 1.1, hi: 1.5, label: '1.1 to 1.5x' },
  { lo: 1.5, hi: 2, label: '1.5 to 2x' },
  { lo: 2, hi: 3, label: '2 to 3x' },
  { lo: 3, hi: Infinity, label: '3x or more' },
];

/** Tone of a ratio class: below or at the hub is neutral, a premium is mint, the tail (1.5x and up) is amber. */
export type BucketTone = 'low' | 'hub' | 'premium' | 'tail';
const toneOf = (lo: number): BucketTone => (lo < BUCKETS[1].lo ? 'low' : lo < BUCKETS[2].lo ? 'hub' : lo < BUCKETS[3].lo ? 'premium' : 'tail');

export interface Bucket { label: string; lo: number; hi: number; n: number; share: number; tone: BucketTone }

export function ratios(file: NodesFile): number[] {
  const hubs = hubRevenue(file);
  return file.nodes.map((n) => ratioOf(n, hubs)).filter((r): r is number => r != null);
}

export function ratioBuckets(file: NodesFile): { buckets: Bucket[]; total: number; noHub: number } {
  const r = ratios(file);
  const buckets = BUCKETS.map((b) => {
    const n = r.filter((x) => x >= b.lo && x < b.hi).length;
    return { ...b, n, share: r.length ? n / r.length : 0, tone: toneOf(b.lo) };
  });
  return { buckets, total: r.length, noHub: file.nodes.length - r.length };
}

/** numpy.percentile's default (linear interpolation between closest ranks). */
export function percentile(values: number[], p: number): number {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (p / 100) * (v.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, v.length - 1);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** The percentiles FINDINGS section 9 reports, each computed separately for revenue and for the ratio. */
export const PERCENTILES = [10, 25, 50, 75, 90, 99, 100];
/** Ratios at or above this are shown in the accent colour (the 2x tail). */
export const TAIL_RATIO = 2;

export function percentileRows(file: NodesFile) {
  const revs = file.nodes.map((n) => n.rev);
  const r = ratios(file);
  return PERCENTILES.map((p) => ({ p, label: p === 100 ? 'Max' : `p${p}`, rev: percentile(revs, p), ratio: percentile(r, p) }));
}

/** The figures in the distribution headline: share within 10% of the hub, and the 2x-and-up tail. */
export function strayStory(file: NodesFile) {
  const r = ratios(file);
  const within = r.filter((x) => x >= BUCKETS[1].lo && x < BUCKETS[1].hi).length;
  const tail = r.filter((x) => x >= TAIL_RATIO);
  return {
    withinShare: r.length ? within / r.length : null,
    tailCount: tail.length,
    tailShare: r.length ? tail.length / r.length : null,
    maxRatio: r.length ? Math.max(...r) : null,
  };
}

// ------------------------------------------------------------ placement

/** How many nodes have coordinates, how many only a county, and how many of the top `k` by revenue are not placed. */
export function placement(file: NodesFile, k = 20) {
  const nPlaced = file.nodes.filter(placed).length;
  const top = [...file.nodes].sort((a, b) => a.rank - b.rank).slice(0, k);
  return {
    nNodes: file.nodes.length,
    nPlaced,
    nUnplaced: file.nodes.length - nPlaced,
    nCounty: file.nodes.filter((n) => placed(n) && n.prec === 'county').length,
    topK: top.length,
    topUnplaced: top.filter((n) => !placed(n)).length,
  };
}

/** One sentence on how the node was placed, or why it is not. */
export function geoNote(n: NodeRec): string {
  if (!placed(n)) return 'Not on the map yet: no EIA plant or ERCOT queue record could be matched to this node. Coordinates are never guessed.';
  if (n.geo === 'manual_review') return 'Location under review: placed by hand from plant records and not yet confirmed.';
  if (n.prec === 'county') return `County-level only: an ERCOT interconnection-queue record puts this node in ${n.county} County. The ring sits at the county's centre, not at the site.`;
  const src = n.geo === 'eia860m_name_match' ? 'EIA-860M' : 'EIA-860';
  const how = n.geo === 'eia860_lmp_node' ? 'EIA node ID, high confidence' : 'name match, medium confidence';
  return `Placed at the ${src} plant matched to this node (${how}).`;
}
