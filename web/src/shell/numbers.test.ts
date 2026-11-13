import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/REDESIGN.md, ground rule 2: no hardcoded result numbers in JSX. This is the grep from that rule
// (grep -rnE '\$?[0-9]+\.[0-9]' web/src/pages web/src/components), applied as a test to every file the redesign has
// rebuilt so far. Older pages still have hits (chart styling, copy); add each page here as its step rebuilds it.
// Geometry and formula constants live in src/data/*.ts, next to the data they shape, where they are tested.
const REBUILT = [
  'pages/Home.tsx',
  'pages/HomeV5.tsx',
  'v5/siteTarget.ts',
  'v5/advanced.ts',
  'components/home/HomeMap.tsx',
  'pages/Atlas.tsx',
  'components/atlas/AtlasMap.tsx',
  'pages/Studio.tsx',
  'components/live/HubTiles.tsx',
  'components/live/ErrorDetails.tsx',
  'components/live/MoveArrow.tsx',
  'v4/dc/DataCenter.tsx',
  'v4/dc/ModeSwitch.tsx',
  'v4/method/V4Method.tsx',
  'v4/learn/Screening.tsx',
];

describe('no hardcoded decimal numbers in rebuilt screens', () => {
  it.each(REBUILT)('%s', (file) => {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const hits = src.split('\n').map((line, i) => ({ line: i + 1, text: line.trim() })).filter((l) => /\$?[0-9]+\.[0-9]/.test(l.text));
    expect(hits).toEqual([]);
  });
});
