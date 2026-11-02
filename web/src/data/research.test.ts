import { describe, expect, it } from 'vitest';
import { HUBS } from './loader';
import { num, pct, usd } from './format';
import { parseDoc } from './markdown';
import {
  BENCHMARKS, FINDINGS, TOPICS, ancillaryChart, captureChart, countWord, fallChart, fmtRange, stackTotals, standard, validationRows,
} from './research';
import type { Rtcb } from './types';
import { DATA, FINDINGS_MD, INDEX, NODES, RTCB, STD, bare, row, stackRun } from './research.fixtures';

const DOC = parseDoc(FINDINGS_MD);
const { year: Y, durationH: H, deg: DEG } = STD;

describe('the findings list matches results/FINDINGS.md', () => {
  const numbered = DOC.sections.filter((s) => s.n != null);

  it('has one entry for each numbered finding, in order, with a known topic', () => {
    expect(FINDINGS.map((f) => f.n)).toEqual(numbered.slice(0, FINDINGS.length).map((s) => s.n));
    // A new finding in FINDINGS.md needs a topic and a teaser here; this fails until it has both.
    expect(numbered.length).toBe(FINDINGS.length);
    const topics = new Set(TOPICS.map((t) => t.id));
    for (const f of FINDINGS) expect(topics.has(f.topic), f.key).toBe(true);
    expect(new Set(FINDINGS.map((f) => f.key)).size).toBe(FINDINGS.length);
  });

  it('counts the findings in words', () => {
    expect(countWord(FINDINGS.length)).toBe('Eleven');
  });

  it('puts the node count of finding 9 in its heading equal to the all-node file', () => {
    const s = numbered.find((x) => x.n === 9)!;
    expect(s.title).toContain(`All ${NODES.nodes.length} resource nodes`);
  });

  it('every teaser is a sentence built from the data, with no unfilled gap', () => {
    for (const f of FINDINGS) {
      const t = f.teaser(DATA);
      expect(t.length, f.key).toBeGreaterThan(20);
      expect(t, f.key).not.toMatch(/undefined|NaN|null|–/);
    }
  });
});

describe('teasers equal the data', () => {
  const t = (n: number, d = DATA) => FINDINGS.find((f) => f.n === n)!.teaser(d);

  it('1: Houston ten-day share, first year and standard year', () => {
    expect(t(1)).toBe(`Houston earned ${pct(row('HB_HOUSTON', 2024).top10_day_share, 1)} of 2024 revenue in its 10 best days, and ${pct(row('HB_HOUSTON').top10_day_share, 1)} in ${Y}.`);
  });
  it('2: West and Houston revenue', () => {
    expect(t(2)).toBe(`${usd(row('HB_WEST').revenue_per_kw_year)} against ${usd(row('HB_HOUSTON').revenue_per_kw_year)} per kW-year for a ${H}-hour battery in ${Y}.`);
  });
  it('3: Houston 1, 2 and 4 hours', () => {
    expect(t(3)).toBe(`Houston ${Y}: ${[1, 2, 4].map((h) => usd(row('HB_HOUSTON', Y, h).revenue_per_kw_year)).join(', ')} per kW-year for 1, 2, 4 hours.`);
  });
  it('4: same-window revenue needs the hub runs, and says what it is while they load', () => {
    expect(t(4, bare())).toBe('Revenue over the same window, year by year.');
    expect(t(4)).toContain(`${usd(DATA.windows!.byHub.HB_HOUSTON[2024])} in 2024`);
  });
  it('5: degradation cost on revenue and cycles', () => {
    const a = row('HB_HOUSTON', Y, H, 0);
    const b = row('HB_HOUSTON');
    expect(t(5)).toBe(`A ${usd(DEG, 0)}/MWh cost cuts Houston from ${usd(a.revenue_per_kw_year)} to ${usd(b.revenue_per_kw_year)} and cycles from ${num(a.cycles_per_year)} to ${num(b.cycles_per_year)} a year.`);
  });
  it('6: the top node and a typical node against their hubs, from the all-node run', () => {
    const top = NODES.nodes.find((n) => n.rank === 1)!;
    const hub = NODES.hubs.find((h) => h.code === top.hub)!;
    const typ = NODES.nodes.find((n) => n.code === 'ANSON1_ALL')!;
    const th = NODES.hubs.find((h) => h.code === typ.hub)!;
    expect(t(6)).toBe(`${top.code} earned ${usd(top.rev)} against a ${usd(hub.rev)} hub. ANSON1_ALL earned ${(typ.rev / th.rev).toFixed(2)}x its hub.`);
  });
  it('7: Houston capture rate each year, partial years marked', () => {
    const parts = [2024, 2025, 2026].map((y) => `${pct(row('HB_HOUSTON', y).capture_rate)} in ${y}${row('HB_HOUSTON', y).annualized ? ' so far' : ''}`);
    expect(t(7)).toBe(`Houston capture: ${parts.join(', ')}.`);
  });
  it('8: Houston change across RTC+B', () => {
    const r = RTCB.locations.HB_HOUSTON.runs.find((x) => x.duration_h === H && x.deg_cost_per_mwh === DEG)!;
    expect(t(8)).toBe(`Houston: perfect foresight down ${pct(-r.change.pf_revenue!)}, day-ahead down ${pct(-r.change.da_rt_revenue!)}.`);
  });
  it('9: median and top node', () => {
    const revs = NODES.nodes.map((n) => n.rev).sort((a, b) => a - b);
    const mid = (revs[revs.length / 2 - 1] + revs[revs.length / 2]) / 2;
    expect(NODES.nodes.length % 2).toBe(0);
    expect(t(9)).toBe(`Median node ${usd(mid)} per kW-year; the top node ${usd(revs.at(-1))}.`);
  });
  it('10: energy only, stack and capped stack for Houston', () => {
    const s = stackTotals(Y, stackRun('HB_HOUSTON', Y).daily);
    expect(t(10)).toBe(`Houston ${Y}: ${usd(s.energy)} energy only, ${usd(s.stack)} with ancillary, ${usd(DATA.capped!.stack)} with awards capped at ${pct(DATA.capped!.share)}.`);
  });
});

describe('the computed figures agree with the numbers printed in FINDINGS.md', () => {
  const body = (n: number) => JSON.stringify(DOC.sections.find((s) => s.n === n)!.body);

  it('finding 4: the matched-window revenue of every hub and year is the table', () => {
    // The page computes Jan 1 to Oct 24 from daily revenue; the table in the text was printed by the Python pipeline.
    const text = body(4);
    for (const h of HUBS) {
      for (const y of [2024, 2025, 2026]) expect(text, `${h} ${y}`).toContain(DATA.windows!.byHub[h][y].toFixed(1));
    }
    expect(DATA.windows!.end).toBe('10-24');
  });

  it('finding 10: the Houston stack totals are the table in the text', () => {
    const text = body(10);
    for (const s of DATA.stack) {
      expect(text, String(s.year)).toContain(`$${s.energy.toFixed(2)}`);
      expect(text, String(s.year)).toContain(`$${s.stack.toFixed(2)}`);
    }
    expect(text).toContain(`$${DATA.capped!.stack.toFixed(2)}`);
  });

  it('finding 8: the capture drop in points is the one in the text', () => {
    const c = captureChart(DATA)!;
    // "Capture dropped 13–17 points for a 2-hour battery" (hubs and the two typical nodes); the hubs alone sit inside that range.
    const pts = c.rows.map((r) => -r.pts);
    expect(Math.min(...pts)).toBeGreaterThanOrEqual(12.5);
    expect(Math.max(...pts)).toBeLessThan(17.5);
  });

  it('the Modo fleet figures are the ones FINDINGS.md quotes, and the model range is the one it prints', () => {
    const v = DOC.sections.find((s) => s.heading.startsWith('Validation'))!;
    const text = JSON.stringify(v.body);
    for (const b of BENCHMARKS) expect(text, String(b.year)).toContain(b.fleet);
    const rows = validationRows(INDEX, standard(NODES));
    // "$54–66 ($10 degr.)" for 2024 and "$40–49" for 2025
    expect(text).toContain(`$${Math.round(rows[0].ours![0])}–${Math.round(rows[0].ours![1])}`);
    expect(text).toContain(`$${Math.round(rows[1].ours![0])}–${Math.round(rows[1].ours![1])}`);
    expect(fmtRange(rows[0].ours)).toBe(`$${Math.round(rows[0].ours![0])} to $${Math.round(rows[0].ours![1])}`);
  });
});

describe('the three charts', () => {
  it('ancillary: one pair of bars per year, equal to the stack files, with the cap in the note', () => {
    const c = ancillaryChart(DATA)!;
    expect(c.groups.map((g) => g.values)).toEqual(DATA.stack.map((s) => [s.energy, s.stack]));
    const full = DATA.stack.filter((s) => s.last.endsWith('-12-31'));
    expect(c.title).toBe(`Adding ancillary services lifts Houston revenue ${full.map((s) => `${(s.stack / s.energy).toFixed(1)}x in ${s.year}`).join(' and ')}.`);
    expect(c.groups.at(-1)!.label).toBe('2026 to Oct 24');
    expect(c.note).toContain(`from ${usd(DATA.stack.find((s) => s.year === Y)!.stack, 2)} to ${usd(DATA.capped!.stack, 2)}`);
    expect(ancillaryChart(bare())).toBeNull();
  });

  it('capture: before and after per hub equal rtcb.json, and the headline is their mean drop', () => {
    const c = captureChart(DATA)!;
    expect(c.rows.map((r) => r.code)).toEqual(HUBS);
    for (const r of c.rows) {
      const run = RTCB.locations[r.code].runs.find((x) => x.duration_h === H && x.deg_cost_per_mwh === DEG)!;
      expect([r.before, r.after]).toEqual([run.before.capture_rate, run.after.capture_rate]);
    }
    const drop = Math.round(c.rows.reduce((a, r) => a - r.pts, 0) / c.rows.length);
    expect(c.title).toBe(`After RTC+B, a day-ahead schedule keeps about ${drop} points less.`);
  });

  it('capture: falls back to a neutral title if the schedule no longer keeps less', () => {
    const flipped: Rtcb = JSON.parse(JSON.stringify(RTCB));
    for (const loc of Object.values(flipped.locations)) for (const r of loc.runs) r.change.capture_rate_pts = 3;
    expect(captureChart({ ...DATA, rtcb: flipped })!.title).not.toMatch(/\d/);
  });

  it('fall: bars are the matched-window revenue, and the headline only claims a fall if every hub fell', () => {
    const c = fallChart(DATA)!;
    expect(c.groups.map((g) => g.label)).toEqual(['HOUSTON', 'NORTH', 'SOUTH', 'WEST', 'PAN']);
    expect(c.groups[0].values).toEqual([2024, 2025, 2026].map((y) => DATA.windows!.byHub.HB_HOUSTON[y]));
    expect(c.title).toBe('Arbitrage revenue keeps falling, and it started before RTC+B.');
    expect(c.series.map((s) => s.name)).toEqual(['2024', '2025', '2026 (all after RTC+B)']);
    expect(c.note).toContain(`${pct(c.steps[0].change)}`.replace('-', ''));

    const rising = { ...DATA, windows: { ...DATA.windows!, byHub: { ...DATA.windows!.byHub, HB_WEST: { 2024: 1, 2025: 9, 2026: 5 } } } };
    expect(fallChart(rising)!.title).not.toMatch(/falling/);
    expect(fallChart(bare())).toBeNull();
  });
});
