import { describe, expect, it } from 'vitest';
import { hasStack, parseNodesManifest, parseStackIndex } from './stackIndex';

describe('stack index', () => {
  it('reads file names, paths, objects and a bare array', () => {
    const keys = parseStackIndex({ files: ['2025_2h_realistic.json', 'v4/stack/2026_4h_foresight.json', { file: '2025_4h_realistic.json' }, { year: 2024, durationH: 1, mode: 'foresight' }] });
    expect(keys).toEqual([
      { year: 2025, durationH: 2, mode: 'realistic' }, { year: 2026, durationH: 4, mode: 'foresight' },
      { year: 2025, durationH: 4, mode: 'realistic' }, { year: 2024, durationH: 1, mode: 'foresight' },
    ]);
    expect(parseStackIndex(['2025_2h_realistic.json'])).toHaveLength(1);
  });
  it('lists nothing for an empty, missing or malformed index, and drops duplicates', () => {
    for (const raw of [null, undefined, {}, { files: [] }, { files: 'x' }, 7, { files: [3, null, 'notes.json', { year: '2025' }] }]) expect(parseStackIndex(raw)).toEqual([]);
    expect(parseStackIndex(['2025_2h_realistic.json', '2025_2h_realistic.json'])).toHaveLength(1);
  });
  it('hasStack matches year, size and mode exactly', () => {
    const keys = parseStackIndex(['2025_2h_realistic.json']);
    expect(hasStack(keys, 2025, 2, 'realistic')).toBe(true);
    expect(hasStack(keys, 2025, 2, 'foresight')).toBe(false);
    expect(hasStack(keys, 2025, 4, 'realistic')).toBe(false);
    expect(hasStack(keys, 2026, 2, 'realistic')).toBe(false);
  });
  it('reads the all-node manifest', () => {
    expect(parseNodesManifest({ files: [{ year: 2025, durationH: 2, file: 'nodes_2025_2h.json' }, { year: 'x' }] })).toEqual([{ year: 2025, durationH: 2, file: 'nodes_2025_2h.json' }]);
    expect(parseNodesManifest(null)).toEqual([]);
  });
});
