import { useMemo } from 'react';
import { Anchor, Badge, Skeleton, Table, Text } from '@mantine/core';
import { Card, type CsvData } from './Card';
import { Chart, axisBase, tooltipBase, type ChartTheme } from './Chart';
import type { IndexRun, NodeSelection, Run, Selection } from '../data/types';
import { findRun } from '../data/loader';
import { MONTHS, durLabel, fmtDate, num, pct, usd, yearLabel } from '../data/format';
import { TOP_DAY_WARN, hubOf, kw, topDay } from '../data/analytics';
import { useRuns, useApp } from '../state';

const H = 280;
const tall = (expanded: boolean, h = H) => (expanded ? '70vh' : h);
const tag = (r: Run) => `${r.meta.location}_${r.meta.year}_${r.meta.duration_h}h_deg${r.meta.deg_cost_per_mwh}`;
const scenario = (r: Run) =>
  `${r.meta.location} · ${r.meta.duration_h}h · ${yearLabel(r.meta.year)} · $${r.meta.deg_cost_per_mwh}/MWh degradation`;

function Loading({ h = H }: { h?: number | string }) {
  return <Skeleton h={h} radius="md" />;
}

/** Months with data (a YTD run has no later months). */
function monthsCovered(run: Run) {
  const last = Number(run.meta.last_day.slice(5, 7));
  return Array.from({ length: last }, (_, i) => i + 1);
}

// ---------------------------------------------------------------- monthly revenue
export function MonthlyRevenueCard({ run }: { run?: Run }) {
  const build = useMemo(() => {
    if (!run) return undefined;
    const months = monthsCovered(run);
    const vals = months.map((m) => run.metrics.monthly_revenue_per_kw[String(m)] ?? 0);
    const partial = run.metrics.annualized;
    return (t: ChartTheme) => ({
      grid: { left: 44, right: 12, top: 16, bottom: 28 },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (p: { dataIndex: number }[]) =>
          `<b>${MONTHS[months[p[0].dataIndex] - 1]}</b><br/>${usd(vals[p[0].dataIndex], 2)} per kW` +
          (partial && p[0].dataIndex === months.length - 1 ? '<br/><i>partial month</i>' : ''),
      },
      xAxis: { type: 'category', data: months.map((m) => MONTHS[m - 1]), ...axisBase(t) },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW', nameGap: 8 },
      series: [{
        type: 'bar', data: vals, barMaxWidth: 26,
        itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { opacity: 0.85 } },
      }],
    });
  }, [run]);
  const csv = (): CsvData | undefined =>
    run && {
      filename: `monthly_revenue_${tag(run)}.csv`,
      headers: ['month', 'revenue_usd_per_kw'],
      rows: monthsCovered(run).map((m) => [MONTHS[m - 1], run.metrics.monthly_revenue_per_kw[String(m)] ?? 0]),
    };
  return (
    <Card title="Monthly revenue" subtitle={run ? `$ per kW of power capacity, net of degradation · ${scenario(run)}` : undefined} csv={csv}>
      {(ex) => (build ? <Chart build={build} height={tall(ex)} label="Monthly revenue bar chart" /> : <Loading />)}
    </Card>
  );
}

// ---------------------------------------------------------------- dispatch heatmap
export function HeatmapCard({ run }: { run?: Run }) {
  const build = useMemo(() => {
    if (!run) return undefined;
    const { values } = run.metrics.heatmap_net_mw;
    const months = monthsCovered(run);
    const pw = run.meta.power_mw;
    const cells: [number, number, number][] = [];
    months.forEach((m, yi) => values[m - 1].forEach((v, h) => cells.push([h, yi, Math.round((v / pw) * 1000) / 10])));
    const peak = Math.max(...cells.map((c) => Math.abs(c[2])));
    const cap = Math.max(20, Math.ceil(peak / 10) * 10); // symmetric so blue and orange are comparable
    return (t: ChartTheme) => ({
      grid: { left: 40, right: 14, top: 10, bottom: 84 },
      tooltip: {
        ...tooltipBase(t),
        formatter: (p: { value: [number, number, number] }) => {
          const [h, yi, v] = p.value;
          const mode = v > 0.5 ? 'discharging' : v < -0.5 ? 'charging' : 'idle';
          return `<b>${MONTHS[months[yi] - 1]}, ${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00</b><br/>${mode}: ${Math.abs(v).toFixed(0)}% of rated power<br/><span style="opacity:.7">${((v / 100) * pw).toFixed(1)} MW avg net</span>`;
        },
      },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), splitArea: { show: false }, ...axisBase(t), splitLine: { show: false }, name: 'Hour of day (Central time)', nameLocation: 'middle', nameGap: 28 },
      yAxis: { type: 'category', data: months.map((m) => MONTHS[m - 1]), inverse: true, ...axisBase(t), splitLine: { show: false } },
      visualMap: {
        min: -cap, max: cap, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 160,
        text: ['Discharging', 'Charging'], textStyle: { color: t.muted, fontSize: 11 },
        inRange: { color: [t.charge, t.neutral, t.discharge] },
        formatter: (v: number) => `${Math.round(v)}%`,
      },
      series: [{
        type: 'heatmap', data: cells, itemStyle: { borderColor: t.surface, borderWidth: 1.5, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1.5 } },
      }],
    });
  }, [run]);
  const csv = (): CsvData | undefined =>
    run && {
      filename: `dispatch_heatmap_${tag(run)}.csv`,
      headers: ['month', 'hour_central', 'avg_net_discharge_mw', 'pct_of_rated_power'],
      rows: monthsCovered(run).flatMap((m) =>
        run.metrics.heatmap_net_mw.values[m - 1].map((v, h) => [MONTHS[m - 1], h, v, Math.round((v / run.meta.power_mw) * 1000) / 10]),
      ),
    };
  return (
    <Card
      title="Dispatch pattern by hour and month"
      subtitle={run ? `Average net dispatch as % of rated power; orange = discharging, blue = charging · ${scenario(run)}` : undefined}
      csv={csv}
    >
      {(ex) => (build ? <Chart build={build} height={ex ? '72vh' : 360} label="Heatmap of average net battery dispatch by hour of day and month" /> : <Loading h={360} />)}
    </Card>
  );
}

// ---------------------------------------------------------------- typical day
export function TypicalDayCard({ run }: { run?: Run }) {
  const data = useMemo(() => {
    if (!run) return undefined;
    const months = monthsCovered(run);
    const v = run.metrics.heatmap_net_mw.values;
    return Array.from({ length: 24 }, (_, h) => months.reduce((s, m) => s + v[m - 1][h], 0) / months.length / run.meta.power_mw);
  }, [run]);
  const build = useMemo(() => {
    if (!data) return undefined;
    const lim = Math.max(0.2, Math.ceil(Math.max(...data.map(Math.abs)) * 10) / 10);
    return (t: ChartTheme) => ({
      grid: { left: 48, right: 12, top: 16, bottom: 44 },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (p: { dataIndex: number }[]) => {
          const v = data[p[0].dataIndex];
          return `<b>${String(p[0].dataIndex).padStart(2, '0')}:00</b><br/>${v >= 0 ? 'discharging' : 'charging'} ${Math.abs(v * 100).toFixed(0)}% of rated power`;
        },
      },
      xAxis: { type: 'category', data: data.map((_, h) => String(h).padStart(2, '0')), ...axisBase(t), name: 'Hour of day (Central time)', nameLocation: 'middle', nameGap: 28 },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` }, min: -lim, max: lim },
      series: [{
        type: 'bar', barMaxWidth: 14,
        data: data.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? t.discharge : t.charge, borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })),
      }],
    });
  }, [data]);
  const csv = (): CsvData | undefined =>
    run && data && { filename: `typical_day_${tag(run)}.csv`, headers: ['hour_central', 'avg_net_pct_of_rated_power'], rows: data.map((v, h) => [h, Math.round(v * 1000) / 10]) };
  return (
    <Card title="Typical day" subtitle="Average net dispatch by hour across the months covered. Orange discharges, blue charges." csv={csv}>
      {(ex) => (build ? <Chart build={build} height={tall(ex)} label="Average hourly net dispatch profile" /> : <Loading />)}
    </Card>
  );
}

// ---------------------------------------------------------------- cumulative revenue
export function CumulativeCard({ run }: { run?: Run }) {
  const calc = useMemo(() => {
    if (!run) return undefined;
    const k = kw(run);
    let c = 0;
    const cum = run.daily.revenue.map((r) => (c += r / k));
    const top = new Set(run.metrics.top10_days);
    const marks = run.daily.date.map((d, i) => (top.has(d) ? [d, cum[i], run.daily.revenue[i] / k] : null)).filter(Boolean) as [string, number, number][];
    return { cum, marks, k };
  }, [run]);
  const build = useMemo(() => {
    if (!run || !calc) return undefined;
    const { cum, marks } = calc;
    return (t: ChartTheme) => ({
      grid: { left: 48, right: 14, top: 56, bottom: 30 },
      legend: { top: 0, left: 0, icon: 'circle', itemWidth: 8, textStyle: { color: t.muted, fontSize: 11 }, data: ['Cumulative revenue', 'Top-10 days'] },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis',
        formatter: (ps: { seriesName: string; value: [string, number, number?]; dataIndex: number }[]) => {
          const base = ps.find((p) => p.seriesName === 'Cumulative revenue') ?? ps[0];
          const date = base.value[0];
          const i = run.daily.date.indexOf(date);
          const day = run.daily.revenue[i] / calc.k;
          const isTop = run.metrics.top10_days.includes(date);
          return `<b>${fmtDate(date)}</b>${isTop ? ' <span style="color:' + t.series[1] + '">top-10 day</span>' : ''}<br/>Cumulative ${usd(base.value[1], 2)}/kW<br/>That day ${usd(day, 2)}/kW`;
        },
      },
      xAxis: { type: 'time', ...axisBase(t), splitLine: { show: false } },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW', nameGap: 8 },
      series: [
        { name: 'Cumulative revenue', type: 'line', showSymbol: false, symbol: 'none', lineStyle: { width: 2, color: t.series[0] }, itemStyle: { color: t.series[0] }, areaStyle: { color: t.series[0], opacity: 0.08 }, data: run.daily.date.map((d, i) => [d, cum[i]]) },
        { name: 'Top-10 days', type: 'scatter', symbolSize: 10, itemStyle: { color: t.series[1], borderColor: t.surface, borderWidth: 2 }, data: marks, z: 5 },
      ],
    });
  }, [run, calc]);
  const csv = (): CsvData | undefined =>
    run && calc && {
      filename: `cumulative_revenue_${tag(run)}.csv`,
      headers: ['date', 'daily_revenue_usd_per_kw', 'cumulative_usd_per_kw', 'is_top10_day'],
      rows: run.daily.date.map((d, i) => [d, Math.round((run.daily.revenue[i] / calc.k) * 1e4) / 1e4, Math.round(calc.cum[i] * 1e4) / 1e4, run.metrics.top10_days.includes(d) ? 1 : 0]),
    };
  const t10 = run?.metrics.top10_day_share;
  return (
    <Card
      title="Cumulative revenue"
      subtitle={run ? `Orange dots mark the 10 best days${t10 != null ? `, together ${pct(t10, 0)} of the total` : ''} · ${scenario(run)}` : undefined}
      csv={csv}
    >
      {(ex) => (build ? <Chart build={build} height={tall(ex)} label="Cumulative revenue line with top ten days marked" /> : <Loading />)}
    </Card>
  );
}

// ---------------------------------------------------------------- daily revenue
export function DailyRevenueCard({ run }: { run?: Run }) {
  const build = useMemo(() => {
    if (!run) return undefined;
    const k = kw(run);
    const top = new Set(run.metrics.top10_days);
    return (t: ChartTheme) => ({
      grid: { left: 48, right: 14, top: 56, bottom: 30 },
      legend: { top: 0, left: 0, icon: 'circle', itemWidth: 8, textStyle: { color: t.muted, fontSize: 11 }, data: ['Other days', 'Top-10 days'] },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'line' },
        formatter: (ps: { value: [string, number] }[]) => `<b>${fmtDate(ps[0].value[0])}</b>${top.has(ps[0].value[0]) ? ' (top-10 day)' : ''}<br/>${usd(ps[0].value[1], 2)} per kW`,
      },
      xAxis: { type: 'time', ...axisBase(t), splitLine: { show: false } },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW per day', nameGap: 8 },
      series: [
        { name: 'Other days', type: 'bar', barMaxWidth: 4, itemStyle: { color: t.series[0] }, data: run.daily.date.map((d, i) => (top.has(d) ? [d, 0] : [d, run.daily.revenue[i] / k])), large: true },
        { name: 'Top-10 days', type: 'bar', barMaxWidth: 4, barGap: '-100%', itemStyle: { color: t.series[1] }, data: run.daily.date.map((d, i) => (top.has(d) ? [d, run.daily.revenue[i] / k] : [d, 0])) },
      ],
    });
  }, [run]);
  const csv = (): CsvData | undefined =>
    run && { filename: `daily_revenue_${tag(run)}.csv`, headers: ['date', 'revenue_usd_per_kw', 'cycles'], rows: run.daily.date.map((d, i) => [d, Math.round((run.daily.revenue[i] / kw(run)) * 1e4) / 1e4, run.daily.cycles[i]]) };
  return (
    <Card title="Daily revenue" subtitle="Each bar is one operating day, solved independently. The best ten are orange." csv={csv}>
      {(ex) => (build ? <Chart build={build} height={tall(ex)} label="Daily revenue bar chart" /> : <Loading />)}
    </Card>
  );
}

export function TopDaysCard({ run }: { run?: Run }) {
  const rows = useMemo(() => {
    if (!run) return undefined;
    const idx = new Map(run.daily.date.map((d, i) => [d, i]));
    const total = run.daily.revenue.reduce((a, b) => a + b, 0);
    return run.metrics.top10_days.map((d, n) => {
      const r = run.daily.revenue[idx.get(d)!];
      return { n: n + 1, date: d, perKw: r / kw(run), share: r / total, cycles: run.daily.cycles[idx.get(d)!] };
    });
  }, [run]);
  const csv = (): CsvData | undefined =>
    run && rows && { filename: `top10_days_${tag(run)}.csv`, headers: ['rank', 'date', 'usd_per_kw', 'share_of_total', 'cycles'], rows: rows.map((r) => [r.n, r.date, +r.perKw.toFixed(3), +r.share.toFixed(4), r.cycles]) };
  return (
    <Card title="Ten best days" subtitle="Share is of the total for the period covered." csv={csv}>
      {() =>
        !rows ? <Loading /> : (
          <div style={{ overflowX: 'auto' }}>
            <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm" highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>Date</Table.Th><Table.Th ta="right">$/kW</Table.Th><Table.Th ta="right">Share</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.date}>
                    <Table.Td c="dimmed">{r.n}</Table.Td><Table.Td>{fmtDate(r.date)}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(r.perKw, 2)}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(r.share, 1)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )
      }
    </Card>
  );
}

// ---------------------------------------------------------------- capture prices
export function CapturePricesCard({ run }: { run?: Run }) {
  const m = run?.metrics;
  const build = useMemo(() => {
    if (!m) return undefined;
    const vals = [m.avg_charge_price, m.avg_discharge_price];
    return (t: ChartTheme) => ({
      grid: { left: 52, right: 16, top: 24, bottom: 28 },
      tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: { dataIndex: number }[]) => `${['Average charge price', 'Average discharge price'][p[0].dataIndex]}: ${usd(vals[p[0].dataIndex], 2)}/MWh` },
      xAxis: { type: 'category', data: ['Buys at', 'Sells at'], ...axisBase(t) },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/MWh', nameGap: 8 },
      series: [{
        type: 'bar', barMaxWidth: 56,
        label: { show: true, position: 'top', color: t.text, fontSize: 12, formatter: (p: { value: number }) => usd(p.value, 0) },
        data: [{ value: vals[0], itemStyle: { color: t.charge, borderRadius: [4, 4, 0, 0] } }, { value: vals[1], itemStyle: { color: t.discharge, borderRadius: [4, 4, 0, 0] } }],
      }],
    });
  }, [m]);
  const csv = (): CsvData | undefined =>
    run && m && { filename: `capture_prices_${tag(run)}.csv`, headers: ['metric', 'usd_per_mwh'], rows: [['avg_charge_price', m.avg_charge_price], ['avg_discharge_price', m.avg_discharge_price], ['avg_spread_captured', m.avg_spread_captured]] };
  return (
    <Card
      title="Prices paid and received"
      subtitle={m ? `Energy-weighted. Spread captured ${usd(m.avg_spread_captured, 0)}/MWh (sell price minus buy price).` : undefined}
      csv={csv}
    >
      {(ex) => (build ? <Chart build={build} height={tall(ex)} label="Average charge versus discharge price" /> : <Loading />)}
    </Card>
  );
}

// ---------------------------------------------------------------- duration comparison
function Delta({ now, prev }: { now: number; prev?: number }) {
  if (prev == null || !prev) return null;
  const d = now / prev - 1;
  return <Text span fz="xs" c={d >= 0 ? 'teal.7' : 'red.7'} ml={6}>{d >= 0 ? '+' : ''}{(d * 100).toFixed(0)}%</Text>;
}

export function DurationCard({ sel, index }: { sel: Selection; index: IndexRun[] | null }) {
  const rows = [1, 2, 4].map((d) => (index ? findRun(index, sel, sel.location, sel.year, d) : undefined));
  const { runs } = useRuns(rows.map((r) => r?.file));
  const build = useMemo(() => {
    if (!runs) return undefined;
    const vals = rows.map((r) => r?.revenue_per_kw_year ?? 0);
    return (t: ChartTheme) => ({
      grid: { left: 52, right: 16, top: 28, bottom: 28 },
      tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: { dataIndex: number }[]) => `<b>${durLabel([1, 2, 4][p[0].dataIndex])} battery</b><br/>${usd(vals[p[0].dataIndex], 1)}/kW-yr` },
      xAxis: { type: 'category', data: ['1-hour', '2-hour', '4-hour'], ...axisBase(t) },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW-yr', nameGap: 8 },
      series: [{
        type: 'bar', barMaxWidth: 64,
        label: { show: true, position: 'top', color: t.text, fontSize: 12, formatter: (p: { value: number }) => usd(p.value, 1) },
        data: vals.map((v, i) => ({ value: v, itemStyle: { color: [t.series[0], t.series[1], t.series[2]][i], borderRadius: [4, 4, 0, 0] } })),
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);
  const annualized = rows.some((r) => r?.annualized);
  const csv = (): CsvData | undefined =>
    runs && {
      filename: `duration_comparison_${sel.location}_${sel.year}_deg${sel.deg}.csv`,
      headers: ['duration_h', 'usd_per_kw_yr', 'usd_per_kwh_yr', 'cycles_per_year', 'top10_day_share', 'avg_spread_usd_per_mwh', 'annualized'],
      rows: rows.map((r) => r && [r.duration_h, r.revenue_per_kw_year, +(r.revenue_per_kw_year / r.duration_h).toFixed(2), r.cycles_per_year, r.top10_day_share, r.avg_spread_captured, r.annualized ? 1 : 0]),
    } as CsvData;
  return (
    <Card
      title="1h vs 2h vs 4h"
      subtitle={`${sel.location} · ${yearLabel(sel.year)} · $${sel.deg}/MWh degradation${annualized ? ' · annualized year-to-date' : ''}`}
      csv={csv}
    >
      {(ex) => (
        <>
          {build ? <Chart build={build} height={tall(ex, 220)} label="Revenue by battery duration" /> : <Loading h={220} />}
          <div style={{ overflowX: 'auto' }}>
            <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm" mt="xs">
              <Table.Thead>
                <Table.Tr><Table.Th>Duration</Table.Th><Table.Th ta="right">$/kW-yr</Table.Th><Table.Th ta="right">$/kWh-yr</Table.Th><Table.Th ta="right">Cycles/yr</Table.Th><Table.Th ta="right">Top-10 share</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r, i) => r && (
                  <Table.Tr key={r.duration_h} fw={r.duration_h === sel.duration ? 600 : undefined}>
                    <Table.Td>{durLabel(r.duration_h)}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(r.revenue_per_kw_year)}<Delta now={r.revenue_per_kw_year} prev={rows[i - 1]?.revenue_per_kw_year} /></Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(r.revenue_per_kw_year / r.duration_h)}<Delta now={r.revenue_per_kw_year / r.duration_h} prev={rows[i - 1] ? rows[i - 1]!.revenue_per_kw_year / rows[i - 1]!.duration_h : undefined} /></Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(r.cycles_per_year)}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(r.top10_day_share)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- node vs hub
const YEARS3 = [2024, 2025, 2026];

export function NodeHubCard({ sel, index, nodes }: { sel: Selection; index: IndexRun[] | null; nodes: NodeSelection | null }) {
  const { go } = useApp();
  const hub = hubOf(sel.location, nodes ?? undefined);
  const isHub = sel.location.startsWith('HB_');
  const members = useMemo(() => {
    if (!hub || !nodes) return [];
    const list = isHub ? nodes.nodes.filter((n) => n.nearest_hub === hub).map((n) => n.location) : [sel.location];
    return [hub, ...list];
  }, [hub, nodes, isHub, sel.location]);

  const files = YEARS3.flatMap((y) => members.map((m) => (index ? findRun(index, sel, m, y)?.file : undefined)));
  const { runs, loading } = useRuns(members.length > 1 ? files : []);

  // For each year, compare every member over the days that all members cover.
  const calc = useMemo(() => {
    if (!runs || members.length < 2) return undefined;
    return YEARS3.map((y, yi) => {
      const rs = members.map((_, mi) => runs[yi * members.length + mi]);
      if (rs.some((r) => !r)) return { year: y, vals: members.map(() => null as number | null), days: 0, first: '', last: '' };
      let common = new Set(rs[0]!.daily.date);
      rs.slice(1).forEach((r) => (common = new Set(r!.daily.date.filter((d) => common.has(d)))));
      const vals = rs.map((r) => {
        let s = 0;
        r!.daily.date.forEach((d, i) => { if (common.has(d)) s += r!.daily.revenue[i]; });
        return s / kw(r!);
      });
      const ds = [...common].sort();
      return { year: y, vals, days: ds.length, first: ds[0], last: ds[ds.length - 1] };
    });
  }, [runs, members]);

  const build = useMemo(() => {
    if (!calc) return undefined;
    return (t: ChartTheme) => ({
      grid: { left: 52, right: 12, top: 56, bottom: 28 },
      legend: { top: 0, left: 0, icon: 'circle', itemWidth: 8, textStyle: { color: t.muted, fontSize: 11 }, data: members },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: { seriesName: string; value: number; marker: string; dataIndex: number }[]) =>
          `<b>${yearLabel(YEARS3[ps[0].dataIndex])}</b> (${calc[ps[0].dataIndex].days} common days)<br/>` + ps.map((p) => `${p.marker} ${p.seriesName}: ${usd(p.value, 1)}/kW`).join('<br/>'),
      },
      xAxis: { type: 'category', data: YEARS3.map(yearLabel), ...axisBase(t) },
      yAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW (matched window)', nameGap: 8 },
      series: members.map((m, mi) => ({
        name: m, type: 'bar', barMaxWidth: 30,
        itemStyle: { color: mi === 0 ? t.axis : t.series[mi - 1], borderRadius: [3, 3, 0, 0] },
        data: calc.map((c) => c.vals[mi]),
      })),
    });
  }, [calc, members]);

  const csv = (): CsvData | undefined =>
    calc && {
      filename: `node_vs_hub_${sel.location}_${sel.duration}h_deg${sel.deg}.csv`,
      headers: ['year', 'window_first_day', 'window_last_day', 'days', ...members.map((m) => `${m}_usd_per_kw`), ...members.slice(1).map((m) => `${m}_over_${hub}`)],
      rows: calc.map((c) => [c.year, c.first, c.last, c.days, ...c.vals.map((v) => (v == null ? null : +v.toFixed(3))), ...c.vals.slice(1).map((v) => (v == null || !c.vals[0] ? null : +(v / c.vals[0]).toFixed(3)))]),
    };

  let body;
  if (!nodes || !index) body = <Loading />;
  else if (members.length < 2) {
    body = (
      <Text size="sm" c="dimmed" py="md">
        None of the sampled resource nodes sits in {hub}&rsquo;s load zone, so there is no node to compare. Hubs with nodes:
        HB_WEST (<Anchor component="button" size="sm" onClick={() => go('compare', { location: 'RUSSEKST_RN' })}>RUSSEKST_RN</Anchor>, ANSON1_ALL) and HB_SOUTH (CAMWIND_RN, RHESS2_ESS1, WIPOPA_3_4).
      </Text>
    );
  } else {
    body = (
      <>
        {loading || !build ? <Loading h={240} /> : null}
        {!loading && build && (
          <Chart build={build} height={240} label="Node versus hub revenue by year" />
        )}
      </>
    );
  }
  return (
    <Card
      title={isHub ? 'Hub vs the nodes near it' : 'Node vs its hub'}
      subtitle={`Same battery, same days: ${sel.duration}h, $${sel.deg}/MWh degradation. Nodes are matched to the hub of their load zone.`}
      csv={members.length > 1 ? csv : undefined}
      footer={calc ? <NodeHubTable members={members} calc={calc} /> : undefined}
    >
      {(ex) => (ex && build && members.length > 1 ? <Chart build={build} height="62vh" label="Node versus hub revenue by year" /> : body)}
    </Card>
  );
}

function NodeHubTable({ members, calc }: { members: string[]; calc: { year: number; vals: (number | null)[]; days: number; first: string; last: string }[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm" mt="xs">
        <Table.Thead>
          <Table.Tr><Table.Th>Year (days)</Table.Th>{members.map((m, i) => <Table.Th key={m} ta="right">{i === 0 ? `${m} $/kW` : `${m} ×hub`}</Table.Th>)}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {calc.map((c) => (
            <Table.Tr key={c.year}>
              <Table.Td>{yearLabel(c.year)} <Text span c="dimmed" fz="xs">({c.days})</Text></Table.Td>
              {c.vals.map((v, i) => (
                <Table.Td key={members[i]} ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {i === 0 ? usd(v) : v != null && c.vals[0] ? <b>{(v / c.vals[0]).toFixed(2)}×</b> : '–'}
                  {i > 0 && v != null && <Text span fz="xs" c="dimmed" ml={6}>{usd(v)}</Text>}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt={6}>
        Windows: {calc.map((c) => `${c.year}: ${c.first ? `${fmtDate(c.first)} to ${fmtDate(c.last)}` : 'n/a'}`).join(' · ')}.
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------- all locations
export function LocationsCard({ sel, index, nodes }: { sel: Selection; index: IndexRun[] | null; nodes: NodeSelection | null }) {
  const { go } = useApp();
  const rows = index ? [...new Map(index.map((r) => [r.location, r])).keys()].map((l) => findRun(index, sel, l)).filter(Boolean) as IndexRun[] : [];
  const { runs } = useRuns(rows.map((r) => r.file));
  const data = useMemo(() => {
    if (!runs) return undefined;
    return rows
      .map((r, i) => ({ r, top: topDay(runs[i]!) }))
      .sort((a, b) => b.r.revenue_per_kw_year - a.r.revenue_per_kw_year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);
  const build = useMemo(() => {
    if (!data) return undefined;
    const sorted = [...data].reverse();
    return (t: ChartTheme) => ({
      grid: { left: 108, right: 56, top: 8, bottom: 24 },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (p: { dataIndex: number }[]) => {
          const d = sorted[p[0].dataIndex];
          return `<b>${d.r.location}</b><br/>${usd(d.r.revenue_per_kw_year)}/kW-yr<br/>Top day ${pct(d.top?.share, 0)} of revenue`;
        },
      },
      xAxis: { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' } },
      yAxis: { type: 'category', data: sorted.map((d) => d.r.location), ...axisBase(t), splitLine: { show: false }, axisLabel: { color: t.text, fontSize: 11 } },
      series: [{
        type: 'bar', barMaxWidth: 18,
        label: { show: true, position: 'right', color: t.text, fontSize: 11, formatter: (p: { value: number }) => usd(p.value, 0) },
        data: sorted.map((d) => ({
          value: d.r.revenue_per_kw_year,
          itemStyle: { color: d.r.location === sel.location ? t.series[0] : d.r.location_type === 'hub' ? t.axis : t.series[2], borderRadius: [0, 4, 4, 0] },
        })),
      }],
    });
  }, [data, sel.location]);
  const csv = (): CsvData | undefined =>
    data && {
      filename: `locations_${sel.duration}h_${sel.year}_deg${sel.deg}.csv`,
      headers: ['location', 'type', 'usd_per_kw_yr', 'annualized', 'top10_day_share', 'top_day', 'top_day_share', 'cycles_per_year', 'avg_spread_usd_per_mwh'],
      rows: data.map(({ r, top }) => [r.location, r.location_type, r.revenue_per_kw_year, r.annualized ? 1 : 0, r.top10_day_share, top?.date ?? null, top ? +top.share.toFixed(4) : null, r.cycles_per_year, r.avg_spread_captured]),
    };
  const grp = (l: string) => nodes?.nodes.find((n) => n.location === l);
  return (
    <Card
      title="All locations"
      subtitle={`${sel.duration}-hour battery · ${yearLabel(sel.year)} · $${sel.deg}/MWh degradation. Grey = hub, green = resource node, blue = selected.`}
      csv={csv}
    >
      {(ex) =>
        !data || !build ? <Loading h={420} /> : (
          <>
            <Chart build={build} height={ex ? '50vh' : 300} label="Revenue by location, ranked" />
            <div style={{ overflowX: 'auto' }}>
              <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm" mt="xs" highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>Location</Table.Th><Table.Th ta="right">$/kW-yr</Table.Th><Table.Th ta="right">Top-10 share</Table.Th><Table.Th ta="right">Top day</Table.Th><Table.Th ta="right">Cycles/yr</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {data.map(({ r, top }) => (
                    <Table.Tr key={r.location} fw={r.location === sel.location ? 600 : undefined}>
                      <Table.Td>
                        <Anchor component="button" size="sm" onClick={() => go('compare', { location: r.location })} fw="inherit">{r.location}</Anchor>
                        {grp(r.location) && <Badge ml={6} size="xs" variant="light" color={grp(r.location)!.group === 'high' ? 'orange' : 'gray'}>{grp(r.location)!.group === 'high' ? 'volatile' : 'typical'}</Badge>}
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(r.revenue_per_kw_year)}</Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(r.top10_day_share)}</Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {top && top.share > TOP_DAY_WARN ? <Badge size="xs" color="orange" variant="light">{pct(top.share)} · check</Badge> : pct(top?.share)}
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(r.cycles_per_year)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </>
        )
      }
    </Card>
  );
}

