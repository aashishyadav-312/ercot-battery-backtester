import { useEffect, type ReactNode } from 'react';
import { Anchor, Badge, Button, Group, List, Paper, SimpleGrid, Stack, Text, Title, useComputedColorScheme } from '@mantine/core';
import { PageHeader } from './Overview';
import { Section } from './Method';
import { Info } from '../components/Info';
import { Walkthrough } from '../components/start/Walkthrough';
import { DaRtDiagram, ErcotDiagram, LocationsDiagram, SpikeDiagram } from '../components/start/Diagrams';
import { buildHash, useApp } from '../state';
import { hashParam } from '../shell/route';
import { useWalkthrough } from '../hooks';
import { GLOSSARY, SITE, locName } from '../data/site';
import { GUIDE, LEFT_OUT, START_DEFAULTS, type GuideCard } from '../data/start';
import { fmtDate } from '../data/format';
import { markStartSeen } from '../components/StartBanner';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Sections of the page, in order. `#/learn?s=<id>` opens it at one (the footer's About link, and old #/about links). */
export const GUIDE_SECTIONS = [
  { id: 'ercot', label: 'ERCOT in 2 minutes' },
  { id: 'money', label: 'How a battery makes money' },
  { id: 'read', label: 'How to read this site' },
  { id: 'left-out', label: 'What the model leaves out' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'about', label: 'About this project' },
];

function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

function GuideSection({ id, n, title, lede, children }: { id: string; n: number; title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <Stack gap="md" component="section" aria-labelledby={id}>
      <Stack gap={4}>
        <Text size="sm" fw={600} c="var(--app-accent-text)" className="tnum">{n} of {GUIDE_SECTIONS.length}</Text>
        <Title order={2} id={id} fz={{ base: 24, sm: 30 }} tabIndex={-1} style={{ letterSpacing: '-0.02em', scrollMarginTop: 'calc(var(--app-header-h) + 16px)', outline: 'none' }}>
          {title}
        </Title>
        <Text size="md" c="dimmed" maw={720} lh={1.55}>{lede}</Text>
      </Stack>
      {children}
    </Stack>
  );
}

function Topic({ title, diagram, children }: { title: string; diagram: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="article">
      <Stack gap="sm" h="100%">
        <Title order={3} fz={20} style={{ letterSpacing: '-0.014em' }}>{title}</Title>
        <div style={{ margin: '4px 0' }}>{diagram}</div>
        <Stack gap={8}>{children}</Stack>
      </Stack>
    </Paper>
  );
}

const P = ({ children }: { children: ReactNode }) => <Text size="md" lh={1.6}>{children}</Text>;

function Ercot() {
  const { data } = useWalkthrough();
  const day = data?.days.find((d) => d.da_price);
  const where = data ? locName(data.meta.location) : 'Houston Hub';
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <Topic title="What ERCOT is" diagram={<ErcotDiagram />}>
        <P>ERCOT, the Electric Reliability Council of Texas, runs the grid that serves about 90% of Texas’s electricity use. It does not own power plants or wires. It keeps supply and demand in balance and runs the markets that decide who is paid what.</P>
        <P>The Texas grid has only limited links to its neighbours, so it cannot lean on other states when it runs short. That is a big reason its prices swing so much.</P>
      </Topic>
      <Topic title="Hubs, load zones and resource nodes" diagram={<LocationsDiagram />}>
        <P>Every ERCOT price belongs to a <b>settlement point</b>, a place on the grid where energy is bought or sold.</P>
        <P>
          A <b>resource node</b> <Info terms="resource_node" /> is where one plant or battery connects, and its price includes local grid congestion.
          A <b>load zone</b> <Info terms="load_zone" /> is a region whose customers pay one averaged price.
          A <b>hub</b> <Info terms="hub" /> is a regional average that nobody connects to, a smooth reference.
        </P>
        <P>The Atlas maps every resource node with complete prices, and the five hubs give the reference. A real battery is paid at its own node, so the hub figures are a reference and the nodes show what congestion adds.</P>
      </Topic>
      <Topic title="Day-ahead and real-time prices" diagram={<DaRtDiagram day={day} where={where} />}>
        <P>ERCOT runs two markets for the same electricity. The <b>day-ahead</b> market <Info terms="da" /> settles the day before and sets one price for each hour.</P>
        <P>The <b>real-time</b> market <Info terms="rt" /> settles as the day happens, with a price for every 15 minutes. It carries the surprises: a plant trips, the wind drops, a heat wave hits. Most numbers on this site use real-time prices.</P>
        {day && data && <Text size="xs" c="dimmed">Drawn from {where} on {fmtDate(day.date)}.</Text>}
      </Topic>
      <Topic title="Why prices spike" diagram={<SpikeDiagram />}>
        <P>Power plants are used cheapest first: wind, solar and nuclear, then gas, then the costliest units. Demand decides how far up that line the grid has to go.</P>
        <P>On a normal evening the last unit needed is cheap. On a hot, calm evening, when solar fades and wind is light, the grid reaches the steep end and the price can jump by thousands of dollars within minutes. ERCOT’s price cap was $5,000 per MWh in 2025. A battery that charged cheaply earlier sells into those minutes.</P>
      </Topic>
    </SimpleGrid>
  );
}

/** Every term the site uses, from the same file as the info icons, so the two cannot disagree. */
function Glossary() {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }}>
      <SimpleGrid component="dl" cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="md" my={0}>
        {Object.entries(GLOSSARY).map(([k, g]) => (
          <div key={k} id={`term-${k}`}>
            <Text component="dt" size="sm" fw={620} c="bright">{g.term}</Text>
            <Text component="dd" size="sm" c="dimmed" ml={0} lh={1.5}>{g.definition}</Text>
          </div>
        ))}
      </SimpleGrid>
    </Paper>
  );
}

/** What About used to be: author, sources, license, feedback, privacy. */
function About() {
  return (
    <Stack gap="lg">
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
            <b>ERCOT public data.</b> Real-time 15-minute settlement point prices and day-ahead hourly prices for five hubs and the resource
            nodes, from ERCOT&rsquo;s public archives and public API (reports NP6-905-CD and NP4-190-CD). ERCOT publishes these for public use;
            this site is not endorsed by ERCOT.
          </List.Item>
          <List.Item>
            <b>Open-source tools.</b> Data access with gridstatus, optimization with PuLP and the HiGHS solver, and the site with React, Mantine and
            Apache ECharts.
          </List.Item>
          <List.Item>
            <b>Published benchmarks</b> used for the sanity check on the <Anchor size="sm" href="#/research">Research</Anchor> page are cited there.
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

      <Section title="Ideas and feedback">
        <Text size="sm" maw={720} lh={1.55}>
          Found a wrong number, a confusing label, or want another location or feature? Feature requests and bug reports go to GitHub Issues, where
          anyone can see and add to them. The feature form asks what you were trying to do, which is the most useful thing to know.
        </Text>
        <Group gap="sm">
          <Button component="a" href={SITE.featureRequest} {...ext}>Suggest a feature</Button>
          <Button component="a" href={SITE.issues} {...ext} variant="light">Report a problem</Button>
          <Button component="a" href={`mailto:${SITE.email}`} variant="subtle">Email instead</Button>
        </Group>
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

function GuideTile({ card }: { card: GuideCard }) {
  const { go } = useApp();
  const scheme = useComputedColorScheme('light');
  const sel = { ...START_DEFAULTS, ...card.open };
  const href = buildHash(card.page, sel);
  return (
    <Paper withBorder component="article" p={0} style={{ overflow: 'hidden' }} data-interactive>
      <a
        href={href} tabIndex={-1} aria-hidden onClick={(e) => { e.preventDefault(); go(card.page, card.open); }}
        style={{ display: 'block', borderBottom: '1px solid var(--app-hairline)', background: 'var(--app-canvas)' }}
      >
        <img
          src={`${import.meta.env.BASE_URL}thumbs/${card.thumb ?? card.page}-${scheme}.webp`} alt={card.alt} width={640} height={400}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </a>
      <Stack gap={8} p={{ base: 'md', sm: 'lg' }}>
        <Title order={3} fz={20} style={{ letterSpacing: '-0.014em' }}>{card.title}</Title>
        <Text size="md" fw={560} c="bright" lh={1.4}>{card.question}</Text>
        <Text size="sm" c="dimmed" lh={1.5}>{card.shows}</Text>
        <Anchor
          href={href} fw={600} size="sm" mt={4}
          onClick={(e) => { e.preventDefault(); go(card.page, card.open); }}
        >
          {card.cta} {'→'}
        </Anchor>
      </Stack>
    </Paper>
  );
}

export default function Guide() {
  const { go } = useApp();
  const walk = useWalkthrough();
  useEffect(() => markStartSeen(), []); // opening this page counts as having seen the Overview banner
  // `#/learn?s=about` opens at a section. The frame wait lets the app's own scroll-to-top on navigation finish first.
  useEffect(() => {
    const to = () => {
      const id = hashParam(window.location.hash, 's');
      if (id && GUIDE_SECTIONS.some((x) => x.id === id)) requestAnimationFrame(() => jump(id));
    };
    to();
    window.addEventListener('hashchange', to);
    return () => window.removeEventListener('hashchange', to);
  }, []);
  return (
    <Stack gap={56} maw={1040}>
      <Stack gap="lg">
        <PageHeader title="Learn">
          <Text size="lg" c="dimmed" maw={700} lh={1.5}>
            New to ERCOT or to batteries? This page explains the market in two minutes, follows one real day of a battery trading,
            and shows where to look next. A glossary, and notes on who built this and where the data comes from, close the page.
            No background needed.
          </Text>
        </PageHeader>
        <Paper withBorder p={{ base: 'md', sm: 'lg' }} radius="lg" style={{ background: 'color-mix(in srgb, var(--mantine-primary-color-filled) 7%, var(--mantine-color-body))' }}>
          <Group justify="space-between" align="center" gap="md">
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <Text fw={620} c="bright" size="md">Short on time? Go straight to the answer.</Text>
              <Text size="sm" c="dimmed" lh={1.5}>A 2-hour battery at Houston Hub in 2025, the site’s default, with the headline numbers on Home.</Text>
            </div>
            <Button size="md" component="a" href="#/home" onClick={(e) => { e.preventDefault(); go('home', START_DEFAULTS); }}>Open Home</Button>
          </Group>
        </Paper>
        <Group gap={8} role="navigation" aria-label="Sections on this page">
          {GUIDE_SECTIONS.map((s, i) => (
            <Button key={s.id} variant="default" size="compact-sm" radius="xl" onClick={() => jump(s.id)}>
              <span className="tnum" style={{ opacity: 0.6, marginRight: 6 }}>{i + 1}</span>{s.label}
            </Button>
          ))}
        </Group>
      </Stack>

      <GuideSection id="ercot" n={1} title="ERCOT in 2 minutes" lede="The four ideas behind every number on this site.">
        <Ercot />
      </GuideSection>

      <GuideSection
        id="money" n={2} title="How a battery makes money here"
        lede={<>A battery earns by buying power when it is cheap and selling it when it is dear. Here is one real day, step by step. The plan assumes the battery knows the day’s prices in advance (<b>perfect foresight</b> <Info terms="perfect_foresight" />), so it shows the best case.</>}
      >
        <Walkthrough data={walk.data} error={walk.error} />
      </GuideSection>

      <GuideSection id="read" n={3} title="How to read this site" lede="Each page answers one question. Every link opens the page already set up for a 2-hour battery at Houston Hub in 2025, and on the run pages you can change the location, length, year and wear cost in the bar at the top.">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {GUIDE.map((c) => <GuideTile key={c.page} card={c} />)}
        </SimpleGrid>
      </GuideSection>

      <GuideSection id="left-out" n={4} title="What this model leaves out" lede="The numbers here are a ceiling for one kind of income, not a forecast of profit. These are the biggest gaps, and which way each one pushes the result.">
        <Stack gap="sm">
          {LEFT_OUT.map((l) => (
            <Paper key={l.title} withBorder p={{ base: 'md', sm: 'lg' }}>
              <Group gap="sm" align="center" mb={4} wrap="wrap">
                <Title order={3} fz={17} style={{ letterSpacing: '-0.01em' }}>{l.title}{l.term && <Info terms={l.term} />}</Title>
                <Badge variant="light" size="sm" color={l.effect === 'Overstates revenue' ? 'orange' : l.effect === 'Understates revenue' ? 'teal' : 'gray'}>{l.effect}</Badge>
              </Group>
              <Text size="md" c="dimmed" lh={1.55} maw={760}>{l.body}</Text>
            </Paper>
          ))}
          <Text size="md" lh={1.55} maw={760}>
            The model is also a price taker: it assumes the battery does not move prices. A large fleet does.{' '}
            <Anchor href="#/research/method" onClick={(e) => { e.preventDefault(); go('method'); }} fw={600}>Read the full list on the Method page {'→'}</Anchor>
          </Text>
        </Stack>
      </GuideSection>

      <GuideSection id="glossary" n={5} title="Glossary" lede="Every term the site uses, in plain words. The same definitions appear in the info icons beside each number.">
        <Glossary />
      </GuideSection>

      <GuideSection id="about" n={6} title="About this project" lede="Who built it, what it is based on, and how to tell me when something looks wrong.">
        <About />
      </GuideSection>
    </Stack>
  );
}
