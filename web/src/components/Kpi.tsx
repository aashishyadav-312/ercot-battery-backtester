import type { ReactNode } from 'react';
import { Badge, Group, Paper, Skeleton, Text } from '@mantine/core';

interface Props {
  label: string;
  value?: string;
  unit?: string;
  hint?: ReactNode;
  badge?: string;
  loading?: boolean;
}

export function Kpi({ label, value, unit, hint, badge, loading }: Props) {
  return (
    <Paper withBorder p={{ base: 'sm', sm: 'md' }} radius="md">
      <Group justify="space-between" gap={6} wrap="nowrap" mb={6}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: '.04em' }}>{label}</Text>
        {badge && <Badge size="xs" variant="light" color="orange" style={{ flexShrink: 0 }}>{badge}</Badge>}
      </Group>
      {loading || value == null ? (
        <Skeleton h={32} w="60%" />
      ) : (
        <Text fz={{ base: 22, sm: 28 }} fw={650} lh={1.1} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {value}
          {unit && <Text span fz="sm" c="dimmed" fw={500} ml={4}>{unit}</Text>}
        </Text>
      )}
      <Text size="xs" c="dimmed" mt={6} lh={1.35} mih={32}>{hint}</Text>
    </Paper>
  );
}
