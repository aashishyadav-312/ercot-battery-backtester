import { SimpleGrid, Stack } from '@mantine/core';
import { DurationCard, LocationsCard, NodeHubCard } from '../components/cards';
import { useApp } from '../state';
import { PageHeader, RunStatus } from './Overview';

export default function Compare() {
  const { sel, index, nodes } = useApp();
  return (
    <Stack gap="md">
      <PageHeader title="Compare" />
      <RunStatus />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <DurationCard sel={sel} index={index} />
        <NodeHubCard sel={sel} index={index} nodes={nodes} />
      </SimpleGrid>
      <LocationsCard sel={sel} index={index} nodes={nodes} />
    </Stack>
  );
}
