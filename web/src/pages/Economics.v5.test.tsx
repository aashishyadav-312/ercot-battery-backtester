// @vitest-environment jsdom
// V5 Step 5: Project economics with rev=dc uses the Data Center case under the rule it was run with (tcos in the link).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DEFAULTS, compute } from '../data/economics';
import { usd } from '../data/format';
import { setDcCase } from '../v4/dc/dcCase';

vi.mock('../v4/flag', () => ({ V4: true }));
vi.mock('../config/features', async (orig) => ({ ...(await orig<typeof import('../config/features')>()), V5: true }));
vi.mock('../state', () => ({ useApp: () => ({ sel: { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 } }) }));
const ROW = { location: 'HB_HOUSTON', duration_h: 2, revenue_per_kw_year: 20, da_rt_revenue_per_kw_year: 10, cycles_per_year: 300, annualized: false };
vi.mock('../hooks', () => ({ useSelectedRun: () => ({ row: ROW, run: { metrics: { da_cycles_per_year: 250 } } }) }));
vi.mock('./RunHeader', () => ({ PageHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, RunStatus: () => null }));
vi.mock('../components/Chart', () => ({ Chart: () => null, axisBase: () => ({}), tooltipBase: () => ({}) }));
vi.mock('../components/Info', () => ({ Info: () => null }));
vi.mock('../data/loader', async (orig) => ({ ...(await orig<typeof import('../data/loader')>()), loadStackIndex: () => Promise.reject(new Error('404')) }));

import Economics from './Economics';

const BASE = '#/research/economics?loc=HB_HOUSTON&dur=2&year=2025&deg=10';
const DC = 61.25;
const verdict = () => screen.getByTestId('econ-verdict').textContent ?? '';
const revenueLine = () => screen.getByLabelText('Revenue source', { selector: 'section' }).textContent ?? '';

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
beforeEach(() => { setDcCase(null); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '#/'); });

describe('Economics with a Data Center case', () => {
  it('names the 12CP rule when the link says tcos=12cp', async () => {
    window.history.replaceState(null, '', `${BASE}&rev=dc&dc=${DC}&dcd=2&tcos=12cp`);
    render(<MantineProvider><Economics /></MantineProvider>);
    await waitFor(() => expect(verdict()).toContain(`NPV ${usd(compute(DEFAULTS, { durationH: 2, revenuePerKwYr: DC, cyclesPerYear: 300 }).npv, 0)}/kW`));
    expect(revenueLine()).toContain('12CP (proposed)');
    expect(window.location.hash).toContain('tcos=12cp');
  });

  it('says 4CP when tcos is missing, as before', async () => {
    window.history.replaceState(null, '', `${BASE}&rev=dc&dc=${DC}&dcd=2`);
    render(<MantineProvider><Economics /></MantineProvider>);
    await waitFor(() => expect(verdict()).toContain('NPV'));
    expect(revenueLine()).not.toContain('12CP');
    expect(screen.getByRole('alert').textContent).toContain('including the 4CP and reliability values');
  });
});
