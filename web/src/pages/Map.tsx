import { useMemo, useState } from 'react';
import { Alert, Anchor, Group, Paper, Select, Skeleton, Stack, Switch, Table, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { PageHeader } from './Overview';
import { TexasMap, type Focus, type MapPoint, type QueueLayer } from '../components/map/TexasMap';
import { QueueLegend, QueuePanel } from '../components/map/queue';
import { MapLegend } from '../components/map/MapLegend';
import { MapPanel } from '../components/map/MapPanel';
import { QUEUE_CLASSES, domainOf, quantileBreaks } from '../components/map/scale';
import { Info } from '../components/Info';
import { useApp } from '../state';
import { useContextData, useLocations, useTexas } from '../hooks';
import { queueByKey } from '../data/context';
import { findRun } from '../data/loader';
import { pct, usd, yearLabel } from '../data/format';
import { SITE, locFull, zoneFull } from '../data/site';

/**
 * Atlas > Detailed locations (#/atlas/detailed): the 10 locations with full runs for every year, size and degradation
 * cost, on a zoomable county map with the planned-storage layer. Every resource node in one standard configuration is
 * in the Atlas itself (pages/Atlas.tsx), which replaced this page's former heat mode.
 */
export default function MapPage() {
  const { sel, setSel, index } = useApp();
  const locs = useLocations();
  const texas = useTexas();
  const phone = useMediaQuery('(max-width: 48em)');
  const [focus, setFocus] = useState<Focus | null>(null);
  // Planned-storage layer (Phase 17); context.json is fetched only once the layer is switched on.
  const [queueOn, setQueueOn] = useState(false);
  const context = useContextData();

  const list = locs.data?.locations;
  const domain = useMemo(() => (index ? domainOf(index) : null), [index]);
  const points: MapPoint[] = useMemo(
    () => (list && index ? list.map((loc) => {
      const row = findRun(index, sel, loc.code);
      return { loc, revenue: row?.revenue_per_kw_year ?? null, capture: row?.capture_rate ?? null };
    }) : []),
    [list, index, sel],
  );
  const queue: QueueLayer | null = useMemo(() => {
    if (!queueOn || !context.data) return null;
    const counties = queueByKey(context.data.queue.counties);
    return { counties, breaks: quantileBreaks([...counties.values()].map((c) => c.mw), QUEUE_CLASSES) };
  }, [queueOn, context.data]);

  const choose = (code: string | null) => {
    if (!code) return;
    setSel({ location: code });
    setFocus({ code, n: Date.now() });
  };

  const error = locs.error ?? texas.error;
  const geo = texas.data;
  const ready = list && geo && domain && index;
  const selected = list?.find((l) => l.code === sel.location) ?? list?.[0];
  const scenario = `${sel.duration}-hour battery, ${yearLabel(sel.year)}, $${sel.deg}/MWh degradation`;

  return (
    <Stack gap="lg">
      <PageHeader title="Detailed locations" hero />
      {error && <Alert color="red" title="Could not load the map data">{error}</Alert>}
      <div style={{ display: 'grid', gap: 'var(--mantine-spacing-lg)', gridTemplateColumns: phone ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(300px, 360px)', alignItems: 'start' }}>
        <Paper withBorder p={{ base: 'sm', sm: 'lg' }} component="section" aria-label="Texas map of locations" data-interactive>
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm" mb="sm">
            <div>
              <Text component="h2" fw={620} size="md" lh={1.3} c="bright" m={0}>Revenue by location</Text>
              <Text size="sm" c="dimmed" lh={1.45}>
                {scenario}. Click a marker for details; scroll or pinch to zoom, drag to pan.{' '}
                <Anchor size="sm" href="#/atlas">Every resource node is in the Atlas</Anchor>.
              </Text>
            </div>
            <Select
              aria-label="Find a location" placeholder="Find a location…" searchable size="sm" w={{ base: '100%', sm: 250 }}
              data={(list ?? []).map((l) => ({ value: l.code, label: `${locFull(l.code)}${l.substation ? ` · ${l.substation}` : ''}` }))}
              value={null} onChange={choose} nothingFoundMessage="No match" comboboxProps={{ withinPortal: true }}
            />
          </Group>
          <Switch
            size="sm" mb="xs" checked={queueOn} onChange={(e) => setQueueOn(e.currentTarget.checked)}
            label="Layer: planned battery storage by county"
            description="Shades each county by the battery MW in ERCOT’s interconnection queue. Queued projects may never be built; this is a pipeline, not capacity."
          />
          {queueOn && context.error && <Alert color="red" mb="xs" title="Could not load the queue data">{context.error}</Alert>}
          {ready ? (
            <>
              <TexasMap
                geo={geo} points={points} domain={domain} selected={sel.location} onSelect={choose} focus={focus}
                height={phone ? 400 : 520} queue={queue}
                label={`Map of Texas showing ${list.filter((l) => l.geocoded).length} locations sized by revenue and coloured by capture rate. A table of the same figures follows.`}
              />
              <MapLegend domain={domain} />
              {queue && context.data && <QueueLegend breaks={queue.breaks} queue={context.data.queue} />}
            </>
          ) : (
            <Skeleton h={phone ? 400 : 520} radius="md" aria-hidden />
          )}
        </Paper>
        {ready && selected ? <MapPanel loc={selected} locations={list} index={index} /> : <Skeleton h={phone ? 300 : 560} radius="lg" aria-hidden />}
      </div>

      {queue && context.data && <QueuePanel queue={context.data.queue} />}

      {ready && (
        <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="All locations">
          <Text component="h2" fw={620} size="md" c="bright" m={0} mb={2}>All locations</Text>
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
          <Anchor size="xs" href={`${SITE.repo}/blob/main/results/geocoding_log.md`} target="_blank" rel="noreferrer">geocoding log</Anchor>.
        </Text>
      )}
    </Stack>
  );
}
