import { Grid, SimpleGrid, Stack } from '@mantine/core';
import { CumulativeCard, DailyRevenueCard, MonthlyRevenueCard, TopDaysCard } from '../components/cards';
import { useSelectedRun } from '../hooks';
import { KpiRow, PageHeader, RunStatus } from './Overview';

export default function Revenue() {
  const { run } = useSelectedRun();
  return (
    <Stack gap="md">
      <PageHeader title="Revenue" />
      <RunStatus />
      <KpiRow />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <MonthlyRevenueCard run={run} />
        <CumulativeCard run={run} />
      </SimpleGrid>
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 8 }}><DailyRevenueCard run={run} /></Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}><TopDaysCard run={run} /></Grid.Col>
      </Grid>
    </Stack>
  );
}
