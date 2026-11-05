import { Paper, Stack, Title } from '@mantine/core';

/** A titled card used by the Method, Learn and V4 Method pages. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section">
      <Title order={2} fz={20} mb="sm" style={{ letterSpacing: '-0.014em' }}>{title}</Title>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}
