import { Anchor, Divider, Text } from '@mantine/core';
import { useApp } from '../state';
import { SITE } from '../data/site';

/** Footer on every page: who built this, the not-affiliated notice, sources, and where to report problems. */
export function SiteFooter() {
  const { go } = useApp();
  return (
    <footer>
      <Divider mt={48} mb="md" />
      <Text size="xs" c="dimmed" lh={1.6} maw={820}>
        Built by <b>{SITE.author}</b>, {SITE.role}.{' '}
        <Anchor size="xs" href={SITE.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</Anchor> ·{' '}
        <Anchor size="xs" href={`mailto:${SITE.email}`}>{SITE.email}</Anchor> ·{' '}
        <Anchor size="xs" href={SITE.issues} target="_blank" rel="noopener noreferrer">Report an issue</Anchor> ·{' '}
        <Anchor size="xs" component="button" onClick={() => go('about')}>About</Anchor>
      </Text>
      <Text size="xs" c="dimmed" lh={1.6} maw={820} mt={4} pb="lg">
        An independent project, not affiliated with ERCOT or any company. Prices are ERCOT public data. Results are illustrative models,
        not a forecast or investment advice.
      </Text>
    </footer>
  );
}
