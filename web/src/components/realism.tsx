import { useMemo, useState } from 'react';
import { Anchor, Badge, Grid, SegmentedControl, SimpleGrid, Table, Text } from '@mantine/core';
import { Card, type CsvData } from './Card';
import { Chart, axisBase, legendBase, tooltipBase, type ChartTheme } from './Chart';
import { ChartSkeleton } from './Skeletons';
import { Kpi } from './Kpi';
import type { IndexRun, Rtcb, RtcbPrices, Run, Selection } from '../data/types';
import { DURATIONS, findRun } from '../data/loader';
import { MONTHS, durLabel, fmtDate, pct, usd, yearLabel } from '../data/format';
import { kw } from '../data/analytics';
import { useApp } from '../state';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;
/** Signed dollars with a true minus sign: −$1.4. */
const usdS = (v: number, d = 1) => (v < 0 ? `−${usd(-v, d)}` : usd(v, d));
/** Chart and its table side by side on wide screens, stacked on narrow ones. */
function Split({ children }: { children: [React.ReactNode, React.ReactNode] }) {
  return (
    <Grid gap={{ base: 'sm', lg: 'xl' }}>
      <Grid.Col span={{ base: 12, lg: 5 }}>{children[0]}</Grid.Col>
      <Grid.Col span={{ base: 12, lg: 7 }}>{children[1]}</Grid.Col>
    </Grid>
  );
}
const signed = (v: number | null | undefined, d = 0) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`);
const pts = (v: number | null | undefined) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pts`);

function Change({ v, kind = 'pct' }: { v: number | null | undefined; kind?: 'pct' | 'pts' }) {
  if (v == null) return null;
  return (
    <Text span fz="xs" fw={560} ml={6} c={v >= 0 ? 'teal.7' : 'red.7'} style={{ ...tnum, whiteSpace: 'nowrap' }}>
      {kind === 'pct' ? signed(v) : pts(v)}
    </Text>
  );
}

/** Locations in the order the rest of the site uses: hubs first, then nodes, each alphabetical. */
function locationsOf(index: IndexRun[]) {
  const all = [...new Set(index.map((r) => r.location))];
  return [...all.filter((l) => l.startsWith('HB_')).sort(), ...all.filter((l) => !l.startsWith('HB_')).sort()];
}

// ---------------------------------------------------------------- KPI row
export function RealismKpis({ run }: { run?: Run }) {
  const m = run?.metrics;
  const ann = !!m?.annualized;
  const badge = ann ? 'Annualized YTD' : undefined;
  return (
    <SimpleGrid cols={{ base: 2, lg: 4 }} spacing={{ base: 'sm', sm: 'lg' }}>
      <Kpi
        label="DA-scheduled" unit="$/kW-yr" badge={badge} value={m ? usd(m.da_rt_revenue_per_kw_year, 1) : undefined}
        hint={m && `Scheduled on day-ahead prices, paid real-time prices. Lost money on ${m.da_losing_days} of ${m.da_days_matched} days.`}
      />
      <Kpi
        label="Perfect foresight" unit="$/kW-yr" badge={badge} value={m ? usd(m.pf_revenue_per_kw_year_matched, 1) : undefined}
        hint="Same battery and days, scheduled with real-time prices known in advance."
      />
      <Kpi
        label="Value of foresight" unit="$/kW-yr" badge={badge} value={m ? usd(m.value_of_perfect_foresight_per_kw_year, 1) : undefined}
        hint="Perfect foresight minus DA-scheduled: what knowing real-time prices in advance is worth."
      />
      <Kpi
        label="Capture rate" value={m ? pct(m.capture_rate, 0) : undefined}
        hint={m && `DA-scheduled ÷ perfect foresight. Selling the same schedule day-ahead would have earned ${usd(m.da_da_revenue_per_kw_year, 1)}/kW-yr.`}
      />
    </SimpleGrid>
  );
}

// ---------------------------------------------------------------- capture rate by location and duration
export function CaptureCard({ sel, index }: { sel: Selection; index: IndexRun[] | null }) {
  const { go } = useApp();
  const rows = useMemo(() => {
    if (!index) return undefined;
    return locationsOf(index).map((loc) => ({
      loc,
      hub: loc.startsWith('HB_'),
      byDur: DURATIONS.map((d) => findRun(index, sel, loc, sel.year, d)),
    }));
  }, [index, sel]);
  const build = useMemo(() => {
    if (!rows) return undefined;
    const rev = [...rows].reverse(); // top-to-bottom in reading order
    return (t: ChartTheme) => ({
      grid: { left: 108, right: 20, top: 30, bottom: 28 },
      legend: { ...legendBase(t), data: DURATIONS.map((d) => `${durLabel(d)} battery`) },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: { dataIndex: number; seriesIndex: number; marker: string }[]) => {
          const r = rev[ps[0].dataIndex];
          return `<b>${r.loc}</b><br/>` + ps.map((p) => {
            const x = r.byDur[p.seriesIndex];
            return `${p.marker} ${durLabel(DURATIONS[p.seriesIndex])}: ${pct(x?.capture_rate, 0)} · ${usd(x?.da_rt_revenue_per_kw_year, 1)} of ${usd(x?.revenue_per_kw_year, 1)}/kW-yr`;
          }).join('<br/>');
        },
      },
      xAxis: { type: 'value', min: 0, max: 1, ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` } },
      yAxis: { type: 'category', data: rev.map((r) => r.loc), ...axisBase(t), splitLine: { show: false }, axisLabel: { color: t.text, fontSize: 11, fontWeight: (v: string) => (v === sel.location ? 600 : 400) } },
      series: DURATIONS.map((d, i) => ({
        name: `${durLabel(d)} battery`, type: 'bar', barMaxWidth: 8, barGap: '25%',
        itemStyle: { color: t.series[i], borderRadius: [0, 3, 3, 0] },
        data: rev.map((r) => r.byDur[i]?.capture_rate ?? null),
      })),
    });
  }, [rows, sel.location]);
  const csv = (): CsvData | undefined =>
    rows && {
      filename: `capture_rate_${sel.year}_deg${sel.deg}.csv`,
      headers: ['location', 'duration_h', 'perfect_foresight_usd_per_kw_yr', 'da_scheduled_usd_per_kw_yr', 'value_of_perfect_foresight_usd_per_kw_yr', 'capture_rate', 'annualized'],
      rows: rows.flatMap((r) => r.byDur.filter(Boolean).map((x) => [r.loc, x!.duration_h, x!.revenue_per_kw_year, x!.da_rt_revenue_per_kw_year ?? null, x!.value_of_perfect_foresight_per_kw_year ?? null, x!.capture_rate ?? null, x!.annualized ? 1 : 0])),
    };
  const di = DURATIONS.indexOf(sel.duration);
  return (
    <Card
      title="Capture rate by location and duration"
      subtitle={`DA-scheduled revenue as a share of perfect foresight · ${yearLabel(sel.year)} · $${sel.deg}/MWh degradation`}
      csv={csv}
    >
      {(ex) =>
        !rows || !build ? <ChartSkeleton h={380} /> : (
          <>
            <Split>
            <Chart build={build} height={ex ? '62vh' : 400} label="Capture rate by location for 1, 2 and 4 hour batteries" />
            <div style={{ overflowX: 'auto' }}>
              <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm" mt="xs" miw={460} highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Location ({durLabel(sel.duration)})</Table.Th><Table.Th ta="right">Perfect foresight</Table.Th>
                    <Table.Th ta="right">DA-scheduled</Table.Th><Table.Th ta="right">Gap</Table.Th><Table.Th ta="right">Capture</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody style={{ ...tnum, whiteSpace: 'nowrap' }}>
                  {rows.map(({ loc, hub, byDur }) => {
                    const x = byDur[di];
                    return x && (
                      <Table.Tr key={loc} fw={loc === sel.location ? 600 : undefined}>
                        <Table.Td>
                          <Anchor component="button" size="sm" c="inherit" underline="always" fw="inherit" onClick={() => go('realism', { location: loc })}>{loc}</Anchor>
                          {!hub && <Badge ml={6} size="xs" variant="light" color="gray">node</Badge>}
                        </Table.Td>
                        <Table.Td ta="right">{usd(x.revenue_per_kw_year)}</Table.Td>
                        <Table.Td ta="right">{usd(x.da_rt_revenue_per_kw_year)}</Table.Td>
                        <Table.Td ta="right">{usd(x.value_of_perfect_foresight_per_kw_year)}</Table.Td>
                        <Table.Td ta="right">{pct(x.capture_rate)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={6}>$/kW-yr{sel.year === 2026 ? ', annualized year-to-date' : ''}. Click a location to select it.</Text>
            </div>
            </Split>
          </>
        )
      }
    </Card>
  );
}

// ---------------------------------------------------------------- monthly PF vs DA-scheduled
export function MonthlyRealismCard({ run }: { run?: Run }) {
  const data = useMemo(() => {
    if (!run?.daily.da_rt_revenue) return undefined;
    const pf = new Map<number, number>();
    const da = new Map<number, number>();
    const k = kw(run);
    run.daily.date.forEach((d, i) => {
      const v = run.daily.da_rt_revenue![i];
      if (v == null) return; // compare on matched days only
      const m = Number(d.slice(5, 7));
      pf.set(m, (pf.get(m) ?? 0) + run.daily.revenue[i] / k);
      da.set(m, (da.get(m) ?? 0) + v / k);
    });
    const months = [...pf.keys()].sort((a, b) => a - b);
    return { months, pf: months.map((m) => pf.get(m)!), da: months.map((m) => da.get(m)!) };
  }, [run]);
  const build = useMemo(() => {
    if (!data) return undefined;
    return (t: ChartTheme) => ({
      grid: { left: 48, right: 12, top: 36, bottom: 28 },
      legend: { ...legendBase(t), data: ['Perfect foresight', 'DA-scheduled'] },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          const cap = data.pf[i] > 0 ? ` · capture ${pct(data.da[i] / data.pf[i], 0)}` : '';
          return `<b>${MONTHS[data.months[i] - 1]}</b><br/>Perfect foresight ${usd(data.pf[i], 2)}/kW<br/>DA-scheduled ${usd(data.da[i], 2)}/kW${cap}`;
        },
      },
      xAxis: { type: 'category', data: data.months.map((m) => MONTHS[m - 1]), ...axisBase(t) },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW', nameGap: 8 },
      series: [
        { name: 'Perfect foresight', type: 'bar', barMaxWidth: 16, barGap: '15%', data: data.pf, itemStyle: { color: t.baseline, borderRadius: [3, 3, 0, 0] } },
        { name: 'DA-scheduled', type: 'bar', barMaxWidth: 16, data: data.da, itemStyle: { color: t.series[0], borderRadius: [3, 3, 0, 0] } },
      ],
    });
  }, [data]);
  const csv = (): CsvData | undefined =>
    data && run && {
      filename: `monthly_pf_vs_da_${run.meta.location}_${run.meta.year}_${run.meta.duration_h}h_deg${run.meta.deg_cost_per_mwh}.csv`,
      headers: ['month', 'perfect_foresight_usd_per_kw', 'da_scheduled_usd_per_kw'],
      rows: data.months.map((m, i) => [MONTHS[m - 1], +data.pf[i].toFixed(3), +data.da[i].toFixed(3)]),
    };
  return (
    <Card
      title="Month by month: perfect foresight vs DA-scheduled"
      subtitle={run ? `$ per kW, net of degradation · ${run.meta.location} · ${run.meta.duration_h}h · ${yearLabel(run.meta.year)}` : undefined}
      csv={csv}
    >
      {(ex) => (build ? <Chart build={build} height={ex ? '62vh' : 300} label="Monthly revenue, perfect foresight versus day-ahead scheduled" /> : <ChartSkeleton h={300} />)}
    </Card>
  );
}

// ---------------------------------------------------------------- RTC+B, selected location
const PRICE_ROWS: { key: keyof RtcbPrices; label: string; hint: string }[] = [
  { key: 'rt_minus_da_mean_abs', label: 'Mean |RT − DA|', hint: 'average size of the gap between each 15-min RT price and its hour’s DA price' },
  { key: 'rt_minus_da_mean', label: 'Mean RT − DA', hint: 'signed: positive means RT settled above DA on average' },
  { key: 'rt_std', label: 'RT price std', hint: 'standard deviation of all 15-min RT prices; dominated by a few spikes' },
  { key: 'rt_intraday_std_median', label: 'Median daily RT std', hint: 'spread of prices within a typical day; less sensitive to spikes' },
  { key: 'rt_mean', label: 'Mean RT price', hint: '' },
];

export function RtcbCard({ sel, rtcb }: { sel: Selection; rtcb: Rtcb | null }) {
  const loc = rtcb?.locations[sel.location];
  const run = loc?.runs.find((r) => r.duration_h === sel.duration && r.deg_cost_per_mwh === sel.deg);
  const [view, setView] = useState<'pf' | 'da'>('pf');
  const build = useMemo(() => {
    if (!run) return undefined;
    const m = run.monthly;
    const [b, a] = view === 'pf' ? [m.pf_before, m.pf_after] : [m.da_rt_before, m.da_rt_after];
    const label = view === 'pf' ? 'Perfect foresight' : 'DA-scheduled';
    return (t: ChartTheme) => ({
      grid: { left: 48, right: 12, top: 36, bottom: 28 },
      legend: { ...legendBase(t), data: ['Before', 'After'] },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          return `<b>${MONTHS[m.months[i] - 1]}</b> · ${label}<br/>Before ${usd(b[i], 2)}/kW<br/>After ${usd(a[i], 2)}/kW`;
        },
      },
      xAxis: { type: 'category', data: m.months.map((x) => MONTHS[x - 1]), ...axisBase(t) },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW', nameGap: 8 },
      series: [
        { id: 'before', name: 'Before', type: 'bar', barMaxWidth: 16, barGap: '15%', data: b, itemStyle: { color: t.baseline, borderRadius: [3, 3, 0, 0] } },
        { id: 'after', name: 'After', type: 'bar', barMaxWidth: 16, data: a, itemStyle: { color: t.series[0], borderRadius: [3, 3, 0, 0] } },
      ],
    });
  }, [run, view]);
  const csv = (): CsvData | undefined =>
    run && loc && {
      filename: `rtcb_${sel.location}_${sel.duration}h_deg${sel.deg}.csv`,
      headers: ['metric', 'before', 'after'],
      rows: [
        ['perfect_foresight_usd_per_kw', run.before.pf_revenue_per_kw, run.after.pf_revenue_per_kw],
        ['da_scheduled_usd_per_kw', run.before.da_rt_revenue_per_kw, run.after.da_rt_revenue_per_kw],
        ['capture_rate', run.before.capture_rate, run.after.capture_rate],
        ...PRICE_ROWS.map((p) => [p.key, loc.prices.before[p.key], loc.prices.after[p.key]] as (string | number)[]),
        ...run.monthly.months.map((m, i) => [`${MONTHS[m - 1]}_pf_usd_per_kw`, run.monthly.pf_before[i], run.monthly.pf_after[i]]),
        ...run.monthly.months.map((m, i) => [`${MONTHS[m - 1]}_da_scheduled_usd_per_kw`, run.monthly.da_rt_before[i], run.monthly.da_rt_after[i]]),
      ],
    };
  const w = rtcb?.meta;
  return (
    <Card
      title={`Before vs after RTC+B · ${sel.location}`}
      subtitle={w ? `${durLabel(sel.duration)} battery, $${sel.deg}/MWh degradation. ${fmtDate(w.before.start)} – ${fmtDate(w.before.end)} vs ${fmtDate(w.after.start)} – ${fmtDate(w.after.end)}, same calendar days. Ignores the year selector.` : undefined}
      csv={csv}
    >
      {(ex) =>
        !run || !loc || !build ? <ChartSkeleton h={260} /> : (
          <>
            <Split>
            <div>
            <SegmentedControl
              size="xs" mb="sm" value={view} onChange={(v) => setView(v as 'pf' | 'da')}
              data={[{ value: 'pf', label: 'Perfect foresight' }, { value: 'da', label: 'DA-scheduled' }]}
              aria-label="Strategy shown in the monthly chart"
            />
            <Chart build={build} height={ex ? '50vh' : 300} label="Monthly revenue before and after RTC+B" />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm" mt="xs">
                <Table.Thead><Table.Tr><Table.Th>{run.days} matched days</Table.Th><Table.Th ta="right">Before</Table.Th><Table.Th ta="right">After</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody style={tnum}>
                  <Table.Tr><Table.Td>Perfect foresight, $/kW</Table.Td><Table.Td ta="right">{usd(run.before.pf_revenue_per_kw)}</Table.Td><Table.Td ta="right">{usd(run.after.pf_revenue_per_kw)}<Change v={run.change.pf_revenue} /></Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>DA-scheduled, $/kW</Table.Td><Table.Td ta="right">{usd(run.before.da_rt_revenue_per_kw)}</Table.Td><Table.Td ta="right">{usd(run.after.da_rt_revenue_per_kw)}<Change v={run.change.da_rt_revenue} /></Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>Capture rate</Table.Td><Table.Td ta="right">{pct(run.before.capture_rate)}</Table.Td><Table.Td ta="right">{pct(run.after.capture_rate)}<Change v={run.change.capture_rate_pts} kind="pts" /></Table.Td></Table.Tr>
                  {PRICE_ROWS.map((p) => (
                    <Table.Tr key={p.key}>
                      <Table.Td>{p.label}, $/MWh{p.hint && <Text c="dimmed" fz="xs" lh={1.35}>{p.hint}</Text>}</Table.Td>
                      <Table.Td ta="right">{usdS(loc.prices.before[p.key])}</Table.Td>
                      <Table.Td ta="right">{usdS(loc.prices.after[p.key])}{p.key !== 'rt_minus_da_mean' && <Change v={loc.prices.after[p.key] / loc.prices.before[p.key] - 1} />}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
            </Split>
          </>
        )
      }
    </Card>
  );
}

// ---------------------------------------------------------------- RTC+B, every location
export function RtcbAllCard({ sel, rtcb, index }: { sel: Selection; rtcb: Rtcb | null; index: IndexRun[] | null }) {
  const { go } = useApp();
  const rows = useMemo(() => {
    if (!rtcb || !index) return undefined;
    return locationsOf(index)
      .filter((l) => rtcb.locations[l])
      .map((l) => {
        const loc = rtcb.locations[l];
        return { l, loc, run: loc.runs.find((r) => r.duration_h === sel.duration && r.deg_cost_per_mwh === sel.deg)! };
      })
      .filter((r) => r.run);
  }, [rtcb, index, sel.duration, sel.deg]);
  const build = useMemo(() => {
    if (!rows) return undefined;
    const rev = [...rows].reverse();
    return (t: ChartTheme) => ({
      grid: { left: 108, right: 20, top: 30, bottom: 28 },
      legend: { ...legendBase(t), data: ['Perfect foresight', 'DA-scheduled'] },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: { dataIndex: number; marker: string; seriesName: string; value: number }[]) =>
          `<b>${rev[ps[0].dataIndex].l}</b> · after vs before<br/>` + ps.map((p) => `${p.marker} ${p.seriesName}: ${signed(p.value)}`).join('<br/>'),
      },
      xAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` } },
      yAxis: { type: 'category', data: rev.map((r) => r.l), ...axisBase(t), splitLine: { show: false }, axisLabel: { color: t.text, fontSize: 11 } },
      series: [
        { name: 'Perfect foresight', type: 'bar', barMaxWidth: 9, barGap: '25%', data: rev.map((r) => r.run.change.pf_revenue), itemStyle: { color: t.baseline, borderRadius: 3 } },
        { name: 'DA-scheduled', type: 'bar', barMaxWidth: 9, data: rev.map((r) => r.run.change.da_rt_revenue), itemStyle: { color: t.series[0], borderRadius: 3 } },
      ],
    });
  }, [rows]);
  const csv = (): CsvData | undefined =>
    rows && {
      filename: `rtcb_all_${sel.duration}h_deg${sel.deg}.csv`,
      headers: ['location', 'days', 'pf_before', 'pf_after', 'pf_change', 'da_before', 'da_after', 'da_change', 'capture_before', 'capture_after', 'abs_rt_minus_da_before', 'abs_rt_minus_da_after', 'rt_std_before', 'rt_std_after', 'median_daily_rt_std_before', 'median_daily_rt_std_after'],
      rows: rows.map(({ l, loc, run }) => [
        l, run.days, run.before.pf_revenue_per_kw, run.after.pf_revenue_per_kw, run.change.pf_revenue, run.before.da_rt_revenue_per_kw, run.after.da_rt_revenue_per_kw, run.change.da_rt_revenue,
        run.before.capture_rate, run.after.capture_rate, loc.prices.before.rt_minus_da_mean_abs, loc.prices.after.rt_minus_da_mean_abs, loc.prices.before.rt_std, loc.prices.after.rt_std,
        loc.prices.before.rt_intraday_std_median, loc.prices.after.rt_intraday_std_median,
      ]),
    };
  return (
    <Card
      title="Before vs after RTC+B · every location"
      subtitle={`Change in revenue over matched windows · ${durLabel(sel.duration)} battery · $${sel.deg}/MWh degradation`}
      csv={csv}
    >
      {(ex) =>
        !rows || !build ? <ChartSkeleton h={360} /> : (
          <>
            <Split>
            <Chart build={build} height={ex ? '55vh' : 360} label="Percent change in revenue after RTC+B by location" />
            <div style={{ overflowX: 'auto' }}>
              <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm" mt="xs" miw={560} highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Location</Table.Th><Table.Th ta="right">Perfect foresight $/kW</Table.Th><Table.Th ta="right">DA-scheduled $/kW</Table.Th>
                    <Table.Th ta="right">Capture</Table.Th><Table.Th ta="right">|RT − DA|</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody style={{ ...tnum, whiteSpace: 'nowrap' }}>
                  {rows.map(({ l, loc, run }) => (
                    <Table.Tr key={l} fw={l === sel.location ? 600 : undefined}>
                      <Table.Td><Anchor component="button" size="sm" c="inherit" underline="always" fw="inherit" onClick={() => go('realism', { location: l })}>{l}</Anchor></Table.Td>
                      <Table.Td ta="right">{usd(run.before.pf_revenue_per_kw, 0)} → {usd(run.after.pf_revenue_per_kw, 0)}<Change v={run.change.pf_revenue} /></Table.Td>
                      <Table.Td ta="right">{usd(run.before.da_rt_revenue_per_kw, 0)} → {usd(run.after.da_rt_revenue_per_kw, 0)}<Change v={run.change.da_rt_revenue} /></Table.Td>
                      <Table.Td ta="right">{pct(run.before.capture_rate)} → {pct(run.after.capture_rate)}</Table.Td>
                      <Table.Td ta="right">{usd(loc.prices.before.rt_minus_da_mean_abs, 0)} → {usd(loc.prices.after.rt_minus_da_mean_abs, 0)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={6}>Before → after. Revenue is $ per kW over the matched days, not annualized. |RT − DA| is the mean gap between each 15-min RT price and its hour’s DA price, $/MWh. The CSV adds RT volatility.</Text>
            </div>
            </Split>
          </>
        )
      }
    </Card>
  );
}
