// Writes the facts the Method page quotes for the v4 revenue stack, so no number in the copy is typed:
//   public/data/v4/as_rules.json     a copy of model/config/as_rules.json (the ASSUMPTION items are read from it)
//   public/data/v4/method_facts.json  the coverage of every stack file and the energy-only all-node files
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
for (const f of files) {
  const d = JSON.parse(readFileSync(join(stackDir, f), 'utf8'));
  const m = d.meta;
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

writeFileSync(join(out, 'method_facts.json'), JSON.stringify({
  coverage,
  energyAllNode,
}) + '\n');
console.log(`wrote v4/method_facts.json (${coverage.length} stack files) and v4/as_rules.json`);
