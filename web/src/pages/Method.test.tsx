// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Method from './Method';
import type { AncillaryMeta } from '../data/method';
import type { IndexRun, NodeSelection, Run } from '../data/types';

// Tests run from web/, so results/ is one level up.
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(process.cwd(), '../results', f), 'utf8'));
const INDEX = read<{ runs: IndexRun[] }>('index.json').runs;
const NODES = read<NodeSelection>('node_selection.json');
const ANC = read<{ meta: AncillaryMeta }>('ancillary.json');
const RUN = read<Run>('HB_HOUSTON_2025_2h_0.85_10.json');

vi.mock('../state', () => ({ useApp: () => ({ go: () => {}, index: INDEX, nodes: NODES }) }));
vi.mock('../hooks', () => ({ useSelectedRun: () => ({ run: RUN }) }));
vi.mock('../data/loader', async (orig) => ({ ...(await orig<typeof import('../data/loader')>()), loadAncillary: () => Promise.resolve(ANC) }));

vi.setConfig({ testTimeout: 20000 });
afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

// With V4 on, Method also shows the revenue stack and Data Center sections (v4/method/V4Method.test.tsx covers them).
const V4_SECTIONS = ['Revenue stack', 'Data Center mode'];
const view = () => render(<MantineProvider><Method /></MantineProvider>);

describe('Method', () => {
  it('lists the sections in order, with the long material in one closed details element', async () => {
    const { container } = view();
    await screen.findByText('Reserve backing (hours)', undefined, { timeout: 2000 }).catch(() => {});
    const heads = [...container.querySelectorAll('section > h2')].map((h) => h.textContent).filter((h) => !V4_SECTIONS.includes(h ?? ''));
    expect(heads).toEqual(['What the model does', 'Assumptions', 'Two strategies', 'What it leaves out', 'Checked against real fleet revenue', 'Locations and data']);
    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(1);
    expect(details[0].open).toBe(false);
    expect(details[0].querySelector('summary')!.textContent).toMatch(/^Technical notes/);
  });

  it('keeps the part above Technical notes under 650 words', async () => {
    const { container } = view();
    await waitFor(() => expect(container.querySelector('details table')).toBeTruthy());
    const copy = container.cloneNode(true) as HTMLElement;
    copy.querySelector('details')!.remove();
    copy.querySelectorAll('section').forEach((sec) => { if (V4_SECTIONS.includes(sec.querySelector('h2')?.textContent ?? '')) sec.remove(); });
    const words = (copy.textContent ?? '').split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(650);
  });

  it('has no link to GitHub and keeps the three Modo sources', async () => {
    const { container } = view();
    await waitFor(() => expect(container.querySelector('details table')).toBeTruthy());
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!);
    expect(hrefs.filter((h) => /github\.com|\.md$/.test(h))).toEqual([]);
    expect(hrefs.filter((h) => h.startsWith('https://modoenergy.com/')).length).toBeGreaterThanOrEqual(3);
  });

  it('builds the assumptions from the run metadata, index and ancillary metadata', async () => {
    const { container } = view();
    await waitFor(() => expect(container.querySelector('details table')).toBeTruthy());
    const rows = Object.fromEntries([...container.querySelectorAll('section dt')].map((t) => [t.textContent, t.nextElementSibling?.textContent]));
    expect(rows['Efficiency']).toContain('85%');
    expect(rows['Degradation cost']).toContain('$0/MWh and $10/MWh');
    expect(rows['Size']).toContain(`${RUN.meta.power_mw} MW`);
    expect(rows['Optimizer']).toContain(ANC.meta.software!.highspy);
    expect(rows['Partial years']).toMatch(/2026 runs to Oct 24 for hubs and Oct 30 for nodes/);
  });
});
