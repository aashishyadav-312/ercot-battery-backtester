import { Suspense, lazy, useEffect, useState } from 'react';
import { Alert, Anchor, Badge, Flex, List, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { PageHeader } from './RunHeader';
import { Section } from '../components/Section';
import { useApp } from '../state';
import { useSelectedRun } from '../hooks';
import { HUBS, loadAncillary } from '../data/loader';
import { pct, yearLabel } from '../data/format';
import { locFull, zoneFull } from '../data/site';
import {
  assumptionRows, locationSentences, modoRows, partialYears, reserveRows, rtcLabel, shortDate, solverSentence,
  type AncillaryMeta,
} from '../data/method';
import { TERMS } from '../copy/terms';
import { V4, V5 } from '../config/features';

const V4Method = lazy(() => import('../v4/method/V4Method'));
const V5Method = lazy(() => import('../v5/method/V5Method'));

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Title order={3} fz={16}>{title}</Title>
      {children}
    </Stack>
  );
}

const MODO_LINKS = [
  { href: 'https://modoenergy.com/research/why-were-ercot-battery-revenues-so-low-in-2025-weather-energy-arbitrage-builodout', text: 'Modo Energy: Why were ERCOT battery revenues so low in 2025?', note: ' (Feb 3, 2026)' },
  { href: 'https://modoenergy.com/research/ercot-battery-energy-storage-revenues-h1-january-june-2024-owners-ancillary-services-arbitrage-bess-index-jupiter-power-key-capture', text: 'Modo Energy: ERCOT BESS revenues H1 2024', note: '' },
  { href: 'https://modoenergy.com/research/ercot-battery-revenue-benchmark-november-2025-battery-energy-storage-bess-capture-rates', text: 'Modo Energy: ERCOT battery revenue benchmark, November 2025', note: '' },
];

const scroller = (label: string, minWidth: number) => ({ minWidth, scrollAreaProps: { viewportProps: { tabIndex: 0, role: 'region', 'aria-label': label } } }) as const;

export default function Method() {
  const { nodes, index, go } = useApp();
  const { run } = useSelectedRun();
  const m = run?.meta;
  const [anc, setAnc] = useState<AncillaryMeta>();
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => {
    let live = true;
    loadAncillary().then((d) => { if (live) setAnc(d.meta as AncillaryMeta | undefined); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const rows = m && index ? assumptionRows(m, index, anc) : [];
  const modo = index ? modoRows(index) : [];
  const last = index ? partialYears(index).at(-1) : undefined;
  const link = (label: string, page: Parameters<typeof go>[0]) => (
    <Anchor component="button" type="button" size="sm" onClick={() => go(page)}>{label}</Anchor>
  );

  return (
    <Stack gap="lg" maw={880}>
      <PageHeader title="Method">
        <Text size="lg" c="dimmed" maw={680} lh={1.5}>
          What the model does, what it assumes and what it leaves out. Every number on the other pages comes from the committed
          JSON files in <code>results/</code>.
        </Text>
      </PageHeader>

      <Section title="What the model does">
        <Text size="sm">
          It models one battery, one day at a time. For each 15-minute interval, a linear program picks how much to charge and
          discharge to maximise revenue. The battery starts and ends every day empty.
        </Text>
      </Section>

      <Section title="Assumptions">
        <Stack gap={0} component="dl" m={0} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {rows.map((r) => (
            <Flex key={r.label} direction={{ base: 'column', sm: 'row' }} gap={{ base: 2, sm: 'md' }} py={8} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
              <Text component="dt" size="sm" fw={600} w={{ sm: 150 }} style={{ flexShrink: 0 }}>{r.label}</Text>
              <Text component="dd" size="sm" m={0}>{r.text}</Text>
            </Flex>
          ))}
        </Stack>
        {m && (
          <Text size="xs" c="dimmed">
            Selected run: {locFull(m.location)}, {yearLabel(m.year)}, {m.duration_h}h, {m.days_solved} days solved, {m.skipped_days.length} skipped.
          </Text>
        )}
      </Section>

      <Section title="Two strategies">
        <Text size="sm">
          <b>{TERMS.perfectForesight.label}</b> sees the whole day of real-time prices before it chooses. No operator can do that,
          so these results are an upper bound on energy arbitrage.
        </Text>
        <Text size="sm">
          <b>{TERMS.dayAheadPlan.label}</b> plans the day on day-ahead prices and is paid at real-time prices. It is closer to what
          an operator can do. The {link('Reality check', 'realism')} page compares the two.
        </Text>
      </Section>

      {V4 && <Suspense fallback={<Text size="sm" c="dimmed">Loading the stack and Data Center method…</Text>}><V4Method /></Suspense>}
      {V5 && <Suspense fallback={<Text size="sm" c="dimmed">Loading the 12CP and storage method…</Text>}><V5Method /></Suspense>}

      <Section title="What it leaves out">
        <List size="sm" spacing={4}>
          <List.Item>Forecast error beyond the day-ahead plan.</List.Item>
          <List.Item>Ancillary services in the base results. A separate screen adds them; see {link('Findings', 'research')}.</List.Item>
          <List.Item>Transmission and interconnection costs.</List.Item>
          <List.Item>Capacity fade. Degradation is a flat cost per MWh discharged.</List.Item>
          <List.Item>Market impact. The battery is a price taker.</List.Item>
        </List>
      </Section>

      <Section title="Checked against real fleet revenue">
        <Text size="sm">Modo Energy measures what real batteries earned from all sources. A perfect-foresight, energy-only result sits above its arbitrage share.</Text>
        <Table.ScrollContainer {...scroller('Model against Modo fleet table, scrolls sideways when it does not fit', 560)}>
          <Table verticalSpacing={6} fz="sm" withTableBorder withColumnBorders>
            <Table.Thead><Table.Tr><Table.Th>Year</Table.Th><Table.Th>Real fleet average (Modo)</Table.Th><Table.Th>This model, 2h hubs</Table.Th><Table.Th>Check</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {modo.map((r) => (
                <Table.Tr key={r.year}><Table.Td fw={600}>{r.year}</Table.Td><Table.Td>{r.real}</Table.Td><Table.Td>{r.ours}</Table.Td><Table.Td>{r.check}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <List size="sm" spacing={4}>
          {MODO_LINKS.map((l) => (
            <List.Item key={l.href}><Anchor href={l.href} target="_blank" rel="noreferrer">{l.text}</Anchor>{l.note}</List.Item>
          ))}
        </List>
      </Section>

      <Section title="Locations and data">
        <Text size="sm">
          {nodes ? locationSentences(nodes, HUBS.length).join(' ') : ''}{' '}
          {link('Atlas › Study sites', 'map')} shows them on a map.
        </Text>
      </Section>

      <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="details" onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => setNotesOpen(e.currentTarget.open)}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 20, fontWeight: 600, letterSpacing: '-0.014em' }}>Technical notes<span aria-hidden="true">{notesOpen ? '−' : '+'}</span></summary>
        <Stack gap="lg" mt="sm">
          <Sub title="Energy plus ancillary services">
            <Text size="sm">The separate strategy comparison on Revenue and Reality check co-optimizes energy with Regulation Up, Regulation Down, Responsive Reserve (RRS), ECRS and Non-Spin. The existing KPI tiles and other charts remain energy-only. Both strategies in the new card use exactly the same covered days and energy price series; missing ancillary prices exclude a day rather than becoming zero revenue.</Text>
            <Text size="sm">The new screen uses as-posted real-time energy prices from ERCOT public API NP6-905-CD for hubs and nodes. Its baseline is re-solved on those prices; the original hub charts use corrected annual archives and may differ. {anc ? `Before ${rtcLabel(anc)}` : 'Before RTC+B'}, the model uses hourly day-ahead capacity clearing prices from ERCOT NP4-188-CD. Awards are fixed within each physical UTC hour, including repeated DST hours. {anc ? `From ${rtcLabel(anc)}` : 'After RTC+B'} it uses the settled 15-minute real-time capacity prices in NP6-796-ER. Post-RTC+B results represent an all-real-time capacity position, with no day-ahead AS award or imbalance settlement added. The pre-RTC combination of real-time energy foresight and day-ahead capacity foresight is a screening scenario, not an executable bidding strategy.</Text>
            {anc && (
              <Table.ScrollContainer {...scroller('Reserve backing table, scrolls sideways when it does not fit', 480)}>
                <Table withTableBorder>
                  <Table.Thead><Table.Tr><Table.Th>Reserve backing (hours)</Table.Th><Table.Th>Before RTC+B</Table.Th><Table.Th>From {rtcLabel(anc)}</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{reserveRows(anc).map(([p, b, a]) => <Table.Tr key={p}><Table.Td>{p}</Table.Td><Table.Td>{b}</Table.Td><Table.Td>{a}</Table.Td></Table.Tr>)}</Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
            <Text size="sm">These are explicit, configurable screening parameters. Full-hour pre-RTC Regulation/RRS backing is conservative relative to the remaining-operating-hour SOC rule. Post-RTC Regulation/RRS durations and ECRS follow <Anchor href="https://www.ercot.com/mktrules/issues/NPRR1282" target="_blank" rel="noreferrer">NPRR1282</Anchor>; earlier ECRS and Non-Spin follow <Anchor href="https://www.ercot.com/mktrules/issues/NPRR1096" target="_blank" rel="noreferrer">NPRR1096</Anchor>. RRS is represented as sustained reserve, not a separate Fast Frequency Response product.</Text>
            <Text size="sm">All five awards share the inverter with scheduled charging/discharging. Upward reserves share stored energy, and Regulation Down requires empty charging headroom; both interval boundaries must satisfy these constraints, with efficiency included. This conservative capacity split does not credit reserves supplied by interrupting charging. Daily state of charge still begins and ends empty. {anc ? solverSentence(anc) : ''} Achieved gaps and time limits are recorded in the result file. Early cached runs used a longer 10-second limit. Numerical solver ranges are shown for time-limited results, separately from unmodeled operating risk. The original energy-only fallback retains its 10-second limit and 0.01% target. A time-limited feasible schedule is not a proven optimum. If a known feasible energy-only schedule earns more, it is used with zero AS awards and the original dual bound is retained.</Text>
            <Alert color="yellow" title="Capacity screening, not realized earnings">No ancillary deployment trajectory, deployment energy cash flow, mileage, performance penalties, outages, qualification or market-depth constraints are simulated. A large battery could not necessarily sell these modeled awards at historical clearing prices. AS prices are system-wide, but allocation and earnings can vary by location because energy has an opportunity cost. The parameter max_as_share allows a capacity-exposure sensitivity; the committed base case allows up to {pct(anc?.max_as_share ?? 1)} of rated power. Energy revenue is net of the selected discharge degradation charge; AS deployment degradation is omitted.</Alert>
            <Text size="sm">The RTC+B stack uses paired calendar days{anc && last ? ` in ${shortDate(anc.rtc_date)} to ${shortDate(last.hubs)} windows` : ''}, reports actual $/kW for each window, and never labels a partial period as a full year. The price basis and reserve rules also change between windows, so this is descriptive rather than a causal estimate of RTC+B. The Houston 2025 figures for this screen, and how they compare with <Anchor href={MODO_LINKS[0].href} target="_blank" rel="noreferrer">Modo’s February 2026 estimate</Anchor>, are in {link('Findings', 'research')}. No calibration was applied to force agreement with Modo.</Text>
          </Sub>

          <Sub title="RTC+B">
            <Text size="sm">
              ERCOT’s real-time co-optimization plus batteries (RTC+B) went live on {anc ? rtcLabel(anc) : 'Dec 5, 2025'}, so the 2026 results come after it.
              Arbitrage revenue fell again in 2026 against the same window of 2025, and it had already fallen in 2025, before RTC+B.
            </Text>
            <Text size="sm">
              <b>This model cannot separate RTC+B from the continuing build-out of batteries, which flattens price spreads.</b> It also leaves out ancillary
              services, where RTC+B changes battery revenue most directly. Read the 2026 numbers as “revenue fell again,” not “RTC+B caused it.”
            </Text>
          </Sub>

          <Sub title="Cycles and custom runs">
            <Text size="sm">Cycles are MWh discharged divided by MWh of energy capacity, summed over the year. Also left out: state-of-charge limits from market rules, and revenue from capacity or other programs.</Text>
            <Text size="sm">
              Studio solves the same daily model in your browser (HiGHS{anc?.software?.highspy ? ` ${anc.software.highspy}` : ''} compiled to WebAssembly, the version the Python pipeline uses), including the MILP re-solve, on published price files for the {HUBS.length + (nodes?.nodes.length ?? 0)} detailed locations. A parity test holds it within 0.5% of the Python results. A range shorter than a calendar year is scaled to 365 days and labeled <Badge size="sm" variant="dot" color="yellow">Annualized</Badge>. Energy arbitrage only.
            </Text>
          </Sub>

          <Sub title="Context layers">
            <Text size="sm">
              Revenue (fleet capacity), Study sites (planned storage), Charging pattern (solar and wind share) and the ten best days (weather) show public data beside the results.
              They come from EIA-860M, ERCOT’s interconnection queue report, Open-Meteo and ERCOT’s Fuel Mix Report; none of it enters the optimizer.
              The wording describes what moved together and never says one caused the other.
              Queued projects may never be built, and weather is reanalysis at a hub city, not at the node.
            </Text>
          </Sub>

          <Sub title="Locations and data">
            <Text size="sm">
              Nodes whose prices correlate strongly with an earlier pick were skipped. “Hub near the node” is the hub of the node’s settlement load zone.
            </Text>
            {nodes && (
              <Table.ScrollContainer {...scroller('Node comparison table, scrolls sideways when it does not fit', 560)}>
                <Table verticalSpacing={4} fz="sm" withTableBorder>
                  <Table.Thead><Table.Tr><Table.Th>Node</Table.Th><Table.Th>Group</Table.Th><Table.Th ta="right">Price std ({nodes.sample_month}, $/MWh)</Table.Th><Table.Th>Load zone</Table.Th><Table.Th>Hub</Table.Th></Table.Tr></Table.Thead>
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
              </Table.ScrollContainer>
            )}
            <Text size="sm">
              Node prices come from the ERCOT public API report NP6-905-CD, which holds prices as first posted. Hub prices come from the annual archive,
              which includes later corrections. At hubs the difference is small, but a corrected spike at a node could move that node’s result much more.
              The high-volatility nodes were selected using {nodes ? nodes.sample_month.slice(0, 4) : ''} data, so their results for that year are flattered by selection.
            </Text>
            <Text size="sm">
              A <b>data-quality note</b> appears on any run where a single day dominates the result (for example {locFull('RHESS2_ESS1')} in 2025).
            </Text>
          </Sub>

          <Text size="xs" c="dimmed">
            Open-source building blocks: React, Mantine, Apache ECharts, gridstatus (data access), PuLP and HiGHS (optimizer).
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
