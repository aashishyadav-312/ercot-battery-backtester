import { Alert, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Kpi } from '../components/Kpi';
import { DataQuality } from '../components/DataQuality';
import { CumulativeCard, DurationCard, HeatmapCard, MonthlyRevenueCard } from '../components/cards';
import { useApp } from '../state';
import { useSelectedRun } from '../hooks';
import { fmtDate, num, pct, usd, yearLabel } from '../data/format';
import { topDay } from '../data/analytics';

export function KpiRow() {
  const { row, run, loading } = useSelectedRun();
  const m = run?.metrics;
  const ann = !!row?.annualized;
  const t = run ? topDay(run) : null;
  return (
    <SimpleGrid cols={{ base: 2, lg: 4 }} spacing={{ base: 'xs', sm: 'md' }}>
      <Kpi
        label="Revenue" unit="$/kW-yr" loading={loading} value={m ? usd(m.revenue_per_kw_year, 1) : undefined}
        badge={ann ? 'Annualized YTD' : undefined}
        hint={m && (ann
          ? `Actual ${usd(m.revenue_per_kw_period, 1)}/kW over ${m.days_covered} days (${fmtDate(run!.meta.first_day)} to ${fmtDate(run!.meta.last_day)}), scaled to 365 days.`
          : `Full ${row!.year}, ${m.days_covered} days, net of degradation cost.`)}
      />
      <Kpi
        label="Top-10-day share" loading={loading} value={m ? pct(m.top10_day_share, 1) : undefined}
        hint={t ? `Best day: ${fmtDate(t.date)}, ${pct(t.share, 1)} of ${ann ? 'YTD' : 'annual'} revenue.` : undefined}
      />
      <Kpi
        label="Cycles" unit="/yr" loading={loading} value={m ? num(m.cycles_per_year) : undefined}
        badge={ann ? 'Annualized YTD' : undefined}
        hint="Full-capacity equivalents: energy discharged divided by energy capacity."
      />
      <Kpi
        label="Spread captured" unit="$/MWh" loading={loading} value={m ? usd(m.avg_spread_captured, 0) : undefined}
        hint={m ? `Sells at ${usd(m.avg_discharge_price, 0)}, buys at ${usd(m.avg_charge_price, 0)} on average.` : undefined}
      />
    </SimpleGrid>
  );
}

export function Headline() {
  const { row, run } = useSelectedRun();
  const { sel } = useApp();
  if (!row || !run) return <Text c="dimmed" mih={48}>Loading results…</Text>;
  return (
    <Text size="lg" maw={760} lh={1.45}>
      A <b>{row.duration_h}-hour</b> battery at <b>{row.location}</b> would have earned{' '}
      <b>{usd(row.revenue_per_kw_year, 1)}/kW{row.annualized ? '-yr (annualized)' : ''}</b> in <b>{yearLabel(sel.year)}</b> arbitraging real-time
      prices with perfect foresight. The ten best days supplied {pct(row.top10_day_share, 0)} of it.
    </Text>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Stack gap={6} mb="md">
      <Title order={2} fz={26}>{title}</Title>
      {children}
    </Stack>
  );
}

export function RunStatus() {
  const { run, error, missing, loading } = useSelectedRun();
  if (missing) return <Alert color="red" title="No result for this combination" />;
  if (error) return <Alert color="red" title="Could not load results">{error}</Alert>;
  return <DataQuality run={loading ? undefined : run} />;
}

export default function Overview() {
  const { run } = useSelectedRun();
  const { sel, index } = useApp();
  return (
    <Stack gap="md">
      <PageHeader title="Overview"><Headline /></PageHeader>
      <RunStatus />
      <KpiRow />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <MonthlyRevenueCard run={run} />
        <CumulativeCard run={run} />
        <HeatmapCard run={run} />
        <DurationCard sel={sel} index={index} />
      </SimpleGrid>
    </Stack>
  );
}
