// Test helper: the FIXTURE stack files, read from disk the way the build serves them.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StackFile, StackMode } from './stack';

export const FIXTURE_DIR = resolve(process.cwd(), 'fixtures/v4/stack');
export const fixtureFile = (year: number, dur: number, mode: StackMode): StackFile =>
  JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${year}_${dur}h_${mode}.json`), 'utf8'));
