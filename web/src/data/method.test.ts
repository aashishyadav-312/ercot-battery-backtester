import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locationSentences, modoRows, partialYears, reserveRows, type AncillaryMeta } from './method';
import type { IndexRun, NodeSelection } from './types';

const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
const NODES = read<NodeSelection>('node_selection.json');
const ANC = read<{ meta: AncillaryMeta }>('ancillary.json').meta;

describe('Method figures', () => {
  it('finds the years that are scaled to 365 days and where each location type stops', () => {
    expect(partialYears(INDEX)).toEqual([{ year: 2026, hubs: '2026-10-24', nodes: '2026-10-30' }]);
  });

  it('computes the model column of the Modo table from the index', () => {
    const rows = modoRows(INDEX);
    expect(rows.map((r) => r.year)).toEqual(['2024', '2025']);
    expect(rows[0].ours).toBe('$54–66 ($10/MWh degradation), $66–79 ($0/MWh)');
    expect(rows[1].ours).toBe('$40–49 ($10/MWh degradation), $51–61 ($0/MWh)');
    expect(rows[1].check).toBe('1.4–2.1 times the fleet total');
  });

  it('reads the reserve backing table from the ancillary metadata', () => {
    expect(reserveRows(ANC)).toEqual([
      ['Regulation Up / Down', '1', '0.5'], ['Responsive Reserve', '1', '0.5'], ['ECRS', '2', '1'], ['Non-Spin', '4', '4'],
    ]);
  });

  it('writes three location sentences from the node selection', () => {
    const s = locationSentences(NODES, 5);
    expect(s).toHaveLength(3);
    expect(s[0]).toContain(`${NODES.n_nodes_ranked} nodes`);
    expect(s[1]).toContain('Aug 2025');
  });
});
