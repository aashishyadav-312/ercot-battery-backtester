import type { ReactNode } from 'react';
import { Badge, Group, Paper, Skeleton, Text } from '@mantine/core';

interface Props {
  label: string;
  value?: string;
  unit?: string;
  hint?: ReactNode;
  badge?: string;
}

/** One figure: small label, large tabular number with a quiet unit, one line of context. */
export function Kpi({ label, value, unit, hint, badge }: Props) {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} data-interactive>
      <Group justify="space-between" gap={6} wrap="nowrap" mb={10} mih={20}>
        <Text size="xs" c="dimmed" fw={560} tt="uppercase" style={{ letterSpacing: '.06em' }}>{label}</Text>
        {badge && <Badge size="sm" variant="dot" color="yellow" style={{ flexShrink: 0 }}>{badge}</Badge>}
      </Group>
      {value == null ? (
        <Skeleton h={34} w="55%" radius="sm" />
      ) : (
        <Text key={value} className="app-fade tnum" fz={{ base: 26, sm: 32 }} fw={640} lh={1.05} c="bright" style={{ letterSpacing: '-0.025em' }}>
          {value}
          {unit && <Text span fz="sm" c="dimmed" fw={500} ml={5} style={{ letterSpacing: 0, fontVariantNumeric: 'normal' }}>{unit}</Text>}
        </Text>
      )}
      <Text size="xs" c="dimmed" mt={10} lh={1.45} mih={34}>{hint}</Text>
    </Paper>
  );
}
