import { Group, Stack, Text, useComputedColorScheme } from '@mantine/core';
import { Info } from '../Info';
import { markerSize, rampAt, type Domain } from './scale';
import { pct, usd } from '../../data/format';

/** Legend for the map: what size, colour and shape mean. */
export function MapLegend({ domain }: { domain: Domain }) {
  const mode = useComputedColorScheme('light');
  const stops = Array.from({ length: 6 }, (_, i) => rampAt(i / 5, mode)).join(', ');
  const sizes = [domain.revMax * 0.25, domain.revMax * 0.6, domain.revMax].map((v) => Math.round(v / 10) * 10);
  const fill = rampAt(0.55, mode);
  const outline = 'var(--mantine-color-default-border)';
  return (
    <Group gap="xl" align="flex-start" role="group" aria-label="Map legend" mt="sm" wrap="wrap">
      <Stack gap={6}>
        <Group gap={2}><Text size="xs" c="dimmed" fw={560}>Size: revenue ($/kW-yr)</Text><Info terms="usd_per_kw_yr" size={14} /></Group>
        <Group gap={10} align="flex-end" wrap="nowrap">
          {sizes.map((v) => {
            const d = markerSize(v, domain);
            return (
              <Stack key={v} gap={2} align="center">
                <svg width={d + 2} height={d + 2} aria-hidden="true"><circle cx={(d + 2) / 2} cy={(d + 2) / 2} r={d / 2} fill={fill} stroke={outline} strokeWidth="1" /></svg>
                <Text size="xs" c="dimmed" className="tnum">{usd(v, 0)}</Text>
              </Stack>
            );
          })}
        </Group>
      </Stack>
      <Stack gap={6}>
        <Group gap={2}><Text size="xs" c="dimmed" fw={560}>Colour: capture rate</Text><Info terms="capture_rate" size={14} /></Group>
        <div style={{ width: 170, height: 10, borderRadius: 5, background: `linear-gradient(to right, ${stops})`, border: `1px solid ${outline}` }} aria-hidden="true" />
        <Group justify="space-between" wrap="nowrap" w={170}>
          <Text size="xs" c="dimmed" className="tnum">{pct(domain.capMin)}</Text>
          <Text size="xs" c="dimmed" className="tnum">{pct(domain.capMax)}</Text>
        </Group>
      </Stack>
      <Stack gap={6}>
        <Text size="xs" c="dimmed" fw={560}>Shape</Text>
        <Group gap="md" wrap="wrap">
          <Group gap={6} wrap="nowrap">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill={fill} stroke={outline} /></svg>
            <Text size="xs" c="dimmed">Hub (area marker)</Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill={fill} stroke={outline} /></svg>
            <Text size="xs" c="dimmed">Resource node (plant)</Text>
          </Group>
        </Group>
      </Stack>
    </Group>
  );
}
