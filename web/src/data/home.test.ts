import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W, buildHome, durationStory, headlinePct, mapDots, project, type Metric } from './home';
import type { IndexRun, NodesFile } from './types';

// The real results files, so these tests fail if the page ever stops matching the data.
// Tests run from web/, so results/ is one level up (a template URL here would be rewritten into an asset import by Vite).
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
const NODES = read<NodesFile>('nodes_2025_2h.json');

const { year, duration_h: dur, deg_cost_per_mwh: deg } = NODES.meta;
const run = (loc: string, h = dur) => INDEX.find((r) => r.location === loc && r.year === year && r.duration_h === h && r.deg_cost_per_mwh === deg)!;

describe('buildHome', () => {
  const m = buildHome(INDEX, NODES);

  it('takes year, duration and degradation from the all-node run', () => {
    expect([m.year, m.durationH, m.deg]).toEqual([year, dur, deg]);
  });

  it('computes the headline percentage as West / Houston - 1 from the detailed hub runs', () => {
    const expected = run('HB_WEST').revenue_per_kw_year / run('HB_HOUSTON').revenue_per_kw_year - 1;
    expect(m.westOverHouston).toBeCloseTo(expected, 12);
    expect(headlinePct(m)).toBe(Math.round(expected * 100));
  });

  it('drops the percentage (neutral headline) when West no longer beats Houston', () => {
    const swapped = INDEX.map((r) => (r.location === 'HB_WEST' && r.year === year ? { ...r, revenue_per_kw_year: run('HB_HOUSTON').revenue_per_kw_year * 0.99 } : r));
    expect(headlinePct(buildHome(swapped, NODES))).toBeNull();
  });

  it('ranks all five hubs by perfect-foresight revenue with day-ahead and kept from the same run', () => {
    expect(m.hubs).toHaveLength(5);
    for (let i = 1; i < m.hubs.length; i++) expect(m.hubs[i - 1].pf).toBeGreaterThanOrEqual(m.hubs[i].pf);
    for (const h of m.hubs) {
      const r = run(h.code);
      expect([h.pf, h.da, h.kept]).toEqual([r.revenue_per_kw_year, r.da_rt_revenue_per_kw_year, r.capture_rate]);
    }
  });

  it('gives the kept range across the hubs', () => {
    const kept = m.hubs.map((h) => h.kept!);
    expect(m.keptRange).toEqual([Math.min(...kept), Math.max(...kept)]);
  });

  it('compares the rank-1 node with its own hub in the same all-node run (one source per comparison)', () => {
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    const hub = NODES.hubs.find((h) => h.code === top.hub)!;
    expect(m.best!.node.code).toBe(top.code);
    expect(m.best!.ratio).toBeCloseTo(top.rev / hub.rev, 12);
    expect(m.best!.underReview).toBe(top.geo === 'manual_review');
  });

  it('counts placed and unplaced nodes instead of dropping the unplaced', () => {
    const placed = NODES.nodes.filter((n) => n.lat != null && n.lon != null).length;
    expect(m.nNodes).toBe(NODES.nodes.length);
    expect(m.nPlaced).toBe(placed);
    expect(m.nPlaced + m.nUnplaced).toBe(m.nNodes);
  });

  it('reads Houston revenue for every duration, and derives the per-kWh story', () => {
    expect(m.durations.map((d) => d.pf)).toEqual(m.durations.map((d) => run('HB_HOUSTON', d.h).revenue_per_kw_year));
    const s = durationStory(m);
    expect(s.perKwh.map((d) => d.v)).toEqual(m.durations.map((d) => d.pf / d.h));
    const [a, b] = m.durations.slice(-2);
    expect(s.step!.revenue).toBeCloseTo(b.pf / a.pf - 1, 12);
  });
});

describe('map', () => {
  it('projects every placed node inside the viewBox', () => {
    for (const n of NODES.nodes.filter((x) => x.lat != null)) {
      const [x, y] = project(n.lon!, n.lat!);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(VIEW_W);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(VIEW_H);
    }
  });

  it.each(['rev', 'capture', 'top10'] as Metric[])('draws one dot per placed node with a %s value, sized by the spec formula', (metric) => {
    const dots = mapDots(NODES.nodes, metric);
    const field = metric;
    expect(dots).toHaveLength(NODES.nodes.filter((n) => n.lat != null && n[field] != null).length);
    const vs = dots.map((d) => d.value);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    for (const d of dots) {
      const norm = (d.value - lo) / (hi - lo);
      expect(d.norm).toBeCloseTo(norm, 12);
      expect(d.r).toBeCloseTo(2.6 + 8.5 * norm ** 0.75, 12);
      expect(d.opacity).toBeCloseTo(0.45 + 0.55 * norm, 12);
      expect(d.halo).toBe(norm > 0.55);
    }
    // about a tenth are "top", about half are "low"
    const top = dots.filter((d) => d.tier === 'top').length / dots.length;
    expect(top).toBeGreaterThan(0.05);
    expect(top).toBeLessThan(0.15);
  });
});
