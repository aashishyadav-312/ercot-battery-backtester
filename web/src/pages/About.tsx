import { Anchor, Button, Group, List, Stack, Text } from '@mantine/core';
import { PageHeader } from './Overview';
import { Section } from './Method';
import { SITE } from '../data/site';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

export default function About() {
  return (
    <Stack gap="lg" maw={880}>
      <PageHeader title="About">
        <Text size="lg" c="dimmed" maw={680} lh={1.5}>
          Who built this, what it is based on, and how to tell me when something looks wrong.
        </Text>
      </PageHeader>

      <Section title="Author">
        <Text size="sm">
          Built by <b>{SITE.author}</b>, {SITE.role}. This is an independent project, not affiliated with ERCOT or any company.
        </Text>
        <Group gap="xs">
          <Button component="a" href={SITE.linkedin} {...ext} variant="light" size="xs">LinkedIn</Button>
          <Button component="a" href={`mailto:${SITE.email}`} variant="light" size="xs">{SITE.email}</Button>
          <Button component="a" href={SITE.repo} {...ext} variant="light" size="xs">Source code on GitHub</Button>
        </Group>
      </Section>

      <Section title="Data sources">
        <List size="sm" spacing={6}>
          <List.Item>
            <b>ERCOT public data.</b> Real-time 15-minute settlement point prices and day-ahead hourly prices for five hubs and five resource
            nodes, from ERCOT&rsquo;s public archives and public API (reports NP6-905-CD and NP4-190-CD). ERCOT publishes these for public use;
            this site is not endorsed by ERCOT.
          </List.Item>
          <List.Item>
            <b>Open-source tools.</b> Data access with gridstatus, optimization with PuLP and the HiGHS solver, and the site with React, Mantine and
            Apache ECharts.
          </List.Item>
          <List.Item>
            <b>Published benchmarks</b> used for the sanity check on the <Anchor size="sm" href="#/method">Method</Anchor> page are cited there.
          </List.Item>
        </List>
      </Section>

      <Section title="License">
        <Text size="sm">
          The code and the computed results in this repository are released under the MIT License (see the{' '}
          <Anchor size="sm" href={`${SITE.repo}/blob/main/LICENSE`} {...ext}>LICENSE file</Anchor>). The underlying ERCOT prices remain ERCOT&rsquo;s
          public data and are not relicensed here. Please credit &ldquo;ERCOT Battery Backtester&rdquo; if you reuse a chart or number.
        </Text>
      </Section>

      <Section title="Report an issue or suggest something">
        <Text size="sm">
          Found a wrong number, a confusing label, or want another location or feature? Open an issue on GitHub:{' '}
          <Anchor size="sm" href={SITE.issues} {...ext}>report an issue</Anchor>. For anything else, email{' '}
          <Anchor size="sm" href={`mailto:${SITE.email}`}>{SITE.email}</Anchor>.
        </Text>
      </Section>

      <Section title="Privacy">
        <Text size="sm">
          Page views are counted with GoatCounter, a privacy-friendly service that sets no cookies and stores no personal data. Your colour-scheme
          choice is saved in your browser only.
        </Text>
      </Section>
    </Stack>
  );
}
