import { useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Group, Paper, SegmentedControl, Select, Skeleton, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { PageHeader } from './Overview';
import { TexasMap, type Focus, type HeatLayer, type MapPoint } from '../components/map/TexasMap';
import { HeatLegend, NodePanel, TopNodesTable, heatScenario } from '../components/map/heat';
import { MapLegend } from '../components/map/MapLegend';
import { MapPanel } from '../components/map/MapPanel';
import { domainOf, quantileBreaks } from '../components/map/scale';
import { Info } from '../components/Info';
import { useApp } from '../state';
import { useLocations, useTexas } from '../hooks';
import type { NodesFile } from '../data/types';
import { findRun, loadNodes } from '../data/loader';
import { pct, usd, yearLabel } from '../data/format';
import { SITE, locFull, zoneFull } from '../data/site';

type Mode = 'detailed' | 'heat';
const MODE_KEY = 'map-mode';
function initialMode(): Mode {
  try {
    if (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('view') === 'heat') return 'heat';
    return window.localStorage.getItem(MODE_KEY) === 'heat' ? 'heat' : 'detailed';
  } catch {
    return 'detailed';
  }
}

export default function MapPage() {
  const { sel, setSel, index } = useApp();
  const locs = useLocations();
  const texas = useTexas();
  const phone = useMediaQuery('(max-width: 48em)');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [mode, setModeState] = useState<Mode>(initialMode);
  const [all, setAll] = useState<{ data: NodesFile | null; error?: string }>({ data: null });
  const [heatSel, setHeatSel] = useState<string | null>(null);
  const heatOn = mode === 'heat';
  // The all-node file is fetched only once heat mode is switched on (and then cached by the loader).
  useEffect(() => {
    if (!heatOn || all.data) return;
    let live = true;
    loadNodes().then((data) => live && setAll({ data })).catch((e) => live && setAll({ data: null, error: String(e) }));
    return () => { live = false; };
  }, [heatOn, all.data]);
  const setMode = (m: Mode) => {
    setModeState(m);
    setHeatSel(null);
    try { window.localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable: mode is per visit */ }
  };
  const breaks = useMemo(() => (all.data ? quantileBreaks(all.data.nodes.map((n) => n.rev)) : []), [all.data]);

  const list = locs.data?.locations;
  const domain = useMemo(() => (index ? domainOf(index) : null), [index]);
  const points: MapPoint[] = useMemo(
    () => (list && index ? list.map((loc) => {
      if (heatOn && all.data) {
        // Heat mode: every marker uses the all-node run (one standard configuration), so colours compare like with like.
        const r = all.data.nodes.find((n) => n.code === loc.code) ?? all.data.hubs.find((h) => h.code === loc.code);
        return { loc, revenue: r?.rev ?? null, capture: r?.capture ?? null };
      }
      const row = findRun(index, sel, loc.code);
      return { loc, revenue: row?.revenue_per_kw_year ?? null, capture: row?.capture_rate ?? null };
    }) : []),
    [list, index, sel, heatOn, all.data],
  );
  const heat: HeatLayer | null = heatOn && all.data ? { nodes: all.data.nodes, breaks, selected: heatSel } : null;

  const choose = (code: string | null) => {
    if (!code) return;
    if (list?.some((l) => l.code === code)) {
      setHeatSel(null);
      setSel({ location: code });
    } else {
      setHeatSel(code);
    }
    setFocus({ code, n: Date.now() });
  };
  const heatNode = heatSel && all.data ? all.data.nodes.find((n) => n.code === heatSel) : undefined;

  const error = locs.error ?? texas.error ?? (heatOn ? all.error : undefined);
  const geo = texas.data;
  const ready = list && geo && domain && index && (!heatOn || all.data);
  const selected = list?.find((l) => l.code === sel.location) ?? list?.[0];
  const scenario = heatOn && all.data ? heatScenario(all.data.meta) : `${sel.duration}-hour battery, ${yearLabel(sel.year)}, $${sel.deg}/MWh degradation`;
  const searchData = heatOn && all.data
    ? [
        ...(list ?? []).map((l) => ({ value: l.code, label: `${locFull(l.code)}${l.substation ? ` · ${l.substation}` : ''}` })),
        ...all.data.nodes.filter((n) => !list?.some((l) => l.code === n.code)).map((n) => ({ value: n.code, label: `${n.code}${n.sub ? ` · ${n.sub}` : ''}${n.lz ? ` · ${n.lz}` : ''}` })),
      ]
    : (list ?? []).map((l) => ({ value: l.code, label: `${locFull(l.code)}${l.substation ? ` · ${l.substation}` : ''}` }));

  return (
    <Stack gap="lg">
      <PageHeader title="Map" hero />
      {error && <Alert color="red" title="Could not load the map data">{error}</Alert>}
      <div style={{ display: 'grid', gap: 'var(--mantine-spacing-lg)', gridTemplateColumns: phone ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(300px, 360px)', alignItems: 'start' }}>
        <Paper withBorder p={{ base: 'sm', sm: 'lg' }} component="section" aria-label="Texas map of locations" data-interactive>
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm" mb="sm">
            <div>
              <Text component="h3" fw={620} size="md" lh={1.3} c="bright" m={0}>{heatOn ? 'Where congestion pays: every resource node' : 'Revenue by location'}</Text>
              <Text size="sm" c="dimmed" lh={1.45}>
                {scenario}. {heatOn ? 'Colour = $/kW-yr; the 10 detailed locations are outlined and labelled. ' : ''}Click a marker for details; scroll or pinch to zoom, drag to pan.
              </Text>
            </div>
            <Group gap="sm" wrap="wrap" w={{ base: '100%', sm: 'auto' }}>
              <SegmentedControl
                aria-label="Map mode" size="sm" value={mode} onChange={(v) => setMode(v as Mode)}
                data={[{ value: 'detailed', label: '10 locations' }, { value: 'heat', label: 'All nodes (heat)' }]}
              />
              <Select
                aria-label="Find a location" placeholder={heatOn ? 'Find any node…' : 'Find a location…'} searchable size="sm" w={{ base: '100%', sm: 250 }}
                data={searchData} limit={heatOn ? 50 : undefined}
                value={null} onChange={choose} nothingFoundMessage="No match" comboboxProps={{ withinPortal: true }}
              />
            </Group>
          </Group>
          {heatOn && (
            <Text size="xs" c="dimmed" mb="xs">The top-bar selectors don’t change this view: the all-node run uses one standard configuration. Switch to “10 locations” for the full grid of sizes, years and degradation costs.</Text>
          )}
          {ready ? (
            <>
              <TexasMap
                geo={geo} points={points} domain={domain} selected={sel.location} onSelect={choose} focus={focus} heat={heat}
                height={phone ? 400 : 520}
                label={heat && all.data
                  ? `Map of Texas showing ${all.data.meta.n_nodes_geocoded} resource nodes coloured by revenue per kW-year in ${breaks.length + 1} equal-count classes, with the 10 detailed locations outlined. The Top nodes table below lists every node.`
                  : `Map of Texas showing ${list.filter((l) => l.geocoded).length} locations sized by revenue and coloured by capture rate. A table of the same figures follows.`}
              />
              {heat && all.data ? <HeatLegend breaks={breaks} meta={all.data.meta} /> : <MapLegend domain={domain} />}
            </>
          ) : (
            <Skeleton h={phone ? 400 : 520} radius="md" aria-hidden />
          )}
        </Paper>
        {ready && heatNode && all.data ? (
          <NodePanel node={heatNode} data={all.data} onDetailed={(c) => choose(c)} />
        ) : ready && selected ? <MapPanel loc={selected} locations={list} index={index} /> : <Skeleton h={phone ? 300 : 560} radius="lg" aria-hidden />}
      </div>

      {ready && heatOn && all.data && (
        <TopNodesTable data={all.data} breaks={breaks} selected={heatSel ?? sel.location} onSelect={choose} />
      )}

      {ready && !heatOn && (
        <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="All locations">
          <Text component="h3" fw={620} size="md" c="bright" m={0} mb={2}>All locations</Text>
          <Text size="sm" c="dimmed" mb="sm">The same figures as the map, for keyboard use and for nodes without a marker. Select a name to open its panel.</Text>
          <Table.ScrollContainer minWidth={560}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Location</Table.Th><Table.Th>Type</Table.Th><Table.Th>Load zone</Table.Th>
                  <Table.Th ta="right">$/kW-yr <Info terms="usd_per_kw_yr" size={13} /></Table.Th>
                  <Table.Th ta="right">Capture <Info terms="capture_rate" size={13} /></Table.Th>
                  <Table.Th>On map</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[...points].sort((a, b) => (b.revenue ?? -1) - (a.revenue ?? -1)).map(({ loc, revenue, capture }) => (
                  <Table.Tr key={loc.code} bg={loc.code === sel.location ? 'var(--mantine-color-accent-light)' : undefined}>
                    <Table.Td>
                      <UnstyledButton onClick={() => choose(loc.code)} aria-current={loc.code === sel.location ? 'true' : undefined}>
                        <Text size="sm" fw={600} c="bright">{loc.name}</Text>
                        <Text size="xs" c="dimmed" ff="monospace">{loc.code}</Text>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td>{loc.type === 'hub' ? 'Hub' : 'Resource node'}</Table.Td>
                    <Table.Td>{zoneFull(loc.load_zone)}</Table.Td>
                    <Table.Td ta="right">{usd(revenue, 1)}</Table.Td>
                    <Table.Td ta="right">{pct(capture)}</Table.Td>
                    <Table.Td>{loc.geocoded ? (loc.type === 'hub' ? `Yes, at ${loc.marker_city}` : 'Yes') : 'No: not geocoded'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {locs.data && (
        <Text size="xs" c="dimmed" lh={1.6} maw={900}>
          <b>Notes.</b> {locs.data.meta.hub_footnote} Resource-node markers sit at the plant’s location in the EIA-860 {locs.data.meta.eia_year} survey, matched to the ERCOT node by name,
          so they show roughly where the node is, not its exact electrical bus. {locs.data.meta.n_nodes_geocoded} of {locs.data.meta.n_nodes} nodes could be placed; unplaced nodes are never guessed.
          Texas outline and counties: US Census boundaries via us-atlas. Every match and its evidence is in the{' '}
          <Anchor size="xs" href={`${SITE.repo}/blob/main/results/geocoding_log.md`} target="_blank" rel="noreferrer">geocoding log</Anchor>
          {heatOn && all.data && (
            <>
              {' '}and, for all nodes, the{' '}
              <Anchor size="xs" href={`${SITE.repo}/blob/main/results/geocoding_log_all_nodes.md`} target="_blank" rel="noreferrer">all-node geocoding log</Anchor>
              {' '}({all.data.meta.n_nodes_geocoded} of {all.data.meta.n_nodes} nodes with complete {all.data.meta.year} data placed; the rest are in the table but not on the map).
              {' '}Heat mode covers {all.data.meta.n_nodes} of {all.data.meta.n_nodes_in_data} resource nodes in ERCOT’s {all.data.meta.year} prices; nodes that started, retired or had data gaps during the year are left out
            </>
          )}.
        </Text>
      )}
    </Stack>
  );
}
