import { useMemo } from 'react';
import { Alert, Anchor, Stack, Text } from '@mantine/core';
import { Card, type CsvData } from './Card';
import { Chart, axisBase, legendBase, tooltipBase, type ChartTheme } from './Chart';
import { ChartSkeleton } from './Skeletons';
import { describeFleetRevenue, joinFleetRevenue } from '../data/context';
import { findRun, YEARS } from '../data/loader';
import { MONTHS, num, usd } from '../data/format';
import { locFull } from '../data/site';
import { useApp, useRuns } from '../state';
import { useContextData } from '../hooks';
import type { Run } from '../data/types';

const monthLabel = (ym: string) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(2, 4)}`;

/** Monthly $/kW for every year that has a run, keyed "YYYY-MM". A year-to-date run only covers its months so far. */
function monthlyRevenue(runs: (Run | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of runs) {
    if (!r) continue;
    const last = Number(r.meta.last_day.slice(5, 7));
    for (let m = 1; m <= last; m++) out[`${r.meta.year}-${String(m).padStart(2, '0')}`] = r.metrics.monthly_revenue_per_kw[String(m)] ?? 0;
  }
  return out;
}

/** Monthly arbitrage revenue against the installed ERCOT battery fleet. */
export function FleetRevenueCard() {
  const { sel, index } = useApp();
  const ctx = useContextData();
  const files = YEARS.map((y) => (index ? findRun(index, sel, sel.location, y)?.file : undefined));
  const { runs, error } = useRuns(files);
  const points = useMemo(() => (runs && ctx.data ? joinFleetRevenue(monthlyRevenue(runs), ctx.data.fleet.monthly) : undefined), [runs, ctx.data]);
  const sentence = useMemo(() => (points ? describeFleetRevenue(points) : undefined), [points]);
  const partial = runs?.find((r) => r?.metrics.annualized);
  const build = useMemo(() => {
    if (!points?.length) return undefined;
    return (t: ChartTheme) => ({
      grid: { left: 48, right: 52, top: 56, bottom: 34 },
      legend: { ...legendBase(t), data: ['Monthly revenue ($/kW)', 'ERCOT battery fleet (GW)'] },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: { dataIndex: number }[]) => {
          const p = points[ps[0].dataIndex];
          return `<b>${monthLabel(p.month)}</b><br/>Revenue ${usd(p.revenue, 2)} per kW<br/>Fleet ${num(p.fleetMw / 1000, 1)} GW installed`;
        },
      },
      xAxis: { type: 'category', data: points.map((p) => monthLabel(p.month)), ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, interval: 2 } },
      yAxis: [
        { type: 'value', ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, formatter: '${value}' }, name: '$/kW', nameGap: 8 },
        { type: 'value', ...axisBase(t), splitLine: { show: false }, axisLabel: { ...axisBase(t).axisLabel, formatter: '{value}' }, name: 'GW', nameGap: 8 },
      ],
      series: [
        { name: 'Monthly revenue ($/kW)', type: 'bar', barMaxWidth: 16, data: points.map((p) => p.revenue), itemStyle: { color: t.series[0], borderRadius: [3, 3, 0, 0] } },
        { name: 'ERCOT battery fleet (GW)', type: 'line', yAxisIndex: 1, showSymbol: false, smooth: false, lineStyle: { width: 2.5, color: t.series[1] }, itemStyle: { color: t.series[1] }, data: points.map((p) => Math.round(p.fleetMw / 100) / 10) },
      ],
    });
  }, [points]);
  const csv = (): CsvData | undefined =>
    points && { filename: `fleet_vs_revenue_${sel.location}_${sel.duration}h_deg${sel.deg}.csv`, headers: ['month', 'revenue_usd_per_kw', 'ercot_battery_fleet_mw'], rows: points.map((p) => [p.month, Math.round(p.revenue * 1e4) / 1e4, p.fleetMw]) };
  return (
    <Card
      title="Revenue and the battery fleet"
      subtitle={`Bars: monthly arbitrage revenue, ${locFull(sel.location)}, ${sel.duration}h, $${sel.deg}/MWh degradation. Line: batteries installed in ERCOT at month end.`}
      csv={csv}
      footer={
        <Stack gap={4} mt="sm">
          {sentence && <Text size="sm">{sentence}</Text>}
          {ctx.data && (
            <Text size="xs" c="dimmed">
              Fleet: {ctx.data.fleet.source}, {ctx.data.fleet.filter}; as of {ctx.data.fleet.as_of}. {ctx.data.fleet.note}
              {partial ? ' The latest year is year to date.' : ''}
            </Text>
          )}
        </Stack>
      }
    >
      {() => {
        if (error || ctx.error) return <Alert color="red" title="Could not load the fleet series">{error ?? ctx.error}</Alert>;
        return build ? <Chart build={build} height={320} label="Monthly revenue bars with the installed ERCOT battery fleet as a line" /> : <ChartSkeleton h={320} variant="bars" />;
      }}
    </Card>
  );
}

/** "Context" section at the bottom of Revenue: why revenue might move, stated as descriptions only. */
export function ContextSection() {
  return (
    <Stack gap="md" component="section" aria-label="Context">
      <div>
        <Text component="h2" fw={650} size="lg" c="bright" m={0}>Context</Text>
        <Text size="sm" c="dimmed" maw={760} lh={1.5}>
          Public data beside the results, to help read them. Nothing here changes the model, and the series moving together does not show that one caused another.
          The <Anchor size="sm" href="#/map">Map</Anchor> has a planned-storage layer, <Anchor size="sm" href="#/dispatch">Dispatch</Anchor> can overlay solar and wind share on the heatmap,
          and the ten best days list shows the weather on each.
        </Text>
      </div>
      <FleetRevenueCard />
    </Stack>
  );
}
