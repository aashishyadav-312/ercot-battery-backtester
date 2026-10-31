import { SimpleGrid, Stack } from '@mantine/core';
import { CapturePricesCard, HeatmapCard, TypicalDayCard } from '../components/cards';
import { useSelectedRun } from '../hooks';
import { KpiRow, PageHeader, RunStatus } from './Overview';

export default function Dispatch() {
  const { run } = useSelectedRun();
  return (
    <Stack gap="lg">
      <PageHeader title="Dispatch" hero />
      <RunStatus />
      <KpiRow />
      <HeatmapCard run={run} />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <TypicalDayCard run={run} />
        <CapturePricesCard run={run} />
      </SimpleGrid>
    </Stack>
  );
}
