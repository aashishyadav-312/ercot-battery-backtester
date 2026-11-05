import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AS_UPPER_BOUND_YEARS } from '../config';
import {
  asRulesAssumptions, coverageLines, dataCenterAssumptions, HEADROOM_LINES, parseMethodFacts, reserveDurations, yearCoverage,
} from './methodFacts';

const root = resolve(process.cwd(), '..');
const text = (p: string) => readFileSync(resolve(root, p), 'utf8');
const AS_PATH = 'model/config/as_rules.json';
const DC_PATH = 'web/src/custom/config/datacenter_rules.json';
const asRules = JSON.parse(text(AS_PATH));
const dcRules = JSON.parse(text(DC_PATH));
const facts = parseMethodFacts(JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/v4/method_facts.json'), 'utf8')))!;
const stack = (f: string) => JSON.parse(text(`results/v4/stack/${f}`));
const stackFiles = readdirSync(resolve(root, 'results/v4/stack')).filter((f) => /^\d{4}_\d+h_(foresight|realistic)\.json$/.test(f));

describe('assumptions are read from the configs', () => {
  it('lists every ASSUMPTION item of as_rules.json, with its note', () => {
    const items = asRulesAssumptions(asRules);
    expect(items.length).toBe((text(AS_PATH).match(/"status": "ASSUMPTION"/g) ?? []).length);
    expect(items.length).toBeGreaterThan(0);
    for (const a of items) {
      expect(a.text.length, a.path).toBeGreaterThan(10);
      expect(a.file).toBe(AS_PATH);
    }
    const dep = items.find((a) => a.path === 'regulation_deployment_factor')!;
    expect(dep.text).toContain(String(asRules.regulation_deployment_factor.value));
  });

  it('lists every assumption: true item of datacenter_rules.json, with its source and date', () => {
    const items = dataCenterAssumptions(dcRules);
    expect(items.length).toBe((text(DC_PATH).match(/"assumption": true/g) ?? []).length);
    expect(items.length).toBeGreaterThan(0);
    for (const a of items) {
      expect(a.source, a.path).toMatch(/^https:\/\//);
      expect(a.asOf, a.path).toBeTruthy();
    }
    const voll = items.find((a) => a.path === 'defaults.valueOfLostLoad')!;
    expect(voll.text).toContain(String(dcRules.defaults.valueOfLostLoad.value));
  });
});

describe('headroom rule', () => {
  it('says what the model allows and that a stricter rule gives lower values, with no comparison value', () => {
    const text = HEADROOM_LINES.join(' ');
    expect(text).toMatch(/full power up and down at the same time/);
    expect(text).toMatch(/stricter rule/);
    expect(text).toMatch(/lower values/);
    expect(text).not.toMatch(/\$|\d/);
  });

  it('the data build no longer reads the progress files', () => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/build-v4-method.mjs'), 'utf8');
    expect(src).not.toMatch(/progress/);
    expect(facts).not.toHaveProperty('headroom');
  });
});

describe('coverage statements follow the stack files', () => {
  it('names the years that hold more than the hubs, and the hub-only years', () => {
    const years = yearCoverage(facts.coverage);
    expect(years.map((y) => y.year)).toEqual([...new Set(stackFiles.map((f) => Number(f.slice(0, 4))))].sort());
    for (const y of years) {
      const biggest = Math.max(...stackFiles.filter((f) => f.startsWith(String(y.year))).map((f) => Object.keys(stack(f).nodes).length));
      expect(y.nodes).toBe(biggest);
    }
    const first = coverageLines(facts)[0];
    for (const y of years.filter((x) => x.allNodes)) expect(first).toContain(`${y.year} (${y.nodes} nodes)`);
    for (const y of years.filter((x) => !x.allNodes)) expect(first).toContain(String(y.year));
    expect(first).toMatch(/hubs only/);
  });

  it('a partial year lists the days it covers and every gap its files record', () => {
    const lines = coverageLines(facts).join('\n');
    const partial = facts.coverage.filter((x) => x.partialYear);
    expect(partial.length).toBeGreaterThan(0);
    for (const c of partial) {
      const meta = stack(`${c.year}_${c.durationH}h_${c.mode}.json`).meta;
      expect(lines).toContain(`${c.year} YTD`);
      expect(lines).toMatch(/annualized/);
      for (const g of meta.dataGaps) expect(lines).toContain(g);
      for (const [src, n] of Object.entries(meta.daysCoveredBySource)) expect(lines).toContain(`${n} (${src})`);
    }
  });

  it('parseMethodFacts rejects a malformed file', () => {
    expect(parseMethodFacts(null)).toBeNull();
    expect(parseMethodFacts({ coverage: 'x' })).toBeNull();
  });

  it('lists the energy-only all-node files', () => {
    expect(facts.energyAllNode.length).toBe(readdirSync(resolve(root, 'results')).filter((n) => /^nodes_\d{4}_[\d.]+h\.json$/.test(n)).length);
  });
});

describe('reserve durations', () => {
  it('match the config for every product', () => {
    const rows = reserveDurations(asRules);
    const products = Object.values(asRules.products) as { name: string; duration_h: { pre_rtcb: { value: number }; post_rtcb: { value: number } } }[];
    expect(rows.map((r) => r.name)).toEqual(products.map((p) => p.name));
    products.forEach((p, i) => {
      expect(rows[i].before).toBe(p.duration_h.pre_rtcb.value);
      expect(rows[i].from).toBe(p.duration_h.post_rtcb.value);
    });
  });
});

describe('2023 is an upper bound', () => {
  it('the listed years have an ancillary part far above every other year, at every hub (2 h, perfect foresight)', () => {
    const asPart = (year: number, hub: string) => {
      const r = stack(`${year}_2h_foresight.json`).nodes[hub];
      return r.total - r.energy;
    };
    const years = [...new Set(stackFiles.map((f) => Number(f.slice(0, 4))))];
    const others = years.filter((y) => !AS_UPPER_BOUND_YEARS.includes(y));
    expect(AS_UPPER_BOUND_YEARS.length).toBeGreaterThan(0);
    for (const hub of stack('2025_2h_foresight.json').meta.hubs as string[]) {
      for (const y of AS_UPPER_BOUND_YEARS) for (const o of others) expect(asPart(y, hub), `${hub} ${y} vs ${o}`).toBeGreaterThan(2 * asPart(o, hub));
    }
  });
});
