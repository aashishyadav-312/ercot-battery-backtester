import { Group, Select, SimpleGrid } from '@mantine/core';
import { useApp } from '../state';
import { locationGroups } from '../data/analytics';
import { DEGS, DURATIONS, YEARS } from '../data/loader';
import { yearLabel } from '../data/format';
import { locFull } from '../data/site';

/** Top-bar selectors: Location (hubs and nodes grouped), Duration, Year, Degradation. */
export function Selectors({ fullWidth = false }: { fullWidth?: boolean }) {
  const { sel, setSel, index } = useApp();
  const g = index ? locationGroups(index) : { hubs: [], nodes: [] };
  const w = (n: number) => (fullWidth ? '100%' : n);
  const common = { size: 'sm' as const, allowDeselect: false, comboboxProps: { withinPortal: true } };
  const label = (l: string) => (fullWidth ? l : undefined);
  const location = (
    <Select
      {...common} w={w(250)} aria-label="Location" label={label('Location')}
      data={[
        { group: 'Hubs', items: g.hubs.map((c) => ({ value: c, label: locFull(c) })) },
        { group: 'Resource nodes', items: g.nodes.map((c) => ({ value: c, label: locFull(c) })) },
      ]}
      value={sel.location} onChange={(v) => v && setSel({ location: v })} searchable
    />
  );
  const duration = (
    <Select
      {...common} w={w(108)} aria-label="Duration" label={label('Duration')}
      data={DURATIONS.map((d) => ({ value: String(d), label: `${d}-hour` }))}
      value={String(sel.duration)} onChange={(v) => v && setSel({ duration: Number(v) })}
    />
  );
  const year = (
    <Select
      {...common} w={w(120)} aria-label="Year" label={label('Year')}
      data={YEARS.map((y) => ({ value: String(y), label: yearLabel(y) }))}
      value={String(sel.year)} onChange={(v) => v && setSel({ year: Number(v) })}
    />
  );
  const deg = (
    <Select
      {...common} w={w(172)} aria-label="Degradation cost" label={label('Degradation cost')}
      data={DEGS.map((d) => ({ value: String(d), label: `Degr. $${d}/MWh` }))}
      value={String(sel.deg)} onChange={(v) => v != null && setSel({ deg: Number(v) })}
    />
  );
  if (fullWidth) {
    // Phone layout: location on its own row, then duration/year, then degradation.
    return (
      <SimpleGrid cols={2} spacing="xs" role="group" aria-label="Scenario selectors">
        <div style={{ gridColumn: 'span 2' }}>{location}</div>
        {duration}{year}
        <div style={{ gridColumn: 'span 2' }}>{deg}</div>
      </SimpleGrid>
    );
  }
  return (
    <Group gap="xs" wrap="nowrap" role="group" aria-label="Scenario selectors">
      {location}{duration}{year}{deg}
    </Group>
  );
}
