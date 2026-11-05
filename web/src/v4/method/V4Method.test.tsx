// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import V4Method from './V4Method';
import { AS_UPPER_BOUND_NOTE } from '../config';
import { asRulesAssumptions, dataCenterAssumptions } from './methodFacts';

const data = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/v4', f), 'utf8'));
const FACTS = data('method_facts.json');
const RULES = data('as_rules.json');
const DC = JSON.parse(readFileSync(resolve(process.cwd(), 'src/custom/config/datacenter_rules.json'), 'utf8'));

vi.mock('../../pages/Method', () => ({
  Section: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
}));
vi.mock('../../data/loader', () => ({
  loadAsRules: () => Promise.resolve(RULES),
  loadMethodFacts: () => Promise.resolve(FACTS),
}));

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const view = () => render(<MantineProvider><V4Method /></MantineProvider>);

describe('Method: revenue stack and Data Center', () => {
  it('has a section for each, with the headroom rule and no comparison value', async () => {
    const { container } = view();
    await screen.findByRole('heading', { name: 'Headroom rule' });
    expect([...container.querySelectorAll('section > h2')].map((h) => h.textContent)).toEqual(['Revenue stack', 'Data Center mode']);
    const body = container.textContent ?? '';
    expect(body).toContain('full power up and down at the same time');
    expect(body).toMatch(/stricter rule[^.]*would give lower values/);
    expect(body).not.toMatch(/stricter[^.]*\$\d/);
    expect(body).not.toMatch(/102\.|110\.72/);
  });

  it('lists every ASSUMPTION item of both configs, each with its config path', async () => {
    const { container } = view();
    await waitFor(() => expect(container.querySelectorAll('[data-testid="v4-assumptions"]').length).toBe(2));
    const items = [...container.querySelectorAll('[data-testid="v4-assumption"]')];
    const want = [...asRulesAssumptions(RULES), ...dataCenterAssumptions(DC)];
    expect(items.length).toBe(want.length);
    for (const a of want) expect(items.some((i) => i.textContent?.includes(a.path)), a.path).toBe(true);
    expect(container.textContent).toContain('as_rules.json');
    expect(container.textContent).toContain('datacenter_rules.json');
  });

  it('says 2023 full-stack values are an upper bound', async () => {
    view();
    expect((await screen.findByTestId('v4-method-2023')).textContent).toContain(AS_UPPER_BOUND_NOTE);
  });

  it('states the data gaps from the stack files', async () => {
    view();
    const gaps = (await screen.findByTestId('v4-gaps')).textContent ?? '';
    expect(gaps).toMatch(/exist only for/);
    expect(gaps).toMatch(/YTD covers/);
    expect(gaps).toMatch(/annualized/);
    for (const g of FACTS.coverage.flatMap((c: { dataGaps: string[] }) => c.dataGaps)) expect(gaps).toContain(g);
  });

  it('warns that 4CP may change, with the links from the config', () => {
    view();
    const box = screen.getByTestId('v4-4cp-review');
    expect(box.textContent).toContain('4CP may change');
    const hrefs = [...box.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(DC.fourCp.review.sources);
    expect(box.textContent).toContain(DC.fourCp.review.asOf);
  });

  it('shows the SB 6 rule status from the config', () => {
    view();
    const rows = [...screen.getByTestId('v4-sb6-status').querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toHaveLength(DC.sb6.ruleStatus.length);
    for (const r of DC.sb6.ruleStatus) expect(rows.some((t) => t?.includes(r.status))).toBe(true);
  });

  it('shows the reserve backing table from the AS rules', async () => {
    view();
    const table = await screen.findByTestId('v4-reserve');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(Object.keys(RULES.products).length);
  });

  it('uses no em dash', async () => {
    const { container } = view();
    await screen.findByRole("heading", { name: "Headroom rule" });
    expect((container.textContent ?? '').includes('—')).toBe(false);
  });
});

describe('Method links', () => {
  it('links nowhere on GitHub: a repository file source shows as its path', async () => {
    const { container } = view();
    await waitFor(() => expect(container.querySelectorAll('[data-testid="v4-assumption"]').length).toBeGreaterThan(0));
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!);
    expect(hrefs.filter((h) => /github\.com/.test(h))).toEqual([]);
    expect(container.textContent).toMatch(/Source: docs\/v4-progress-2\.md in the repository/);
  });
});
