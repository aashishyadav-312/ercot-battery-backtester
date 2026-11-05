// Writes the facts the Method page quotes for the v4 revenue stack, so no number in the copy is typed:
//   public/data/v4/as_rules.json     a copy of model/config/as_rules.json (the ASSUMPTION items are read from it)
//   public/data/v4/method_facts.json  headroom check and the coverage of every stack file
// The headroom comparison needs one number that exists only in prose: the stricter-rule value recorded in
// docs/v4-progress-1.md. It is read from that file; the build stops if the sentence is missing or if the engine value in the
// same sentence no longer matches results/v4/stack, so the page cannot quote a stale pair.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(here, '..', 'public', 'data', 'v4');
const stackDir = join(root, 'results', 'v4', 'stack');
mkdirSync(out, { recursive: true });

cpSync(join(root, 'model', 'config', 'as_rules.json'), join(out, 'as_rules.json'));

const files = existsSync(stackDir) ? readdirSync(stackDir).filter((f) => /^\d{4}_\d+h_(foresight|realistic)\.json$/.test(f)).sort() : [];
const coverage = [];
const stacks = new Map();
for (const f of files) {
  const d = JSON.parse(readFileSync(join(stackDir, f), 'utf8'));
  const m = d.meta;
  stacks.set(f, d);
  coverage.push({
    year: m.year, durationH: m.durationH, mode: m.mode, rtcb: m.rtcb, partialYear: m.partialYear, monthsCovered: m.monthsCovered,
    nNodes: Object.keys(d.nodes).length, nHubs: (m.hubs ?? []).length, firstDay: m.firstDay, lastDay: m.lastDay, daysCovered: m.daysCovered,
    daysCoveredBySource: m.daysCoveredBySource ?? {}, dataGaps: m.dataGaps ?? [],
  });
}

// Energy-only all-node files (results/nodes_<year>_<dur>h.json), for the same coverage statement.
const energyAllNode = readdirSync(join(root, 'results')).flatMap((f) => {
  const m = /^nodes_(\d{4})_(\d+(?:\.\d+)?)h\.json$/.exec(f);
  return m ? [{ year: Number(m[1]), durationH: Number(m[2]) }] : [];
}).sort((a, b) => a.year - b.year || a.durationH - b.durationH);

// Headroom check: HB_HOUSTON, 2024, 2 h, perfect foresight.
const HEAD = { location: 'HB_HOUSTON', year: 2024, durationH: 2, mode: 'foresight' };
const progressFile = 'docs/v4-progress-1.md';
const prose = readFileSync(join(root, progressFile), 'utf8');
const m = /gives\s+(\d+\.\d+)\s+\$\/kW-yr\s+vs\s+\d+\.\d+\s+published[\s\S]{0,400}?give\s+(\d+\.\d+)/.exec(prose);
if (!m) throw new Error(`build-v4-method: the headroom sentence is not in ${progressFile}`);
const shared = Number(m[1]);
const proseTwoSided = Number(m[2]);
const stackRow = stacks.get(`${HEAD.year}_${HEAD.durationH}h_${HEAD.mode}.json`)?.nodes[HEAD.location];
if (!stackRow) throw new Error('build-v4-method: no stack row for the headroom check');
if (Math.abs(stackRow.total - proseTwoSided) > 0.005) {
  throw new Error(`build-v4-method: ${progressFile} says ${proseTwoSided} for the standard rule, results/v4/stack says ${stackRow.total}`);
}

writeFileSync(join(out, 'method_facts.json'), JSON.stringify({
  headroom: { ...HEAD, twoSided: stackRow.total, shared, sharedSource: progressFile },
  coverage,
  energyAllNode,
}) + '\n');
console.log(`wrote v4/method_facts.json (${coverage.length} stack files) and v4/as_rules.json`);
