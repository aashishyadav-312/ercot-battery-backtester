// @vitest-environment jsdom
// V5 Step 6: the glossary terms, the Method section and the Learn line on the site report. All shown only with V5 on.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { glossaryEntries } from '../data/site';
import { v5Terms } from './glossary';
import { Screening } from '../v4/learn/Screening';
import V5Method from './method/V5Method';
import type { TwelveCpYear } from '../custom/twelvecp';

const read = (p: string) => JSON.parse(readFileSync(resolve(process.cwd(), p), 'utf8'));
const TWELVE = read('src/custom/config/twelvecp_rules.json');
const DC = read('src/custom/config/datacenter_rules.json');
const CFG = read('src/v5/config.json');
const BATT = read('../results/v5/batteries/tx_batteries.json');
const YEAR = (y: number): TwelveCpYear => read(`../results/v5/twelvecp/${y}.json`);

vi.mock('../data/loader', async (orig) => ({ ...(await orig<typeof import('../data/loader')>()), loadTwelveCp: (y: number) => Promise.resolve(YEAR(y)) }));
vi.mock('./site/loadBatteries', () => ({ loadBatteries: () => Promise.resolve(BATT) }));

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
});

const IDS = ['twelvecp', 'coincident_peak', 'site_report', 'storage_nearby'];

describe('V5 glossary terms', () => {
  it('are listed only with V5 on, so the V5-off Glossary is unchanged', () => {
    const off = glossaryEntries(false).map((g) => g.id);
    const on = glossaryEntries(true).map((g) => g.id);
    for (const id of IDS) {
      expect(off).not.toContain(id);
      expect(on).toContain(id);
    }
    expect(on.filter((id) => !IDS.includes(id))).toEqual(off);
  });

  it('take rule text, sources and the radius from config, and use plain copy', () => {
    const t = v5Terms(TWELVE, DC, CFG);
    expect(t.twelvecp.definition).toContain(TWELVE.method.text);
    expect(t.twelvecp.definition).toContain(TWELVE.status.value);
    expect(t.twelvecp.source).toBe(TWELVE.method.source);
    expect(t.coincident_peak.source).toBe(DC.fourCp.method.source);
    expect(t.storage_nearby.definition).toContain(`${CFG.nearbyBatteries.defaultRadiusKm} km`);
    for (const id of IDS) {
      expect(t[id].definition.includes('—'), id).toBe(false);
      expect(/forecast/.test(t[id].definition.replace(/not a forecast/g, '')), id).toBe(false);
    }
  });
});

describe('Learn > Basics, site screening', () => {
  it('adds a fourth step on reading the site report with V5 on, and keeps three with it off', () => {
    const steps = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    render(<MantineProvider><Screening v5={false} /></MantineProvider>);
    expect(steps()).toHaveLength(3);
    cleanup();
    render(<MantineProvider><Screening v5 /></MantineProvider>);
    expect(steps()).toEqual(['1. Search a county or city', '2. Read the Site Value card', '3. Open Data Center mode', '4. Read the site report']);
  });
});

describe('Method, V5 section', () => {
  it('describes the 12CP model and the EIA-860M data from the config and result files', async () => {
    render(<MantineProvider><V5Method /></MantineProvider>);
    expect(screen.getByRole('heading', { name: '12CP in Data Center mode' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Storage nearby (EIA-860M)' })).toBeTruthy();
    expect(screen.getByText(TWELVE.method.text, { exact: false })).toBeTruthy();
    const planned = BATT.units.filter((u: { status: string }) => u.status === 'planned').length;
    expect(await screen.findByText(new RegExp(`${BATT.units.length - planned} operating and ${planned} planned`))).toBeTruthy();
    expect(await screen.findByText(/2026: 10 of 12 monthly peaks so far/)).toBeTruthy();
    expect(screen.getByText(/within 40 km/)).toBeTruthy();
  });
});
