import { useCallback } from 'react';
import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Chart, tooltipBase, type ChartTheme } from '../Chart';
import { Info } from '../Info';
import { useApp, useRun } from '../../state';
import { findRun } from '../../data/loader';
import { MONTHS, pct, usd, yearLabel } from '../../data/format';
import { locFull, locName, zoneFull } from '../../data/site';
import type { IndexRun, LocationRec, Run } from '../../data/types';

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

/** 12-month revenue line for the selected scenario; months not yet in the data (2026 YTD) stay empty. */
function Sparkline({ run }: { run: Run | undefined }) {
  const build = useCallback(
    (t: ChartTheme) => {
      const m = run?.metrics.monthly_revenue_per_kw ?? {};
      const data = MONTHS.map((_, i) => m[String(i + 1)] ?? null);
      return {
        grid: { left: 4, right: 8, top: 10, bottom: 20 },
        tooltip: {
          ...tooltipBase(t), trigger: 'axis',
          formatter: (p: { axisValue: string; value: number | null }[]) => `${p[0].axisValue}: ${p[0].value == null ? '–' : usd(p[0].value, 2)} per kW`,
        },
        xAxis: {
          type: 'category', data: MONTHS, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: t.muted, fontSize: 10, interval: 0, formatter: (v: string) => v[0] },
        },
        yAxis: { type: 'value', show: false, min: 0 },
        series: [{
          id: 'monthly', name: 'monthly', type: 'line', data, symbol: 'circle', symbolSize: 5, showSymbol: true, connectNulls: false,
          lineStyle: { color: t.series[0], width: 2 }, itemStyle: { color: t.series[0] }, areaStyle: { color: t.series[0], opacity: 0.12 },
        }],
      };
    },
    [run],
  );
  return <Chart build={build} height={96} label="Revenue by month, in dollars per kilowatt, for the selected location" />;
}

function Bars({ rows }: { rows: { label: string; value: number | null; strong?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1e-9);
  return (
    <Stack gap={8}>
      {rows.map((r) => (
        <div key={r.label}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text size="xs" c={r.strong ? 'bright' : 'dimmed'} fw={r.strong ? 600 : 400} truncate>{r.label}</Text>
            <Text size="xs" className="tnum" c="bright" fw={600}>{r.value == null ? '–' : usd(r.value, 1)}</Text>
          </Group>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--app-hairline)', marginTop: 3 }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${Math.max(0, ((r.value ?? 0) / max) * 100)}%`, background: r.strong ? 'var(--mantine-color-accent-filled)' : 'var(--mantine-color-gray-5)', transition: 'width 420ms var(--app-ease)' }} />
          </div>
        </div>
      ))}
    </Stack>
  );
}

function provenance(l: LocationRec): string {
  if (l.type === 'hub') return `Shown at ${l.marker_city} as a representative city. A hub is a price average, not a place.`;
  if (!l.geocoded) return 'Not placed on the map: no plant record could be matched to this node.';
  const plants = (l.match.plants ?? []).map((p) => `${p.eia_plant_name}, ${p.county} County`).join('; ');
  const how = { eia860_lmp_node: 'matched by EIA node ID', name_match: 'matched by name', manual_review: 'matched by hand review' }[l.match.method ?? ''] ?? 'matched';
  return `Plant location from EIA-860: ${plants} (${how}${l.match.confidence ? `, ${l.match.confidence} confidence` : ''}).`;
}

/** Side panel for the selected location: headline figures, monthly shape, node vs hub, and links into the other pages. */
export function MapPanel({ loc, locations, index }: { loc: LocationRec; locations: LocationRec[]; index: IndexRun[] | null }) {
  const { sel, go } = useApp();
  const row = index ? findRun(index, sel, loc.code) : undefined;
  const { run } = useRun(row?.file);
  const hubCode = loc.type === 'hub' ? loc.code : loc.nearest_hub;
  const hubRow = index && hubCode ? findRun(index, sel, hubCode) : undefined;
  const scenario = `${sel.duration}-hour, ${yearLabel(sel.year)}, $${sel.deg}/MWh degradation`;
  const ratio = row && hubRow && loc.type === 'node' && hubRow.revenue_per_kw_year > 0 ? row.revenue_per_kw_year / hubRow.revenue_per_kw_year : null;
  const tracked = locations.filter((l) => l.type === 'node' && l.nearest_hub === loc.code);

  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="aside" aria-label={`Details for ${locName(loc.code)}`} aria-live="polite">
      <Stack gap="md">
        <div>
          <Title order={3} fz={22} lh={1.2}>{loc.name}</Title>
          <Text size="xs" c="dimmed" ff="monospace" mt={2}>{loc.code}</Text>
          <Group gap={6} mt="xs">
            <Badge variant="light" color={loc.type === 'hub' ? 'violet' : 'accent'}>{loc.type === 'hub' ? 'Hub' : 'Resource node'}</Badge>
            <Badge variant="light" color="gray">{zoneFull(loc.load_zone)}</Badge>
          </Group>
          <Group gap={2} mt={8} wrap="nowrap" align="flex-start">
            <Text size="xs" c="dimmed" lh={1.5}>
              {loc.type === 'hub' ? `Price average for ${loc.region ?? 'its area'}.` : `${loc.region ?? ''}${loc.substation ? `, near substation ${loc.substation}` : ''}.`}
            </Text>
            <Info terms={loc.type === 'hub' ? ['hub', 'load_zone'] : ['resource_node', 'load_zone']} size={14} />
          </Group>
        </div>

        {!loc.geocoded && (
          <Alert color="yellow" title="Not placed on the map">
            No plant record could be matched to this node, so it has no marker. It is not guessed. See the geocoding log.
          </Alert>
        )}

        <SimpleGrid cols={3} spacing="xs">
          <Stat label="$/kW-yr" term="usd_per_kw_yr" value={row ? usd(row.revenue_per_kw_year, 1) : '–'} />
          <Stat label="Capture" term="capture_rate" value={row ? pct(row.capture_rate, 0) : '–'} />
          <Stat label="Top 10" term="top10_day_share" value={row ? pct(row.top10_day_share, 0) : '–'} />
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt={-8}>{scenario}{row?.annualized ? ', annualized' : ''}.</Text>

        <div>
          <Text size="xs" c="dimmed" fw={560} mb={2}>Revenue by month, $/kW</Text>
          <Sparkline run={run} />
        </div>

        {loc.type === 'node' ? (
          <div>
            <Group gap={6} mb={8} wrap="nowrap">
              <Text size="xs" c="dimmed" fw={560}>Node vs nearest hub</Text>
              {ratio != null && <Badge size="sm" variant="light" color={ratio >= 1 ? 'green' : 'gray'}>{ratio.toFixed(1)}× the hub</Badge>}
            </Group>
            <Bars rows={[
              { label: loc.name, value: row?.revenue_per_kw_year ?? null, strong: true },
              { label: hubCode ? locFull(hubCode) : 'Hub', value: hubRow?.revenue_per_kw_year ?? null },
            ]} />
          </div>
        ) : (
          <div>
            <Text size="xs" c="dimmed" fw={560} mb={8}>Tracked nodes in this hub’s area</Text>
            {tracked.length ? (
              <Bars rows={[
                { label: loc.name, value: row?.revenue_per_kw_year ?? null, strong: true },
                ...tracked.map((n) => ({ label: n.name, value: (index && findRun(index, sel, n.code))?.revenue_per_kw_year ?? null })),
              ]} />
            ) : (
              <Text size="xs" c="dimmed">No resource nodes are tracked in this hub’s area yet.</Text>
            )}
          </div>
        )}

        <Stack gap="xs">
          <Button variant="filled" onClick={() => go('overview', { location: loc.code })}>Open in Overview</Button>
          <Button variant="default" onClick={() => go('compare', { location: loc.code })}>
            {loc.type === 'node' ? 'Compare with hub' : 'Compare locations'}
          </Button>
        </Stack>
        <Text size="xs" c="dimmed" lh={1.5}>{provenance(loc)}</Text>
      </Stack>
    </Paper>
  );
}
