import { useCallback, useMemo, useState } from 'react';
import { Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, Title, UnstyledButton, useComputedColorScheme } from '@mantine/core';
import { Chart, tooltipBase, type ChartTheme } from '../Chart';
import { Info } from '../Info';
import { heatColor, rampAt } from './scale';
import { MONTHS, downloadCsv, pct, usd } from '../../data/format';
import { locFull, zoneFull } from '../../data/site';
import type { HubRec, NodeRec, NodesFile } from '../../data/types';

/** "2-hour battery, 2025, 85% round-trip, $10/MWh degradation" for the all-node file. */
export function heatScenario(m: NodesFile['meta']) {
  return `${m.duration_h}-hour battery, ${m.year}, ${Math.round(m.rte * 100)}% round-trip efficiency, $${m.deg_cost_per_mwh}/MWh degradation`;
}

/** Discrete legend for the quantile colour classes. */
export function HeatLegend({ breaks, meta }: { breaks: number[]; meta: NodesFile['meta'] }) {
  const mode = useComputedColorScheme('light');
  const classes = breaks.length + 1;
  const outline = 'var(--mantine-color-default-border)';
  const label = (i: number) =>
    i === 0 ? `< ${usd(breaks[0], 0)}` : i === breaks.length ? `≥ ${usd(breaks[i - 1], 0)}` : `${usd(breaks[i - 1], 0)}–${usd(breaks[i], 0)}`;
  return (
    <Group gap="xl" align="flex-start" role="group" aria-label="Heat map legend" mt="sm" wrap="wrap">
      <Stack gap={6}>
        <Group gap={2}>
          <Text size="xs" c="dimmed" fw={560}>Colour: $/kW-yr, {classes} equal-count classes (each ≈ {Math.round(100 / classes)}% of nodes)</Text>
          <Info terms={['usd_per_kw_yr', 'quantile_scale']} size={14} />
        </Group>
        <Group gap={4} wrap="wrap">
          {Array.from({ length: classes }, (_, i) => (
            <Stack key={i} gap={2} align="center" w={74}>
              <div style={{ width: 74, height: 10, borderRadius: 3, background: rampAt(i / breaks.length, mode), border: `1px solid ${outline}` }} aria-hidden="true" />
              <Text size="xs" c="dimmed" className="tnum" style={{ whiteSpace: 'nowrap' }}>{label(i)}</Text>
            </Stack>
          ))}
        </Group>
      </Stack>
      <Stack gap={6}>
        <Text size="xs" c="dimmed" fw={560}>Markers</Text>
        <Group gap="md" wrap="wrap">
          <Group gap={6} wrap="nowrap">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill={rampAt(0.6, mode)} stroke={outline} /></svg>
            <Text size="xs" c="dimmed">Resource node ({meta.n_nodes_geocoded} placed)</Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill={rampAt(0.6, mode)} stroke="var(--mantine-color-text)" strokeWidth="2" /></svg>
            <Text size="xs" c="dimmed">Detailed location (labelled; hubs are diamonds)</Text>
          </Group>
        </Group>
      </Stack>
    </Group>
  );
}

function Stat({ label, term, value }: { label: string; term: string; value: string }) {
  return (
    <div>
      <Group gap={2} wrap="nowrap" mb={4}>
        <Text size="xs" c="dimmed" fw={560} tt="uppercase" style={{ letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{label}</Text>
        <Info terms={term} size={13} />
      </Group>
      <Text key={value} className="app-fade tnum" fz={22} fw={640} lh={1.1} c="bright" style={{ letterSpacing: '-0.02em' }}>{value}</Text>
    </div>
  );
}

function MonthlySpark({ node }: { node: NodeRec | HubRec }) {
  const build = useCallback(
    (t: ChartTheme) => ({
      grid: { left: 4, right: 8, top: 10, bottom: 20 },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis',
        formatter: (p: { axisValue: string; value: number }[]) => `${p[0].axisValue}: ${usd(p[0].value, 2)} per kW`,
      },
      xAxis: {
        type: 'category', data: MONTHS, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: t.muted, fontSize: 10, interval: 0, formatter: (v: string) => v[0] },
      },
      yAxis: { type: 'value', show: false, min: 0 },
      series: [{
        id: 'monthly', name: 'monthly', type: 'line', data: node.monthly, symbol: 'circle', symbolSize: 5,
        lineStyle: { color: t.series[0], width: 2 }, itemStyle: { color: t.series[0] }, areaStyle: { color: t.series[0], opacity: 0.12 },
      }],
    }),
    [node],
  );
  return <Chart build={build} height={96} label={`Revenue by month for ${node.code}, in dollars per kilowatt`} />;
}

/** Side panel for a node that only has summary metrics (not one of the 10 detailed locations). */
export function NodePanel({ node, data, onDetailed }: { node: NodeRec; data: NodesFile; onDetailed: (code: string) => void }) {
  const hub = data.hubs.find((h) => h.code === node.hub);
  const ratio = hub && hub.rev > 0 ? node.rev / hub.rev : null;
  const max = Math.max(node.rev, hub?.rev ?? 0, 1e-9);
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="aside" aria-label={`Details for ${node.code}`} aria-live="polite">
      <Stack gap="md">
        <div>
          <Title order={3} fz={22} lh={1.2} ff="monospace" style={{ wordBreak: 'break-all' }}>{node.code}</Title>
          <Group gap={6} mt="xs">
            <Badge variant="light" color="accent">Resource node</Badge>
            <Badge variant="light" color="gray">#{node.rank} of {data.meta.n_nodes}</Badge>
            {node.lz && <Badge variant="light" color="gray">{zoneFull(node.lz)}</Badge>}
          </Group>
          <Text size="xs" c="dimmed" lh={1.5} mt={8}>
            {node.sub ? `Substation ${node.sub}. ` : ''}Summary run only: {heatScenario(data.meta)}.
          </Text>
        </div>
        <SimpleGrid cols={3} spacing="xs">
          <Stat label="$/kW-yr" term="usd_per_kw_yr" value={usd(node.rev, 1)} />
          <Stat label="Capture" term="capture_rate" value={pct(node.capture, 0)} />
          <Stat label="Top 10" term="top10_day_share" value={pct(node.top10, 0)} />
        </SimpleGrid>
        <SimpleGrid cols={3} spacing="xs">
          <Stat label="Cycles" term="cycles" value={node.cycles.toFixed(0)} />
          <Stat label="Spread" term="spread_captured" value={usd(node.spread, 0)} />
          <Stat label="Corr. hub" term="corr_hub" value={node.corr_hub == null ? '–' : node.corr_hub.toFixed(2)} />
        </SimpleGrid>
        <div>
          <Text size="xs" c="dimmed" fw={560} mb={2}>Revenue by month, $/kW</Text>
          <MonthlySpark node={node} />
        </div>
        <div>
          <Group gap={6} mb={8} wrap="nowrap">
            <Text size="xs" c="dimmed" fw={560}>Node vs its load-zone hub</Text>
            {ratio != null && <Badge size="sm" variant="light" color={ratio >= 1 ? 'green' : 'gray'}>{ratio.toFixed(1)}× the hub</Badge>}
          </Group>
          {[{ label: node.code, value: node.rev, strong: true }, { label: hub ? locFull(hub.code) : 'Hub unknown', value: hub?.rev ?? null }].map((r) => (
            <div key={r.label} style={{ marginBottom: 8 }}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="xs" c={r.strong ? 'bright' : 'dimmed'} fw={r.strong ? 600 : 400} truncate>{r.label}</Text>
                <Text size="xs" className="tnum" c="bright" fw={600}>{usd(r.value, 1)}</Text>
              </Group>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--app-hairline)', marginTop: 3 }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.max(0, ((r.value ?? 0) / max) * 100)}%`, background: r.strong ? 'var(--mantine-color-accent-filled)' : 'var(--mantine-color-gray-5)' }} />
              </div>
            </div>
          ))}
        </div>
        {node.hub && <Button variant="default" onClick={() => onDetailed(node.hub!)}>Open the {locFull(node.hub)} details</Button>}
        <Text size="xs" c="dimmed" lh={1.5}>
          {node.lat == null
            ? 'Not placed on the map: no EIA-860 plant record could be matched to this node. Coordinates are never guessed.'
            : `Marker at the EIA-860 plant matched to this node (${node.geo === 'eia860_lmp_node' ? 'EIA node ID, high confidence' : node.geo === 'manual_review' ? 'hand review' : 'name match, medium confidence'}).`}
        </Text>
      </Stack>
    </Paper>
  );
}

type Key = 'rank' | 'code' | 'lz' | 'rev' | 'da_rev' | 'capture' | 'top10' | 'cycles' | 'spread' | 'corr_hub' | 'vs_hub';
const COLS: { key: Key; label: string; term?: string; num?: boolean }[] = [
  { key: 'rank', label: '#', num: true },
  { key: 'code', label: 'Node' },
  { key: 'lz', label: 'Load zone' },
  { key: 'rev', label: '$/kW-yr', term: 'usd_per_kw_yr', num: true },
  { key: 'vs_hub', label: 'vs hub', num: true },
  { key: 'da_rev', label: 'DA-sched.', term: 'da', num: true },
  { key: 'capture', label: 'Capture', term: 'capture_rate', num: true },
  { key: 'top10', label: 'Top 10', term: 'top10_day_share', num: true },
  { key: 'cycles', label: 'Cycles', term: 'cycles', num: true },
  { key: 'spread', label: 'Spread', term: 'spread_captured', num: true },
  { key: 'corr_hub', label: 'Corr. hub', term: 'corr_hub', num: true },
];
const PAGE = 25;

/** Sortable table of every node in the all-node run. Selecting a row opens it on the map. */
export function TopNodesTable({ data, breaks, selected, onSelect }: { data: NodesFile; breaks: number[]; selected: string | null; onSelect: (code: string) => void }) {
  const mode = useComputedColorScheme('light');
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: 'rev', desc: true });
  const [zone, setZone] = useState<string | null>(null);
  const [n, setN] = useState(PAGE);
  const hubRev = useMemo(() => Object.fromEntries(data.hubs.map((h) => [h.code, h.rev])), [data]);
  const vsHub = (r: NodeRec) => (r.hub && hubRev[r.hub] > 0 ? r.rev / hubRev[r.hub] : null);
  const zones = useMemo(() => [...new Set(data.nodes.map((r) => r.lz).filter((z): z is string => !!z))].sort(), [data]);

  const rows = useMemo(() => {
    const val = (r: NodeRec): number | string | null => (sort.key === 'vs_hub' ? vsHub(r) : r[sort.key]);
    const out = data.nodes.filter((r) => !zone || r.lz === zone);
    return out.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
      return sort.desc ? -c : c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, zone]);

  const click = (key: Key) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: !['code', 'lz', 'rank'].includes(key) }));
  const csv = () => downloadCsv(
    `ercot_nodes_${data.meta.year}_${data.meta.duration_h}h.csv`,
    ['rank', 'node', 'load_zone', 'hub', 'usd_per_kw_yr', 'vs_hub', 'da_scheduled_usd_per_kw_yr', 'capture_rate', 'top10_share', 'cycles', 'spread_usd_mwh', 'corr_hub', 'lat', 'lon'],
    rows.map((r) => [r.rank, r.code, r.lz, r.hub, r.rev, vsHub(r)?.toFixed(3) ?? null, r.da_rev, r.capture, r.top10, r.cycles, r.spread, r.corr_hub, r.lat, r.lon]),
  );

  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="Top nodes">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm" mb="sm">
        <div>
          <Text component="h3" fw={620} size="md" c="bright" m={0} mb={2}>Top nodes</Text>
          <Text size="sm" c="dimmed">
            All {data.meta.n_nodes} resource nodes with complete {data.meta.year} data, {heatScenario(data.meta)}. Select a column to sort; select a node to show it on the map.
          </Text>
        </div>
        <Group gap="xs">
          <Select aria-label="Filter by load zone" placeholder="All load zones" clearable size="sm" w={200}
            data={zones.map((z) => ({ value: z, label: zoneFull(z) }))} value={zone} onChange={(z) => { setZone(z); setN(PAGE); }} comboboxProps={{ withinPortal: true }} />
          <Button size="sm" variant="default" onClick={csv}>Download CSV</Button>
        </Group>
      </Group>
      <Table.ScrollContainer minWidth={900}>
        <Table striped={false} highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {COLS.map((c) => (
                <Table.Th key={c.key} ta={c.num ? 'right' : undefined} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  <Group gap={2} wrap="nowrap" justify={c.num ? 'flex-end' : 'flex-start'}>
                    <UnstyledButton onClick={() => click(c.key)} fz="sm" fw={600}>
                      {c.label}{sort.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                    </UnstyledButton>
                    {c.term && <Info terms={c.term} size={13} />}
                  </Group>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.slice(0, n).map((r) => {
              const ratio = vsHub(r);
              return (
                <Table.Tr key={r.code} bg={r.code === selected ? 'var(--mantine-color-accent-light)' : undefined}>
                  <Table.Td ta="right" className="tnum">{r.rank}</Table.Td>
                  <Table.Td>
                    <UnstyledButton onClick={() => onSelect(r.code)} aria-current={r.code === selected ? 'true' : undefined}>
                      <Group gap={6} wrap="nowrap">
                        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 5, flex: 'none', background: heatColor(r.rev, breaks, mode), border: '1px solid var(--mantine-color-default-border)' }} />
                        <Text size="sm" fw={600} c="bright" ff="monospace">{r.code}</Text>
                      </Group>
                      {r.lat == null && <Text size="xs" c="dimmed">not on map</Text>}
                    </UnstyledButton>
                  </Table.Td>
                  <Table.Td><Text size="sm">{r.lz ?? '–'}</Text></Table.Td>
                  <Table.Td ta="right" className="tnum" fw={600}>{usd(r.rev, 1)}</Table.Td>
                  <Table.Td ta="right" className="tnum">{ratio == null ? '–' : `${ratio.toFixed(1)}×`}</Table.Td>
                  <Table.Td ta="right" className="tnum">{usd(r.da_rev, 1)}</Table.Td>
                  <Table.Td ta="right" className="tnum">{pct(r.capture)}</Table.Td>
                  <Table.Td ta="right" className="tnum">{pct(r.top10)}</Table.Td>
                  <Table.Td ta="right" className="tnum">{r.cycles.toFixed(0)}</Table.Td>
                  <Table.Td ta="right" className="tnum">{usd(r.spread, 0)}</Table.Td>
                  <Table.Td ta="right" className="tnum">{r.corr_hub == null ? '–' : r.corr_hub.toFixed(2)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Group justify="space-between" mt="sm" wrap="wrap">
        <Text size="xs" c="dimmed">Showing {Math.min(n, rows.length)} of {rows.length}. Hubs on the same run: {data.hubs.map((h) => `${h.code} ${usd(h.rev, 0)}`).join(' · ')}.</Text>
        {n < rows.length && (
          <Group gap="xs">
            <Button size="xs" variant="default" onClick={() => setN((v) => v + 100)}>Show 100 more</Button>
            <Button size="xs" variant="subtle" onClick={() => setN(rows.length)}>Show all</Button>
          </Group>
        )}
      </Group>
    </Paper>
  );
}
