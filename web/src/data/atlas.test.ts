import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUCKETS, TOP_N, geoNote, hubRevenue, percentile, percentileRows, placement, ratioBuckets, ratioOf, strayStory, topNodes, zonesOf,
} from './atlas';
import type { IndexRun, NodeRec, NodesFile } from './types';

// The real results files. Tests run from web/, so results/ is one level up.
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const NODES = read<NodesFile>('nodes_2025_2h.json');
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;

/** Ratio recomputed here from the file, independently of the module under test. */
const bulkRatio = (n: NodeRec) => {
  const h = NODES.hubs.find((x) => x.code === n.hub);
  return h ? n.rev / h.rev : null;
};
const RATIOS = NODES.nodes.map(bulkRatio).filter((r): r is number => r != null);

describe('node vs hub uses the bulk hub rows of the same file (FINDINGS section 9)', () => {
  it('divides every node by its own hub from nodes_<year>_<h>h.json', () => {
    const hubs = hubRevenue(NODES);
    for (const n of NODES.nodes) expect(ratioOf(n, hubs)).toBe(bulkRatio(n));
  });

  it('differs from a ratio over the detailed (archive) hub run, which this page must not use', () => {
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    const archive = INDEX.find((r) => r.location === top.hub && r.year === NODES.meta.year && r.duration_h === NODES.meta.duration_h && r.deg_cost_per_mwh === NODES.meta.deg_cost_per_mwh)!;
    expect(ratioOf(top, hubRevenue(NODES))).not.toBeCloseTo(top.rev / archive.revenue_per_kw_year, 3);
  });
});

describe('ratio classes', () => {
  const { buckets, total, noHub } = ratioBuckets(NODES);

  it('count every node with a hub exactly once', () => {
    expect(total).toBe(RATIOS.length);
    expect(noHub).toBe(NODES.nodes.length - RATIOS.length);
    expect(buckets.reduce((s, b) => s + b.n, 0)).toBe(total);
  });

  it.each(BUCKETS.map((b, i) => [b.label, i] as const))('%s holds the nodes in [lo, hi)', (_, i) => {
    const b = BUCKETS[i];
    const n = RATIOS.filter((r) => r >= b.lo && r < b.hi).length;
    expect(buckets[i].n).toBe(n);
    expect(buckets[i].share).toBeCloseTo(n / RATIOS.length, 12);
  });
});

describe('percentiles', () => {
  const rows = percentileRows(NODES);

  it('match the quantiles the Python run wrote into the file (numpy linear interpolation)', () => {
    for (const [k, v] of Object.entries(NODES.meta.quantiles_rev)) {
      const row = rows.find((r) => r.label === k)!;
      expect(row.rev).toBeCloseTo(v, 2);
    }
  });

  it('end at the largest revenue and the largest ratio', () => {
    const max = rows.at(-1)!;
    expect(max.label).toBe('Max');
    expect(max.rev).toBe(Math.max(...NODES.nodes.map((n) => n.rev)));
    expect(max.ratio).toBe(Math.max(...RATIOS));
  });

  it('interpolate between ranks', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([5], 90)).toBe(5);
  });
});

describe('headline figures', () => {
  it('share within 10% of the hub and the 2x tail are computed from the ratios', () => {
    const s = strayStory(NODES);
    expect(s.withinShare).toBeCloseTo(RATIOS.filter((r) => r >= 0.9 && r < 1.1).length / RATIOS.length, 12);
    expect(s.tailCount).toBe(RATIOS.filter((r) => r >= 2).length);
    expect(s.maxRatio).toBe(Math.max(...RATIOS));
  });
});

describe('ranked list', () => {
  it(`gives the ${TOP_N} highest revenues, in order`, () => {
    const top = topNodes(NODES.nodes, 'rev', null);
    const expected = [...NODES.nodes].sort((a, b) => b.rev - a.rev).slice(0, TOP_N).map((n) => n.rev);
    expect(top.map((n) => n.rev)).toEqual(expected);
  });

  it('follows the metric and the zone filter', () => {
    const top = topNodes(NODES.nodes, 'capture', 'LZ_WEST');
    expect(top.every((n) => n.lz === 'LZ_WEST')).toBe(true);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].capture!).toBeGreaterThanOrEqual(top[i].capture!);
    const best = Math.max(...NODES.nodes.filter((n) => n.lz === 'LZ_WEST').map((n) => n.capture ?? -1));
    expect(top[0].capture).toBe(best);
  });

  it('lists the load zones in the file, North to West', () => {
    expect(zonesOf(NODES.nodes)).toEqual(['LZ_NORTH', 'LZ_HOUSTON', 'LZ_SOUTH', 'LZ_WEST']);
  });
});

describe('placement', () => {
  const p = placement(NODES);

  it('counts placed, unplaced and county-level nodes from the coordinates, and agrees with the file meta', () => {
    const nPlaced = NODES.nodes.filter((n) => n.lat != null && n.lon != null).length;
    expect([p.nNodes, p.nPlaced, p.nUnplaced]).toEqual([NODES.nodes.length, nPlaced, NODES.nodes.length - nPlaced]);
    expect(p.nPlaced).toBe(NODES.meta.n_nodes_geocoded);
    expect(p.nCounty).toBe(NODES.meta.n_nodes_county_level);
  });

  it('counts how many of the top 20 earners are not placed', () => {
    const top = [...NODES.nodes].sort((a, b) => a.rank - b.rank).slice(0, 20);
    expect(p.topUnplaced).toBe(top.filter((n) => n.lat == null).length);
  });

  it('says a hand-placed node is under review, and never guesses an unplaced one', () => {
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    expect(top.geo).toBe('manual_review');
    expect(geoNote(top)).toMatch(/under review/);
    const missing = NODES.nodes.find((n) => n.lat == null)!;
    expect(geoNote(missing)).toMatch(/never guessed/);
  });
});
