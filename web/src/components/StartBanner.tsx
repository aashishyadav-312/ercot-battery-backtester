import { useState } from 'react';
import { Alert, Anchor, Button, CloseButton, Group, Text } from '@mantine/core';
import { useApp } from '../state';

const KEY = 'ebb-start-seen';

function wasSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false; // storage blocked: show the banner, it just will not be remembered
  }
}

/** Remember that this visitor has seen (or dismissed) the Start-here banner. Safe when storage is unavailable. */
export function markStartSeen() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/** One-time banner on Overview pointing first-time visitors to the Start-here page. Dismissal is remembered in localStorage. */
export function StartBanner() {
  const { go } = useApp();
  const [open, setOpen] = useState(() => !wasSeen());
  if (!open) return null;
  const dismiss = () => { markStartSeen(); setOpen(false); };
  return (
    <Alert
      color="accent" role="region" aria-label="New here?" radius="lg" p={{ base: 'sm', sm: 'md' }}
      style={{ background: 'color-mix(in srgb, var(--mantine-primary-color-filled) 8%, var(--mantine-color-body))' }}
    >
      <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Text fw={620} c="bright" size="md" lh={1.35}>New to ERCOT or to batteries?</Text>
          <Text size="sm" c="dimmed" lh={1.5}>
            A short guide explains the market, walks through one real day of a battery trading, and shows how to read each page.{' '}
            <Anchor
              href="#/start" fw={600} size="sm"
              onClick={(e) => { e.preventDefault(); markStartSeen(); go('start'); }}
            >
              Start here {'→'}
            </Anchor>
          </Text>
        </div>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button variant="subtle" color="gray" size="compact-sm" onClick={dismiss} visibleFrom="sm">Not now</Button>
          <CloseButton aria-label="Dismiss this message" onClick={dismiss} hiddenFrom="sm" />
        </Group>
      </Group>
    </Alert>
  );
}
