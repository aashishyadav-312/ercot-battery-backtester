// The Learn sub-pages after Basics (pages/Guide.tsx): Site guide, Limits, Glossary and About.
import type { ReactNode } from 'react';
import { Anchor, Button, Group, List, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { PageHeader } from './RunHeader';
import { Section } from '../components/Section';
import { buildHash, useApp } from '../state';
import type { Page } from '../shell/route';
import { glossaryEntries, SITE } from '../data/site';
import { START_DEFAULTS } from '../data/start';
import { TERMS } from '../copy/terms';
import { requestTour } from '../components/tour/steps';
import { requestSupport } from '../support/api';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

const Lede = ({ children }: { children: ReactNode }) => <Text size="lg" c="dimmed" maw={700} lh={1.5}>{children}</Text>;

// ------------------------------------------------------------ Site guide

interface SiteCard { page: Page; title: string; answers: string; alt: string }

/** One card per page. The pictures in public/images/site-guide/ come from `npm run site-guide-images`, so they follow the UI. */
export const SITE_CARDS: SiteCard[] = [
  { page: 'home', title: 'Home', answers: 'What could a battery have earned in ERCOT? The headline answer, the latest prices and a short tour.', alt: 'The top of Home: the headline answer and a map of Texas.' },
  { page: 'atlas', title: 'Atlas', answers: 'Where in Texas did the money come from? Every node with complete prices, on a map and in a table.', alt: 'The top of Atlas: a map of Texas with nodes coloured by revenue.' },
  { page: 'studio', title: 'Studio', answers: 'What would your own battery earn? Choose a size, a place and dates, and it runs on real prices in your browser.', alt: 'The top of Studio: the battery settings and a preset run.' },
  { page: 'research', title: 'Research', answers: 'What did the backtest find, and can it be trusted? The findings, and the pages behind them.', alt: 'The top of Research: the list of findings.' },
];

/** The sub-tabs of Research and Atlas, one line each. */
export const SUB_TABS: { group: string; items: { label: string; page: Page; line: string }[] }[] = [
  {
    group: 'Research',
    items: [
      { label: 'Findings', page: 'research', line: 'The main results, one at a time.' },
      { label: 'Revenue', page: 'revenue', line: 'Revenue for the battery chosen in the top bar, and when it came in.' },
      { label: 'Charging pattern', page: 'dispatch', line: 'When in the day the battery charges and discharges.' },
      { label: 'Reality check', page: 'realism', line: `How much of the ${TERMS.perfectForesight.label.toLowerCase()} revenue the ${TERMS.dayAheadPlan.label.toLowerCase()} keeps.` },
      { label: 'Method', page: 'method', line: 'The assumptions in plain words, and a check against real fleet revenue.' },
    ],
  },
  {
    group: 'Atlas',
    items: [
      { label: 'All nodes', page: 'atlas', line: 'Every node with complete prices, on a map and in a table.' },
      { label: 'Study sites', page: 'map', line: 'The hubs and nodes with a full run for every year and battery length.' },
    ],
  },
];

function SiteCardView({ card }: { card: SiteCard }) {
  const { go } = useApp();
  const open = () => go(card.page, START_DEFAULTS);
  const href = buildHash(card.page, START_DEFAULTS);
  return (
    <Paper withBorder component="article" p={0} style={{ overflow: 'hidden' }}>
      <a href={href} tabIndex={-1} aria-hidden onClick={(e) => { e.preventDefault(); open(); }} style={{ display: 'block', borderBottom: '1px solid var(--app-hairline)', background: 'var(--app-canvas)' }}>
        <img src={`${import.meta.env.BASE_URL}images/site-guide/${card.page}.webp`} alt={card.alt} width={640} height={400} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
      </a>
      <Stack gap={8} p={{ base: 'md', sm: 'lg' }}>
        <Title order={3} fz={20} style={{ letterSpacing: '-0.014em' }}>{card.title}</Title>
        <Text size="sm" c="dimmed" lh={1.5}>{card.answers}</Text>
        <Anchor href={href} fw={600} size="sm" mt={4} onClick={(e) => { e.preventDefault(); open(); }}>Open {card.title} {'→'}</Anchor>
      </Stack>
    </Paper>
  );
}

export function SiteGuide() {
  const { go } = useApp();
  return (
    <Stack gap="xl" maw={1040}>
      <PageHeader title="Site guide">
        <Lede>Each page answers one question. Links open the page for a 2-hour battery at Houston Hub in 2025. On the run pages you can change the location, length, year and degradation cost in the bar at the top.</Lede>
      </PageHeader>
      <div><Button variant="default" size="md" onClick={requestTour}>Take the tour</Button></div>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        {SITE_CARDS.map((c) => <SiteCardView key={c.page} card={c} />)}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {SUB_TABS.map((g) => (
          <Section key={g.group} title={`Inside ${g.group}`}>
            <List size="sm" spacing={8} listStyleType="none">
              {g.items.map((i) => (
                <List.Item key={i.page}>
                  <Anchor component="button" type="button" size="sm" fw={600} onClick={() => go(i.page, START_DEFAULTS)}>{i.label}</Anchor>
                  {' '}<Text span size="sm" c="dimmed">{i.line}</Text>
                </List.Item>
              ))}
            </List>
          </Section>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

// ------------------------------------------------------------ Limits

/** The five points of Method's "What it leaves out", for a newcomer. */
export const LIMITS: { title: string; body: string }[] = [
  { title: 'Forecast error', body: 'Nobody knows tomorrow’s prices. The day-ahead plan uses day-ahead prices as its forecast, and a real forecast misses by more than that.' },
  { title: 'Ancillary services', body: 'Batteries are also paid to stand ready for the grid, not only to trade. The base results leave that income out. A separate screen on Findings adds it.' },
  { title: 'Grid and interconnection costs', body: 'Connecting to the grid costs money and takes time. Neither is counted, so every figure is revenue, not profit.' },
  { title: 'Battery wear', body: 'Real batteries lose capacity as they cycle. The model charges a flat degradation cost for each MWh discharged and keeps the battery at full capacity.' },
  { title: 'Market impact', body: 'The model assumes the battery does not move prices. A real fleet does, so this overstates what any one battery would see.' },
];

export function Limits() {
  const { go } = useApp();
  return (
    <Stack gap="lg" maw={880}>
      <PageHeader title="Limits">
        <Lede>
          The numbers here are a ceiling for one kind of income, not a forecast. {TERMS.perfectForesight.label} is an upper bound: {TERMS.perfectForesight.definition}
          {' '}These are the other gaps.
        </Lede>
      </PageHeader>
      <Stack gap="sm">
        {LIMITS.map((l) => (
          <Paper key={l.title} withBorder p={{ base: 'md', sm: 'lg' }}>
            <Title order={3} fz={17} mb={4} style={{ letterSpacing: '-0.01em' }}>{l.title}</Title>
            <Text size="md" c="dimmed" lh={1.55} maw={760}>{l.body}</Text>
          </Paper>
        ))}
      </Stack>
      <Text size="md" lh={1.55}>
        <Anchor href="#/research/method" onClick={(e) => { e.preventDefault(); go('method'); }} fw={600}>Read the full list on the Method page {'→'}</Anchor>
      </Text>
    </Stack>
  );
}

// ------------------------------------------------------------ Glossary

export function Glossary() {
  return (
    <Stack gap="lg" maw={1040}>
      <PageHeader title="Glossary">
        <Lede>Every term the site uses, in plain words, from A to Z. The info icons beside the numbers carry the same terms.</Lede>
      </PageHeader>
      <Paper withBorder p={{ base: 'md', sm: 'lg' }}>
        <SimpleGrid component="dl" cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="md" my={0}>
          {glossaryEntries().map((g) => (
            <div key={g.id} id={`term-${g.id}`}>
              <Text component="dt" size="sm" fw={620} c="bright">{g.term}</Text>
              <Text component="dd" size="sm" c="dimmed" ml={0} lh={1.5}>
                {g.definition}
                {g.source && <> <Anchor size="sm" href={g.source} {...ext}>{g.citation ?? 'Source'}</Anchor>, as of {g.asOf}.</>}
              </Text>
            </div>
          ))}
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}

// ------------------------------------------------------------ About

export function About() {
  const base = import.meta.env.BASE_URL;
  return (
    <Stack gap="lg" maw={880}>
      <PageHeader title="About" />
      <Group align="flex-start" gap="xl" wrap="wrap">
        <picture>
          <source srcSet={`${base}images/aashish-yadav.webp`} type="image/webp" />
          <img
            src={`${base}images/aashish-yadav.jpg`} alt="Aashish Yadav" width={160} height={200} loading="lazy"
            style={{ display: 'block', width: 160, height: 200, objectFit: 'cover', borderRadius: 20 }}
          />
        </picture>
        <Stack gap="sm" style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Text size="md" lh={1.6}>
            <b>{SITE.author}</b> is a final-year graduate student at Duke University studying energy economics and policy. His work and coursework focus on getting power onto the grid faster: utilities, independent power producers, project development and the grid itself.
          </Text>
          <Text size="md" lh={1.6}>
            Chargeline is an experiment he built for fun over Halloween 2026. It is an independent project, not affiliated with ERCOT or any company. Suggestions are welcome.
          </Text>
          <Group gap="xs" mt={4}>
            <Button component="a" href={SITE.linkedin} {...ext} variant="light" size="sm">LinkedIn</Button>
            <Button component="a" href={`mailto:${SITE.email}`} variant="light" size="sm">{SITE.email}</Button>
          </Group>
          <Text size="md" lh={1.6} mt="xs">
            Chargeline is free, with no ads and no sign-up. If it helped you, you can chip in toward what it cost to build.
          </Text>
          <Group gap="xs">
            <Button variant="light" size="sm" onClick={requestSupport}>Support</Button>
          </Group>
        </Stack>
      </Group>

      <Section title="Data sources">
        <List size="sm" spacing={6}>
          <List.Item>
            <b>ERCOT public data.</b> Real-time 15-minute settlement point prices and day-ahead hourly prices for five hubs and the resource
            nodes, from ERCOT&rsquo;s public archives and public API (reports NP6-905-CD and NP4-190-CD). ERCOT publishes these for public use;
            this site is not endorsed by ERCOT.
          </List.Item>
          <List.Item>
            <b>Open-source tools.</b> Data access with gridstatus, optimization with PuLP and the HiGHS solver, and the site with React, Mantine and
            Apache ECharts.
          </List.Item>
          <List.Item>
            <b>Published benchmarks</b> used for the check on the <Anchor size="sm" href="#/research/method">Method</Anchor> page are cited there.
          </List.Item>
        </List>
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
