import { Alert, Anchor, Badge, List, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { PageHeader } from './Overview';
import { useApp } from '../state';
import { useSelectedRun } from '../hooks';
import { IconWarn } from '../components/Icons';
import { yearLabel } from '../data/format';
import { locFull, zoneFull } from '../data/site';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section">
      <Title order={2} fz={20} mb="sm" style={{ letterSpacing: '-0.014em' }}>{title}</Title>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}

const MODO = [
  { year: '2024', real: '~$55–56/kW-yr, all revenue. Ancillary services were most of it (about 74% in H1).', ours: '$54–66 ($10/MWh degr.), $66–79 ($0)', check: 'Above the real fleet’s arbitrage share' },
  { year: '2025', real: '~$29/kW-yr, all revenue (Modo nowcast, Feb 2026)', ours: '$40–49 ($10/MWh degr.), $51–61 ($0)', check: '1.4–2.1× the real total' },
];

export default function Method() {
  const { nodes, go } = useApp();
  const { run } = useSelectedRun();
  const m = run?.meta;
  return (
    <Stack gap="lg" maw={880}>
      <PageHeader title="Method">
        <Text size="lg" c="dimmed" maw={680} lh={1.5}>
          What this tool computes, what it assumes, and how far to trust it. Every number on the other pages comes from the
          committed JSON files in <code>results/</code>.
        </Text>
      </PageHeader>

      <Alert color="yellow" icon={<IconWarn />} title="This is an upper bound, not a forecast">
        Each day&rsquo;s schedule is chosen with the actual real-time prices already known (perfect foresight). No operator can do
        that, so these results are the ceiling on energy arbitrage, not what a battery will earn.
      </Alert>

      <Section title="Assumptions">
        <Stack gap="md" component="dl" my={0}>
            <div key="0"><Text size="sm" fw={600}>Market and prices</Text><Text size="sm" c="dimmed">ERCOT real-time 15-minute settlement point prices. The Realism page also uses day-ahead hourly prices, as a forecast to schedule on.</Text></div>
            <div key="1"><Text size="sm" fw={600}>Optimizer</Text><Text size="sm" c="dimmed">One linear program per Central-time day (96 intervals), solved with PuLP and HiGHS. Charge and discharge are bounded by rated power; state of charge is bounded by energy capacity.</Text></div>
            <div key="2"><Text size="sm" fw={600}>Daily boundary</Text><Text size="sm" c="dimmed">The battery starts and ends each day empty, so no energy is carried overnight and no day borrows from another.</Text></div>
            <div key="3"><Text size="sm" fw={600}>Efficiency</Text><Text size="sm" c="dimmed">85% round trip, split as √0.85 on charge and √0.85 on discharge.</Text></div>
            <div key="4"><Text size="sm" fw={600}>Degradation</Text><Text size="sm" c="dimmed">Two settings: $0 and $10 per MWh discharged. Revenue shown is net of this cost. A full cycle of a 2-hour, 100 MW battery therefore costs $2,000.</Text></div>
            <div key="5"><Text size="sm" fw={600}>Size</Text><Text size="sm" c="dimmed">Modeled as 100 MW; results are quoted per kW of power capacity, so size does not matter. Durations 1, 2 and 4 hours.</Text></div>
            <div key="6"><Text size="sm" fw={600}>Partial years</Text><Text size="sm" c="dimmed">2026 runs to Oct 24 (hubs) or Oct 30 (nodes). $/kW-yr and cycles/yr are scaled to 365 days and labeled <Badge size="sm" variant="dot" color="yellow">Annualized YTD</Badge>. Seasonality is not adjusted for, so the scaled figure is indicative only. Where exact comparisons matter, pages use matched windows of identical days.</Text></div>
            <div key="7"><Text size="sm" fw={600}>Excluded</Text><Text size="sm" c="dimmed">Ancillary services, forecast error (except on the Realism page, which schedules on day-ahead prices), transmission and interconnection costs, state-of-charge limits from market rules, and any revenue from capacity or other programs.</Text></div>
            <div key="8"><Text size="sm" fw={600}>Cycles</Text><Text size="sm" c="dimmed">MWh discharged divided by MWh of energy capacity, summed over the year.</Text></div>
        </Stack>
        {m && (
          <Text size="xs" c="dimmed">
            Selected run: {locFull(m.location)}, {yearLabel(m.year)}, {m.duration_h}h, {m.days_solved} days solved, {m.skipped_days.length} skipped.
          </Text>
        )}
      </Section>

      <Section title="Perfect foresight">
        <Text size="sm">
          The model sees the full day of prices before choosing when to charge and discharge. Real operators work from
          forecasts, day-ahead awards and ancillary-service commitments, and they miss some of the spread. Treat every figure here as the
          most that energy arbitrage alone could have paid. Comparing locations, durations and years is more reliable than the absolute level,
          because the same advantage applies to all of them.
        </Text>
        <Text size="sm">
          Concentration matters too: in several runs the ten best days earn roughly 15–65% of the total. A battery that was offline or mis-scheduled on
          those days would have missed most of the year.
        </Text>
      </Section>

      <Section title="Check against published benchmarks">
        <Text size="sm">
          Modo Energy&rsquo;s ERCOT BESS index measures what real batteries earned from <i>all</i> sources, without perfect foresight. A perfect-foresight,
          arbitrage-only result should land above the arbitrage part of that figure, and it does in both years.
        </Text>
        <div style={{ overflowX: 'auto' }}>
          <Table verticalSpacing={6} fz="sm" withTableBorder withColumnBorders miw={560}>
            <Table.Thead><Table.Tr><Table.Th>Year</Table.Th><Table.Th>Real fleet average (Modo)</Table.Th><Table.Th>This model, 2h hubs</Table.Th><Table.Th>Check</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {MODO.map((r) => (
                <Table.Tr key={r.year}><Table.Td fw={600}>{r.year}</Table.Td><Table.Td>{r.real}</Table.Td><Table.Td>{r.ours}</Table.Td><Table.Td>{r.check}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
        <Text size="sm">
          Revenue also fell from 2024 to 2025 in our results (−17% to −34% in matched windows), the same direction as Modo&rsquo;s reported halving of
          fleet revenue. The fall in ancillary-service prices, which this model leaves out, explains the rest.
        </Text>
        <List size="sm" spacing={4}>
          <List.Item><Anchor href="https://modoenergy.com/research/why-were-ercot-battery-revenues-so-low-in-2025-weather-energy-arbitrage-builodout" target="_blank" rel="noreferrer">Modo Energy: Why were ERCOT battery revenues so low in 2025?</Anchor> (Feb 3, 2026)</List.Item>
          <List.Item><Anchor href="https://modoenergy.com/research/ercot-battery-energy-storage-revenues-h1-january-june-2024-owners-ancillary-services-arbitrage-bess-index-jupiter-power-key-capture" target="_blank" rel="noreferrer">Modo Energy: ERCOT BESS revenues H1 2024</Anchor></List.Item>
          <List.Item><Anchor href="https://modoenergy.com/research/ercot-battery-revenue-benchmark-november-2025-battery-energy-storage-bess-capture-rates" target="_blank" rel="noreferrer">Modo Energy: ERCOT battery revenue benchmark, November 2025</Anchor></List.Item>
        </List>
      </Section>

      <Section title="RTC+B caveat">
        <Text size="sm">
          ERCOT&rsquo;s real-time co-optimization plus batteries (RTC+B) went live on Dec 5, 2025, so all of 2026 comes after it. Arbitrage revenue
          fell again in 2026 (−8% to −23% against the same Jan 1–Oct 24 window of 2025), but it had already fallen about as much in 2025, before RTC+B.
        </Text>
        <Text size="sm">
          <b>This model cannot separate RTC+B from the continuing build-out of batteries, which flattens price spreads.</b> It also leaves out ancillary
          services, where RTC+B changes battery revenue most directly. Read the 2026 numbers as &ldquo;revenue fell again,&rdquo; not &ldquo;RTC+B caused it.&rdquo;
        </Text>
        <Text size="sm">
          The <Anchor component="button" size="sm" onClick={() => go('realism')}>Realism page</Anchor> compares matched windows before and after
          Dec 5, 2025 for perfect foresight and a day-ahead-scheduled strategy, with the same caution.
        </Text>
      </Section>

      <Section title="Locations and data">
        <Text size="sm">
          Five ERCOT hubs plus five resource nodes. The nodes were chosen from 735 with complete data by the standard deviation of their August 2025
          real-time price: the three most volatile (skipping any whose prices correlate above 0.95 with an earlier pick) and the two closest to the median.
          &ldquo;Hub near the node&rdquo; is the hub of the node&rsquo;s settlement load zone.
        </Text>
        {nodes && (
          <div style={{ overflowX: 'auto' }}>
            <Table verticalSpacing={4} fz="sm" withTableBorder miw={560}>
              <Table.Thead><Table.Tr><Table.Th>Node</Table.Th><Table.Th>Group</Table.Th><Table.Th ta="right">Aug 2025 std ($/MWh)</Table.Th><Table.Th>Load zone</Table.Th><Table.Th>Hub</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {nodes.nodes.map((n) => (
                  <Table.Tr key={n.location}>
                    <Table.Td>{locFull(n.location)}</Table.Td><Table.Td>{n.group === 'high' ? 'high volatility' : 'typical'}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{n.std.toFixed(1)}</Table.Td>
                    <Table.Td>{zoneFull(n.load_zone)}</Table.Td><Table.Td>{locFull(n.nearest_hub)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}
        <Text size="sm">
          Node prices come from the ERCOT public API report NP6-905-CD, which holds prices as first posted. Hub prices come from the annual archive,
          which includes later corrections. At {locFull('HB_HOUSTON')} 2024 the difference moves revenue by only 0.1–0.3%, but a corrected spike at a node could
          move that node&rsquo;s result much more. The high-volatility nodes were selected using 2025 data, so their 2025 results are flattered by selection.
        </Text>
        <Text size="sm">
          A <b>data-quality note</b> appears on any run where the single best day is more than 20% of the period&rsquo;s revenue
          (for example {locFull('RHESS2_ESS1')} in 2025).
        </Text>
      </Section>

      <Text size="xs" c="dimmed" pb="lg">
        Open-source building blocks: React, Mantine, Apache ECharts, gridstatus (data access), PuLP and HiGHS (optimizer).
      </Text>
    </Stack>
  );
}
