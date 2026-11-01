import type { ReactNode } from 'react';
import { Alert, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { Kpi } from '../components/Kpi';
import { DataQuality } from '../components/DataQuality';
import { CumulativeCard, DurationCard, HeatmapCard, MonthlyRevenueCard } from '../components/cards';
import { useApp } from '../state';
import { useSelectedRun } from '../hooks';
import { fmtDate, num, pct, usd } from '../data/format';
import { topDay } from '../data/analytics';
import { heroFor, ledeFor } from '../data/hero';

export function KpiRow() {
  const { run } = useSelectedRun();
  const m = run?.metrics;
  const ann = !!m?.annualized;
  const t = run ? topDay(run) : null;
  return (
    <SimpleGrid cols={{ base: 2, lg: 4 }} spacing={{ base: 'sm', sm: 'lg' }}>
      <Kpi
        label="Revenue" unit="$/kW-yr" value={m ? usd(m.revenue_per_kw_year, 1) : undefined}
        badge={ann ? 'Annualized YTD' : undefined}
        hint={m && (ann
          ? `Actual ${usd(m.revenue_per_kw_period, 1)}/kW over ${m.days_covered} days (${fmtDate(run!.meta.first_day)} to ${fmtDate(run!.meta.last_day)}), scaled to 365 days.`
          : `Full ${run!.meta.year}, ${m.days_covered} days, net of degradation cost.`)}
      />
      <Kpi
        label="Top-10-day share" value={m ? pct(m.top10_day_share, 1) : undefined}
        hint={t ? `Best day: ${fmtDate(t.date)}, ${pct(t.share, 1)} of ${ann ? 'YTD' : 'annual'} revenue.` : undefined}
      />
      <Kpi
        label="Cycles" unit="/yr" value={m ? num(m.cycles_per_year) : undefined}
        badge={ann ? 'Annualized YTD' : undefined}
        hint="Full-capacity equivalents: energy discharged divided by energy capacity."
      />
      <Kpi
        label="Spread captured" unit="$/MWh" value={m ? usd(m.avg_spread_captured, 0) : undefined}
        hint={m ? `Sells at ${usd(m.avg_discharge_price, 0)}, buys at ${usd(m.avg_charge_price, 0)} on average.` : undefined}
      />
    </SimpleGrid>
  );
}

/**
 * Page header. With `hero`, the page name becomes a small eyebrow and the headline finding
 * for the current selection leads the page as one display-size sentence.
 */
export function PageHeader({ title, hero = false, children }: { title: string; hero?: boolean; children?: ReactNode }) {
  if (!hero) {
    return (
      <Stack gap="sm" mb="xs" pt={{ base: 'xs', md: 'md' }}>
        <Title order={1} fz={{ base: 32, md: 40 }}>{title}</Title>
        {children}
      </Stack>
    );
  }
  return (
    <Stack gap={10} mb="xs" pt={{ base: 'xs', md: 'md' }}>
      <Title order={1} fz="sm" fw={600} c="var(--app-accent-text)" style={{ letterSpacing: '0.01em' }}>{title}</Title>
      <HeroSentence />
      {children}
    </Stack>
  );
}

function HeroSentence() {
  const { page, index } = useApp();
  const { sel, run } = useSelectedRun();
  const hero = heroFor(page, run, sel, index);
  const lede = ledeFor(run, page);
  return (
    <>
      {hero ? (
        <Text
          key={hero.plain} className="app-fade" component="p" m={0} maw={920} c="bright"
          fz={{ base: 26, sm: 32, md: 38 }} fw={640} lh={1.12} style={{ letterSpacing: '-0.026em', textWrap: 'balance' }}
        >
          {hero.parts.map((p, i) => (typeof p === 'string' ? p : <span key={i} className="tnum" style={{ color: 'var(--app-accent-text)' }}>{p.em}</span>))}
        </Text>
      ) : (
        <Stack gap={10} maw={760} aria-hidden><Skeleton h={34} radius="sm" /><Skeleton h={34} w="62%" radius="sm" /></Stack>
      )}
      {lede ? (
        <Text key={lede} className="app-fade" size="lg" c="dimmed" maw={760} lh={1.5}>{lede}</Text>
      ) : (
        <Skeleton h={22} w="48%" radius="sm" aria-hidden />
      )}
    </>
  );
}

export function RunStatus() {
  const { run, error, missing } = useSelectedRun();
  if (missing) return <Alert color="red" title="No result for this combination" />;
  if (error) return <Alert color="red" title="Could not load results">{error}</Alert>;
  return <DataQuality run={run} />;
}

export default function Overview() {
  const { run } = useSelectedRun();
  const { sel, index } = useApp();
  return (
    <Stack gap="lg">
      <PageHeader title="Overview" hero />
      <RunStatus />
      <KpiRow />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <MonthlyRevenueCard run={run} />
        <CumulativeCard run={run} />
        <HeatmapCard run={run} />
        <DurationCard sel={sel} index={index} />
      </SimpleGrid>
    </Stack>
  );
}
