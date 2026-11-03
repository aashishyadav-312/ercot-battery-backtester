import { Grid, SimpleGrid, Stack } from '@mantine/core';
import { CumulativeCard, DailyRevenueCard, DurationCard, MonthlyRevenueCard, TopDaysCard } from '../components/cards';
import { useSelectedRun } from '../hooks';
import { useApp } from '../state';
import { Ancillary } from '../components/Ancillary';
import { ContextSection } from '../components/ContextSection';
import { StartBanner } from '../components/StartBanner';
import { KpiRow, PageHeader, RunStatus } from './RunHeader';

/** One run's revenue. Absorbed Run overview in polish step 4 (`#/research/overview` opens this page). */
export default function Revenue() {
  const { run } = useSelectedRun();
  const { sel, index } = useApp();
  return (
    <Stack gap="lg">
      <StartBanner />
      <PageHeader title="Revenue" hero />
      <RunStatus />
      <KpiRow />
      <Ancillary />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <MonthlyRevenueCard run={run} />
        <DurationCard sel={sel} index={index} />
      </SimpleGrid>
      <CumulativeCard run={run} />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 8 }}><DailyRevenueCard run={run} /></Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}><TopDaysCard run={run} /></Grid.Col>
      </Grid>
      <ContextSection />
    </Stack>
  );
}
