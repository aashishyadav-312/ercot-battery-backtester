import { useState, type ReactNode } from 'react';
import { ActionIcon, Group, Modal, Paper, Text, Tooltip } from '@mantine/core';
import { IconDownload, IconExpand } from './Icons';
import { downloadCsv } from '../data/format';

export interface CsvData {
  filename: string;
  headers: string[];
  rows: (string | number | null)[][];
}

interface Props {
  title: string;
  subtitle?: string;
  /** Build the CSV lazily; return undefined while data is still loading. */
  csv?: () => CsvData | undefined;
  /** Receives `expanded` so charts can use a taller height in the modal. */
  children: (expanded: boolean) => ReactNode;
  footer?: ReactNode;
}

export function Card({ title, subtitle, csv, children, footer }: Props) {
  const [open, setOpen] = useState(false);
  const head = (
    <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs" gap="xs">
      <div style={{ minWidth: 0 }}>
        <Text fw={600} size="sm" lh={1.3}>{title}</Text>
        {subtitle && <Text size="xs" c="dimmed" lh={1.35}>{subtitle}</Text>}
      </div>
      <Group gap={2} wrap="nowrap">
        <Tooltip label="Download CSV">
          <ActionIcon
            variant="subtle" color="gray" size="lg" aria-label={`Download ${title} as CSV`}
            onClick={() => { const d = csv?.(); if (d) downloadCsv(d.filename, d.headers, d.rows); }}
            disabled={!csv}
          >
            <IconDownload />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Expand">
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`Expand ${title}`} onClick={() => setOpen(true)}>
            <IconExpand />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
  return (
    <>
      <Paper withBorder p="md" radius="md" component="section" aria-label={title}>
        {head}
        {children(false)}
        {footer}
      </Paper>
      <Modal opened={open} onClose={() => setOpen(false)} size="90vw" centered title={title} padding="lg">
        {subtitle && <Text size="sm" c="dimmed" mb="sm">{subtitle}</Text>}
        {open && children(true)}
        {open && footer}
      </Modal>
    </>
  );
}
