import { createContext, useContext, useState, type ReactNode } from 'react';
import { ActionIcon, Group, Modal, Paper, Text, Tooltip } from '@mantine/core';
import { IconDownload, IconExpand } from './Icons';
import { Info } from './Info';
import { downloadCsv } from '../data/format';
import theme from '../theme.module.css';

/** Card titles are h3 under a section's h2. Pages that go straight from the h1 to their cards provide 2, so no level is skipped. */
export const CardHeadingLevel = createContext<2 | 3>(3);

export interface CsvData {
  filename: string;
  headers: string[];
  rows: (string | number | null)[][];
}

interface Props {
  title: string;
  subtitle?: string;
  /** Glossary key(s) for jargon used in the title or subtitle; shows an info icon beside the title. */
  terms?: string | string[];
  /** Build the CSV lazily; return undefined while data is still loading. */
  csv?: () => CsvData | undefined;
  /** Receives `expanded` so charts can use a taller height in the modal. */
  children: (expanded: boolean) => ReactNode;
  footer?: ReactNode;
}

export function Card({ title, subtitle, terms, csv, children, footer }: Props) {
  const [open, setOpen] = useState(false);
  const level = useContext(CardHeadingLevel);
  const head = (
    <Group justify="space-between" align="flex-start" wrap="nowrap" mb="md" gap="xs">
      <div style={{ minWidth: 0 }}>
        <Group gap={4} wrap="nowrap" align="center">
          <Text component={level === 2 ? 'h2' : 'h3'} fw={620} size="md" lh={1.3} c="bright" m={0}>{title}</Text>
          {terms && <Info terms={terms} />}
        </Group>
        {subtitle && <Text size="sm" c="dimmed" lh={1.45} mt={2}>{subtitle}</Text>}
      </div>
      <Group gap={2} wrap="nowrap" mt={-6} mr={-8}>
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
      <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label={title} data-interactive>
        {head}
        {children(false)}
        {footer}
      </Paper>
      {/* Composed from Modal.Root so the header can drop its implicit banner role: a dialog has no page banner. */}
      <Modal.Root opened={open} onClose={() => setOpen(false)} size="90vw" centered padding="lg" radius="lg" transitionProps={{ transition: 'pop', duration: 220 }}>
        <Modal.Overlay backgroundOpacity={0.35} blur={6} />
        <Modal.Content className={theme.modalContent}>
          <Modal.Header role="presentation" className={theme.modalHeader}>
            <Modal.Title className={theme.modalTitle}><Group gap={4} wrap="nowrap">{title}{terms && <Info terms={terms} />}</Group></Modal.Title>
            <Modal.CloseButton aria-label="Close" />
          </Modal.Header>
          <Modal.Body>
            {subtitle && <Text size="sm" c="dimmed" mb="md">{subtitle}</Text>}
            {open && children(true)}
            {open && footer}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
