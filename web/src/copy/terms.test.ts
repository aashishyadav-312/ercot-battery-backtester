import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { METRICS } from '../data/home';
import { TOPICS } from '../data/research';
import { GLOSSARY } from '../data/site';
import { TABS } from '../shell/route';
import { RETIRED } from './retired';
import { TERMS } from './terms';

const SRC = resolve(process.cwd(), 'src');

/** Source that can reach the screen: code and copy, not tests, not this folder, comments removed. */
function uiSource(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      const file = relative(SRC, full).replace(/\\/g, '/');
      if (!/\.(tsx?|json)$/.test(name) || /\.test\.tsx?$/.test(name) || file.startsWith('copy/') || name.endsWith('.fixtures.ts')) continue;
      const raw = readFileSync(full, 'utf8');
      const text = name.endsWith('.json') ? raw : raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{(,])\/\/.*$/gm, '$1');
      out.push({ file, text });
    }
  };
  walk(SRC);
  out.push({ file: 'results/FINDINGS.md', text: readFileSync(resolve(process.cwd(), '../results/FINDINGS.md'), 'utf8') });
  return out;
}

describe('the shared vocabulary', () => {
  it('uses the labels from the plan', () => {
    expect(Object.fromEntries(Object.entries(TERMS).map(([k, t]) => [k, t.label]))).toEqual({
      perfectForesight: 'Perfect foresight',
      dayAheadPlan: 'Day-ahead plan',
      captureRate: 'Capture rate',
      top10DayShare: 'Top-10-day share',
      revenueUnit: '$/kW-yr',
      degradationCost: 'Degradation cost',
      hub: 'Hub',
      node: 'Node',
    });
  });

  it.each(RETIRED)('has no %s anywhere in the UI source', (_name, re) => {
    const hits = uiSource().filter((s) => re.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  it('feeds the glossary and the metric pills', () => {
    expect(GLOSSARY.perfect_foresight.term).toBe(TERMS.perfectForesight.label);
    expect(GLOSSARY.capture_rate.term).toBe(TERMS.captureRate.label);
    expect(GLOSSARY.top10_day_share.term).toBe(TERMS.top10DayShare.label);
    expect(GLOSSARY.usd_per_kw_yr.term).toBe(TERMS.revenueUnit.label);
    expect(GLOSSARY.resource_node.term).toBe(TERMS.node.label);
    expect(METRICS.map((m) => m.label)).toEqual(['Revenue', TERMS.captureRate.label, TERMS.top10DayShare.label]);
  });
});

describe('tab and pill labels', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('names the header tabs and sub-tabs as the plan says', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Home', 'Atlas', 'Studio', 'Research', 'Learn']);
    expect(Object.fromEntries(TABS.map((t) => [t.tab, t.views.map((v) => v.label)]))).toMatchObject({
      atlas: ['All nodes', 'Study sites'],
      studio: ['Your battery', 'Economics'],
      research: ['Findings', 'Revenue', 'Charging pattern', 'Reality check', 'Method'],
    });
  });

  it('keeps every tab, sub-tab and pill to one or two words', () => {
    const labels = [...TABS.flatMap((t) => [t.label, ...t.views.map((v) => v.label)]), ...METRICS.map((m) => m.label), ...TOPICS.map((t) => t.label)];
    for (const l of labels) expect(words(l), l).toBeLessThanOrEqual(2);
  });
});
