// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs build script, no types
import { findFixtureData } from '../../scripts/check-no-fixture.mjs';
import { FIXTURE_DIR, fixtureFile } from './fixture';

const find = findFixtureData as (dir: string) => string[];

describe('FIXTURE stack data can never ship', () => {
  it('the data the build serves has no FIXTURE file', () => {
    expect(find(resolve(process.cwd(), 'public/data'))).toEqual([]);
  });

  it('the scan does find the fixture files, so an empty result means something', () => {
    expect(find(FIXTURE_DIR).length).toBeGreaterThan(0);
  });

  it('the data copy has no switch that serves the fixture', () => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/copy-data.mjs'), 'utf8');
    expect(src).not.toMatch(/process\.env\.V4_FIXTURE/);
    expect(src).not.toMatch(/cpSync\(join\(stackFixture/);
  });
});

describe('loadStack in production', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  const serve = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })));

  it('refuses a FIXTURE file', async () => {
    vi.stubEnv('PROD', true);
    serve(fixtureFile(2025, 2, 'realistic'));
    const { loadStack } = await import('../data/loader');
    await expect(loadStack(2025, 2, 'realistic')).rejects.toThrow(/FIXTURE/);
  });

  it('still reads a real file', async () => {
    vi.stubEnv('PROD', true);
    const real = fixtureFile(2025, 2, 'foresight');
    real.meta.generated = '2026-11-05T00:00:00Z';
    serve(real);
    const { loadStack } = await import('../data/loader');
    await expect(loadStack(2025, 2, 'foresight')).resolves.toBeTruthy();
  });

  it('reads a FIXTURE file outside production (unit tests only)', async () => {
    vi.stubEnv('PROD', false);
    serve(fixtureFile(2026, 2, 'realistic'));
    const { loadStack } = await import('../data/loader');
    await expect(loadStack(2026, 2, 'realistic')).resolves.toBeTruthy();
  });
});
