// @vitest-environment jsdom
// v4 Step 9: the Revenue pill on Project economics (Energy | Full stack | Data Center site).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { fixtureFile } from '../v4/fixture';
import type { StackMode } from '../v4/stack';
import { DEFAULTS, compute } from '../data/economics';
import { usd } from '../data/format';
import { setDcCase } from '../v4/dc/dcCase';

vi.mock('../v4/flag', () => ({ V4: true }));
vi.mock('../state', () => ({ useApp: () => ({ sel: { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 } }) }));
const ENERGY = 20; // $/kW-yr, low enough that NPV is negative at the default cost
const ROW = { location: 'HB_HOUSTON', duration_h: 2, revenue_per_kw_year: ENERGY, da_rt_revenue_per_kw_year: 10, cycles_per_year: 300, annualized: false };
vi.mock('../hooks', () => ({ useSelectedRun: () => ({ row: ROW, run: { metrics: { da_cycles_per_year: 250 } } }) }));
vi.mock('./RunHeader', () => ({ PageHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, RunStatus: () => null }));
vi.mock('../components/Chart', () => ({ Chart: () => null, axisBase: () => ({}), tooltipBase: () => ({}) }));
vi.mock('../components/Info', () => ({ Info: () => null }));

let stackAvailable = true;
vi.mock('../data/loader', async (orig) => ({
  ...(await orig<typeof import('../data/loader')>()),
  loadStackIndex: () => (stackAvailable
    ? Promise.resolve(JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/v4/stack/index.json'), 'utf8')))
    : Promise.reject(new Error('404'))),
  loadStack: (y: number, d: number, m: StackMode) => Promise.resolve(fixtureFile(y, d, m)),
}));

import Economics from './Economics';

const HASH = '#/research/economics?loc=HB_HOUSTON&dur=2&year=2025&deg=10';
const stackTotal = fixtureFile(2025, 2, 'foresight').nodes.HB_HOUSTON.total;
const npvAt = (revenuePerKwYr: number) => compute(DEFAULTS, { durationH: 2, revenuePerKwYr, cyclesPerYear: 300 }).npv;
const verdict = () => screen.getByTestId('econ-verdict').textContent ?? '';
const wrap = () => render(<MantineProvider><Economics /></MantineProvider>);

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
beforeEach(() => { stackAvailable = true; setDcCase(null); window.history.replaceState(null, '', HASH); });
afterEach(cleanup);

describe('Revenue pill', () => {
  it('starts on Energy with the same numbers and URL as before', async () => {
    wrap();
    await screen.findByLabelText('Full stack'); // the pill appears once the stack index has loaded
    expect(verdict()).toContain(`NPV ${usd(npvAt(ENERGY), 0)}/kW`);
    expect((screen.getByLabelText('Energy') as HTMLInputElement).checked).toBe(true);
    expect(window.location.hash).toBe(HASH.slice(HASH.indexOf('#')));
    expect(screen.getByLabelText('Revenue source', { selector: 'section' }).textContent).toContain(`${usd(ENERGY, 1)}/kW-yr`);
  });

  it('recomputes NPV on Full stack and writes it to the URL, then back to Energy', async () => {
    wrap();
    fireEvent.click(await screen.findByLabelText('Full stack'));
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(npvAt(stackTotal), 0)}/kW`));
    expect(verdict()).toContain('full stack revenue');
    expect(window.location.hash).toContain('rev=stack');
    const line = screen.getByLabelText('Revenue source', { selector: 'section' }).textContent!;
    expect(line).toContain(`${usd(stackTotal, 1)}/kW-yr`);
    expect(line).toContain('Full stack');
    fireEvent.click(screen.getByLabelText('Energy'));
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(npvAt(ENERGY), 0)}/kW`));
    expect(window.location.hash).not.toContain('rev=');
  });

  it('opens on Full stack from the URL (round trip)', async () => {
    window.history.replaceState(null, '', `${HASH}&rev=stack`);
    wrap();
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(npvAt(stackTotal), 0)}/kW`));
    expect((screen.getByLabelText('Full stack') as HTMLInputElement).checked).toBe(true);
  });

  it('uses the realistic stack file for the day-ahead plan', async () => {
    window.history.replaceState(null, '', `${HASH}&rev=stack&src=da`);
    wrap();
    const real = fixtureFile(2025, 2, 'realistic').nodes.HB_HOUSTON.total;
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(compute(DEFAULTS, { durationH: 2, revenuePerKwYr: real, cyclesPerYear: 250 }).npv, 0)}/kW`));
  });

  it('suggests Full stack when NPV is negative on Energy and a stack option exists', async () => {
    wrap();
    await screen.findByLabelText('Full stack');
    expect(npvAt(ENERGY)).toBeLessThan(0);
    expect(verdict()).toContain('Full stack revenue is available');
  });

  it('is hidden when there is no stack data, and a stack URL falls back to Energy', async () => {
    stackAvailable = false;
    window.history.replaceState(null, '', `${HASH}&rev=stack`);
    wrap();
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(npvAt(ENERGY), 0)}/kW`));
    expect(screen.queryByLabelText('Full stack')).toBeNull();
    expect(screen.queryByLabelText('Data Center site')).toBeNull();
    expect(verdict()).not.toContain('Full stack revenue is available');
  });
});

describe('Data Center site', () => {
  it('is hidden when the user did not come from Data Center mode', async () => {
    wrap();
    await screen.findByLabelText('Full stack');
    expect(screen.queryByLabelText('Data Center site')).toBeNull();
  });

  it('uses the current Data Center case total and keeps it in the URL', async () => {
    setDcCase({ perKwYr: 88.5, label: '50 MW / 100 MWh at Houston hub, 2025' });
    wrap();
    fireEvent.click(await screen.findByLabelText('Data Center site'));
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(npvAt(88.5), 0)}/kW`));
    expect(verdict()).toContain('Data Center site revenue');
    expect(window.location.hash).toContain('rev=dc');
    expect(window.location.hash).toContain('dc=88.5');
    expect(screen.getByLabelText('Revenue source', { selector: 'section' }).textContent).toContain('50 MW / 100 MWh at Houston hub, 2025');
  });

  it('opens from a link that carries the case', async () => {
    window.history.replaceState(null, '', `${HASH}&rev=dc&dc=61.25`);
    wrap();
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(npvAt(61.25), 0)}/kW`));
    expect((screen.getByLabelText('Data Center site') as HTMLInputElement).checked).toBe(true);
  });
});
