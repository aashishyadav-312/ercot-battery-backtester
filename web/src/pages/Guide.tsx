import { useEffect, type ReactNode } from 'react';
import { Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { PageHeader } from './RunHeader';
import { Info } from '../components/Info';
import { Walkthrough } from '../components/start/Walkthrough';
import { DaRtDiagram, ErcotDiagram, LocationsDiagram, SpikeDiagram } from '../components/start/Diagrams';
import { useApp } from '../state';
import { hashParam } from '../shell/route';
import { useWalkthrough } from '../hooks';
import { locName } from '../data/site';
import { START_DEFAULTS } from '../data/start';
import { fmtDate } from '../data/format';
import { markStartSeen } from '../components/StartBanner';
import { V4 } from '../config/features';
import { Screening } from '../v4/learn/Screening';

/** Sections of the page, in order. `#/learn?s=<id>` opens it at one. The other old sections have their own pages now (shell/route.ts). */
export const GUIDE_SECTIONS = [
  { id: 'ercot', label: 'ERCOT in 2 minutes' },
  { id: 'money', label: 'How a battery makes money' },
  ...(V4 ? [{ id: 'screening', label: 'Site screening' }] : []),
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

/** Learn > Basics: the market in two minutes and one real day of a battery trading. */
export default function Guide() {
  const { go } = useApp();
  const walk = useWalkthrough();
  useEffect(() => markStartSeen(), []); // opening this page counts as having seen the Revenue banner
  // `#/learn?s=money` opens at a section. The frame wait lets the app's own scroll-to-top on navigation finish first.
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
        <PageHeader title="Basics">
          <Text size="lg" c="dimmed" maw={700} lh={1.5}>
            New to ERCOT or to batteries? This page explains the market in two minutes and follows one real day of a battery trading.
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

      {V4 && (
        <GuideSection id="screening" n={3} title="Site screening" lede="From a place on the map to what a battery is worth there. Three steps.">
          <Screening />
        </GuideSection>
      )}
    </Stack>
  );
}
