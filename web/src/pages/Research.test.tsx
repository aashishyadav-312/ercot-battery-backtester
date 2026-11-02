// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ResearchView } from './Research';
import { parseDoc } from '../data/markdown';
import { ancillaryChart, captureChart, fallChart, fmtRange, FINDINGS, TOPICS, validationRows, standard } from '../data/research';
import { pct, usd } from '../data/format';
import { DATA, FINDINGS_MD, INDEX, NODES, bare } from '../data/research.fixtures';

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  Element.prototype.scrollIntoView ??= () => {};
});

const DOC = parseDoc(FINDINGS_MD);
const title = (n: number) => DOC.sections.find((s) => s.n === n)!.title;
const view = (data = DATA, finding: number | null = null) => render(<ResearchView data={data} doc={DOC} finding={finding} />);

describe('Research shows the loaded numbers', () => {
  it('says how many findings there are, and has exactly that many cards with their text from FINDINGS.md', () => {
    view();
    expect(screen.getByTestId('lede').textContent).toMatch(/^Eleven findings/);
    expect(screen.getByRole('heading', { name: 'All eleven findings' })).toBeTruthy();
    for (const f of FINDINGS) {
      const card = screen.getByTestId(`finding-${f.n}`);
      expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(title(f.n));
      expect(screen.getByTestId(`teaser-${f.n}`).textContent).toBe(f.teaser(DATA));
      expect(within(card).getByRole('link').getAttribute('href')).toBe(`#/research?f=${f.n}`);
    }
    expect(screen.getAllByTestId(/^finding-/)).toHaveLength(FINDINGS.length);
  });

  it('names each link by its finding, not just "Read finding"', () => {
    view();
    const link = within(screen.getByTestId('finding-4')).getByRole('link');
    expect(link.textContent).toContain(`Read finding 4, ${title(4)}`);
  });

  it('the three charts carry the computed headlines and their numbers as tables', () => {
    view();
    expect(screen.getByTestId('chart-ancillary-title').textContent).toBe(ancillaryChart(DATA)!.title);
    expect(screen.getByTestId('chart-capture-title').textContent).toBe(captureChart(DATA)!.title);
    expect(screen.getByTestId('chart-fall-title').textContent).toBe(fallChart(DATA)!.title);

    const anc = within(screen.getByTestId('chart-ancillary')).getAllByRole('row').slice(1);
    expect(anc).toHaveLength(DATA.stack.length);
    DATA.stack.forEach((s, i) => {
      const cells = within(anc[i]).getAllByRole('cell').map((c) => c.textContent);
      expect(cells).toEqual([usd(s.energy, 1), usd(s.stack, 1)]);
    });

    const cap = captureChart(DATA)!;
    const capRows = within(screen.getByTestId('chart-capture')).getAllByRole('row').slice(1);
    cap.rows.forEach((r, i) => {
      expect(within(capRows[i]).getByRole('rowheader').textContent).toBe(r.code);
      expect(within(capRows[i]).getAllByRole('cell').slice(0, 2).map((c) => c.textContent)).toEqual([pct(r.before), pct(r.after)]);
    });

    const fall = fallChart(DATA)!;
    const fallRows = within(screen.getByTestId('chart-fall')).getAllByRole('row').slice(1);
    expect(fallRows).toHaveLength(fall.groups.length);
    expect(within(fallRows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(fall.groups[0].values.map((v) => usd(v, 1)));
  });

  it('every chart is a figure with a text summary for screen readers', () => {
    view();
    for (const id of ['chart-ancillary', 'chart-capture', 'chart-fall']) {
      const fig = screen.getByTestId(id);
      expect(fig.tagName).toBe('FIGURE');
      const img = within(fig).getByRole('img');
      expect(img.getAttribute('aria-label')!.length).toBeGreaterThan(40);
    }
  });

  it('the validation table prints the model range from the hub runs next to the Modo figures', () => {
    view();
    const std = standard(NODES);
    for (const r of validationRows(INDEX, std)) {
      const cells = within(screen.getByTestId(`validation-${r.year}`)).getAllByRole('cell').map((c) => c.textContent);
      expect(cells).toEqual([r.fleet, fmtRange(r.ours), fmtRange(r.oursNoDeg)]);
    }
    expect(screen.getAllByRole('link', { name: /^Modo Energy:/ })).toHaveLength(3);
  });

  it('points the "leaves out" note at the ancillary finding', () => {
    view();
    const n = FINDINGS.find((f) => f.key === 'ancillary')!.n;
    expect(screen.getByRole('link', { name: `finding ${n}` }).getAttribute('href')).toBe(`#/research?f=${n}`);
  });

  it('shows the findings and a loading note, not made-up numbers, while the big files are still loading', () => {
    view(bare());
    expect(screen.getAllByRole('status').some((s) => /Loading the ancillary chart/.test(s.textContent!))).toBe(true);
    expect(screen.queryByTestId('chart-ancillary')).toBeNull();
    expect(screen.getByTestId('chart-capture')).toBeTruthy(); // rtcb.json is already in
    expect(screen.getAllByTestId(/^finding-/)).toHaveLength(FINDINGS.length);
    expect(screen.getByTestId('teaser-4').textContent).not.toMatch(/\$/);
  });
});

describe('topic filters', () => {
  it('show only the findings of a topic, say how many, and mark the pressed button', () => {
    view();
    const group = screen.getByRole('group', { name: 'Filter findings by topic' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', ...TOPICS.map((t) => t.label)]);
    fireEvent.click(within(group).getByRole('button', { name: 'How it changed' }));
    const want = FINDINGS.filter((f) => f.topic === 'changed').map((f) => f.n);
    expect(screen.getAllByTestId(/^finding-/).map((c) => Number(c.getAttribute('data-testid')!.slice(8)))).toEqual(want);
    expect(within(group).getByRole('button', { name: 'How it changed' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(`Showing ${want.length} of ${FINDINGS.length} findings`)).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'All' }));
    expect(screen.getAllByTestId(/^finding-/)).toHaveLength(FINDINGS.length);
  });

  it('cover every finding exactly once across the topics', () => {
    const counts = TOPICS.map((t) => FINDINGS.filter((f) => f.topic === t.id).length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(FINDINGS.length);
    expect(counts.every((c) => c > 0)).toBe(true);
  });
});

describe('one finding, rendered from FINDINGS.md', () => {
  it('shows the heading, the tables and the text of finding 8, and links to its neighbours and back', () => {
    view(DATA, 8);
    const reader = screen.getByTestId('reader');
    expect(within(reader).getByRole('heading', { level: 1 }).textContent).toBe(title(8));
    const tables = within(reader).getAllByRole('table');
    expect(tables.length).toBeGreaterThan(0);
    // The escaped pipes in the header come out as pipes, and the first data row is Houston's.
    expect(within(tables[0]).getByRole('columnheader', { name: 'Mean |RT − DA| ($/MWh)' })).toBeTruthy();
    expect(within(tables[0]).getByRole('cell', { name: 'HB_HOUSTON' })).toBeTruthy();
    expect(reader.textContent).toContain('RTC+B caused it');
    expect(within(reader).getByRole('link', { name: /All eleven findings/ }).getAttribute('href')).toBe('#/research');
    const pager = within(reader).getByRole('navigation', { name: 'Other findings' });
    expect(within(pager).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['#/research?f=7', '#/research?f=9']);
    // Wide tables scroll inside their own box, which can be reached by keyboard.
    expect(within(reader).getAllByRole('region', { name: /scrolls sideways/ }).length).toBe(tables.length);
  });

  it('opens a repository link from the text on GitHub, in a new tab', () => {
    view(DATA, 10);
    const link = within(screen.getByTestId('reader')).getByRole('link', { name: 'the sourced methodology' });
    expect(link.getAttribute('href')).toBe('https://github.com/aashishyadav-312/ercot-battery-backtester/blob/main/docs/ANCILLARY_METHOD.md');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('has no previous link on the first finding and no next link on the last', () => {
    view(DATA, 1);
    const first = within(screen.getByTestId('reader')).getByRole('navigation', { name: 'Other findings' });
    expect(within(first).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['#/research?f=2']);
    cleanup();
    view(DATA, FINDINGS.length);
    const last = within(screen.getByTestId('reader')).getByRole('navigation', { name: 'Other findings' });
    expect(within(last).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([`#/research?f=${FINDINGS.length - 1}`]);
  });

  it('shows the list again for a finding number that does not exist', () => {
    view(DATA, 99);
    expect(screen.queryByTestId('reader')).toBeNull();
    expect(screen.getAllByTestId(/^finding-/)).toHaveLength(FINDINGS.length);
  });
});
