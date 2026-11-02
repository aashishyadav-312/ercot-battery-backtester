import { Group, Paper, Stack, Table, Text, useComputedColorScheme } from '@mantine/core';
import { QUEUE_CLASSES, queueSwatch } from './scale';
import type { ContextFile } from '../../data/context';
import { num } from '../../data/format';

/** Legend for the planned-storage county shading: five equal-count classes of queued MW. */
export function QueueLegend({ breaks, queue }: { breaks: number[]; queue: ContextFile['queue'] }) {
  const mode = useComputedColorScheme('light');
  const label = (i: number) =>
    i === 0 ? `< ${num(breaks[0])} MW` : i === breaks.length ? `≥ ${num(breaks[i - 1])} MW` : `${num(breaks[i - 1])}–${num(breaks[i])} MW`;
  return (
    <Stack gap={6} mt="sm" role="group" aria-label="Planned storage legend">
      <Text size="xs" c="dimmed" fw={560}>
        County shade: battery MW in ERCOT’s interconnection queue, {QUEUE_CLASSES} equal-count classes of the {Object.keys(queue.counties).length} counties that have any. Unshaded = none queued.
      </Text>
      <Group gap={4} wrap="wrap">
        {Array.from({ length: QUEUE_CLASSES }, (_, i) => (
          <Stack key={i} gap={2} align="center" w={96}>
            <div style={{ width: 96, height: 10, borderRadius: 3, background: queueSwatch(i, mode), border: '1px solid var(--mantine-color-default-border)' }} aria-hidden="true" />
            <Text size="xs" c="dimmed" className="tnum" style={{ whiteSpace: 'nowrap' }}>{label(i)}</Text>
          </Stack>
        ))}
      </Group>
    </Stack>
  );
}

/** The largest counties as a table (the keyboard and screen-reader equivalent of the shading), with the source and its limits. */
export function QueuePanel({ queue }: { queue: ContextFile['queue'] }) {
  const top = Object.entries(queue.counties).slice(0, 12);
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="Planned storage by county">
      <Text component="h3" fw={620} size="md" c="bright" m={0} mb={2}>Planned storage by county</Text>
      <Text size="sm" c="dimmed" mb="sm">
        {num(queue.total_mw)} MW across {num(queue.total_projects)} battery projects in the queue ({queue.published}). The twelve largest counties:
      </Text>
      <Table.ScrollContainer minWidth={480}>
        <Table verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>County</Table.Th><Table.Th ta="right">Queued MW</Table.Th><Table.Th ta="right">Projects</Table.Th><Table.Th ta="right">MW with signed agreement</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {top.map(([name, c]) => (
              <Table.Tr key={name}>
                <Table.Td>{name}</Table.Td>
                <Table.Td ta="right" className="tnum">{num(c.mw)}</Table.Td>
                <Table.Td ta="right" className="tnum">{c.projects}</Table.Td>
                <Table.Td ta="right" className="tnum">{num(c.mw_ia_signed)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" mt="sm" lh={1.6}>
        Source: {queue.source}. {queue.note}
      </Text>
    </Paper>
  );
}
