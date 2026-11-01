import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Group, Paper, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Card, type CsvData } from '../Card';
import { Chart, axisBase, legendBase, tooltipBase, type ChartTheme } from '../Chart';
import { ChartSkeleton } from '../Skeletons';
import { Info } from '../Info';
import { useApp } from '../../state';
import { fmtDate, usd } from '../../data/format';
import { locFull } from '../../data/site';
import { buildSteps, clock, span, type Block } from '../../data/walkthrough';
import type { WalkDay, Walkthrough as WalkData } from '../../data/types';

/** "12am", "4am", "12pm": axis tick for interval index i (every 4 hours). */
const tick = (i: number) => {
  const h = Math.floor(i / 4);
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
};

/** Chart: price (with day-ahead for reference), battery output, state of charge. Shades the selected block. */
function dayChart(w: WalkData, day: WalkDay, block: Block | undefined, expanded: boolean, compact: boolean) {
  const P = w.meta.power_mw;
  const E = w.meta.energy_mwh;
  const H = expanded ? 720 : compact ? 430 : 480;
  const top = 30;
  const bottom = 30;
  const gap = 42;
  const plot = H - top - bottom - gap * 2;
  const hPrice = Math.round(plot * 0.5);
  const hMw = Math.round(plot * 0.27);
  const hSoc = plot - hPrice - hMw;
  const left = compact ? 54 : 62;
  const grids = [
    { left, right: 12, top, height: hPrice },
    { left, right: 12, top: top + hPrice + gap, height: hMw },
    { left, right: 12, top: top + hPrice + hMw + gap * 2, height: hSoc },
  ];
  const idx = Array.from({ length: 96 }, (_, i) => String(i));
  const da = day.da_price ? day.price.map((_, i) => day.da_price![Math.floor(i / 4)]) : undefined;
  const area = (color: string) =>
    block
      ? { silent: true, itemStyle: { color, opacity: 0.16 }, data: [[{ xAxis: String(block.start) }, { xAxis: String(Math.min(block.end, 95)) }]] }
      : undefined;
  const blockColor = (t: ChartTheme) => (block?.dir === 'charge' ? t.charge : t.discharge);
  const side = (sign: 1 | -1) => day.net_mw.map((v) => (v * sign > 0.01 ? v : 0));
  return {
    height: H,
    build: (t: ChartTheme) => {
      const ab = axisBase(t);
      const xAxis = (gi: number, labels: boolean) => ({
        type: 'category' as const, gridIndex: gi, data: idx, boundaryGap: false, ...ab,
        axisLabel: { ...ab.axisLabel, show: labels, interval: (i: number) => i % (compact ? 16 : 8) === 0, formatter: (v: string) => tick(Number(v)) },
        splitLine: { show: false },
        axisPointer: { show: true },
      });
      const money = (v: number) => `$${v.toLocaleString('en-US')}`;
      return {
        animationDurationUpdate: 360,
        title: [
          { text: 'Price, $/MWh', left: 0, top: 0 },
          { text: 'Battery output, MW', left: 0, top: grids[1].top - 30 },
          { text: 'Battery charge, MWh', left: 0, top: grids[2].top - 30 },
        ].map((x) => ({ ...x, textStyle: { color: t.muted, fontSize: 11, fontWeight: 560 } })),
        legend: { ...legendBase(t), left: 'auto', right: 12, top: 0, data: da ? ['Real-time', 'Day-ahead'] : ['Real-time'] },
        grid: grids,
        tooltip: {
          ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'line', link: [{ xAxisIndex: 'all' }], lineStyle: { color: t.axis } },
          formatter: (p: { dataIndex: number }[]) => {
            const i = p[0].dataIndex;
            const mw = day.net_mw[i];
            const doing = mw > 0.01 ? `selling ${Math.round(mw)} MW` : mw < -0.01 ? `buying ${Math.round(-mw)} MW` : 'idle';
            return (
              `<b>${clock(i)}</b><br/>Real-time price: ${money(day.price[i])}/MWh` +
              (da ? `<br/>Day-ahead price: ${money(da[i])}/MWh` : '') +
              `<br/>Battery: ${doing}<br/>Charge: ${day.soc_mwh[i].toFixed(0)} of ${E} MWh`
            );
          },
        },
        xAxis: [xAxis(0, false), xAxis(1, false), xAxis(2, true)],
        yAxis: [
          { type: 'value' as const, gridIndex: 0, ...ab, splitNumber: 3, axisLabel: { ...ab.axisLabel, formatter: (v: number) => money(v) } },
          {
            type: 'value' as const, gridIndex: 1, min: -P, max: P, interval: P, ...ab,
            axisLabel: { ...ab.axisLabel, formatter: (v: number) => (v > 0 ? `${v} sell` : v < 0 ? `${-v} buy` : '0') },
          },
          { type: 'value' as const, gridIndex: 2, min: 0, max: E, interval: E / 2, ...ab, axisLabel: { ...ab.axisLabel, formatter: (v: number) => String(v) } },
        ],
        series: [
          {
            id: 'rt', name: 'Real-time', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: day.price, step: 'end', showSymbol: false,
            lineStyle: { width: 1.6, color: t.text }, itemStyle: { color: t.text }, z: 3,
            markArea: area(blockColor(t)),
          },
          ...(da
            ? [{
                id: 'da', name: 'Day-ahead', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: da, step: 'end', showSymbol: false,
                lineStyle: { width: 1.4, color: t.baseline, type: 'dashed' }, itemStyle: { color: t.baseline }, z: 2,
              }]
            : []),
          {
            id: 'sell', name: 'Selling', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: side(1), step: 'end', showSymbol: false,
            lineStyle: { width: 1, color: t.discharge }, itemStyle: { color: t.discharge }, areaStyle: { color: t.discharge, opacity: 0.85 },
            markArea: area(blockColor(t)),
          },
          {
            id: 'buy', name: 'Buying', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: side(-1), step: 'end', showSymbol: false,
            lineStyle: { width: 1, color: t.charge }, itemStyle: { color: t.charge }, areaStyle: { color: t.charge, opacity: 0.85 },
          },
          {
            id: 'soc', name: 'Charge', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: day.soc_mwh, showSymbol: false, step: 'end',
            lineStyle: { width: 1.6, color: t.series[2] }, itemStyle: { color: t.series[2] },
            areaStyle: { color: t.series[2], opacity: 0.16 },
            markArea: area(blockColor(t)),
          },
        ],
      };
    },
  };
}

function csvFor(w: WalkData, day: WalkDay): CsvData {
  return {
    filename: `walkthrough_${w.meta.location}_${day.date}.csv`,
    headers: ['time_central', 'rt_price_usd_per_mwh', 'da_price_usd_per_mwh', 'battery_net_mw', 'state_of_charge_mwh'],
    rows: day.price.map((p, i) => [clock(i), p, day.da_price ? day.da_price[Math.floor(i / 4)] : null, day.net_mw[i], day.soc_mwh[i]]),
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" lh={1.35}>{label}</Text>
      <Text fw={620} c="bright" className="tnum" fz={{ base: 'md', sm: 17 }} lh={1.3}>{value}</Text>
    </Box>
  );
}

/** Option list for the day picker: the ten best days, then the ordinary ones. */
function dayOptions(days: WalkDay[]) {
  const label = (d: WalkDay) => `${fmtDate(d.date)} · ${d.label} · ${usd(d.revenue, 0)}`;
  const top = days.filter((d) => d.kind === 'top');
  const rest = days.filter((d) => d.kind !== 'top');
  return [
    { group: 'The ten best days of the year', items: top.map((d) => ({ value: d.date, label: label(d) })) },
    { group: 'Ordinary days, for contrast', items: rest.map((d) => ({ value: d.date, label: label(d) })) },
  ].filter((g) => g.items.length);
}

export function Walkthrough({ data, error }: { data?: WalkData; error?: string }) {
  const { go } = useApp();
  const compact = useMediaQuery('(max-width: 48em)') ?? false;
  const [date, setDate] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const day = useMemo(() => {
    if (!data) return undefined;
    return data.days.find((d) => d.date === date) ?? data.days[0];
  }, [data, date]);
  const plan = useMemo(() => (data && day ? buildSteps(data, day) : undefined), [data, day]);

  useEffect(() => setStep(0), [day?.date]);

  const last = plan ? plan.steps.length - 1 : 0;
  const cur = plan?.steps[Math.min(step, last)];
  const block = cur && plan && cur.block != null ? plan.blocks[cur.block] : undefined;
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const next = useCallback(() => setStep((s) => Math.min(last, s + 1)), [last]);

  if (error) return <Alert color="red" title="Could not load the walkthrough data">{error}</Alert>;
  if (!data || !day || !plan || !cur) {
    return (
      <Stack gap="md" aria-busy="true">
        <ChartSkeleton h={430} variant="block" />
      </Stack>
    );
  }

  const chart = (expanded: boolean) => dayChart(data, day, block, expanded, compact);
  const where = locFull(data.meta.location);
  const heading =
    block ? `${cur.title} · ${span(block.start, block.end)}` : cur.title;

  return (
    <Stack
      gap="md"
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('input, [role="combobox"], [role="listbox"]')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      }}
    >
      <Select
        label="Pick a day" description={`${data.days.length} hand-picked days at ${where}, ${data.meta.year}. The 100 MW, ${data.meta.duration_h}-hour battery plays each one with perfect foresight.`}
        data={dayOptions(data.days)} value={day.date} onChange={(v) => v && setDate(v)} allowDeselect={false} maw={620}
        comboboxProps={{ withinPortal: true }}
      />

      <Card
        title={`${where.replace(/ \(.*\)$/, '')}, ${fmtDate(day.date)}`}
        subtitle={`${day.label}. Black line: real-time price. ${day.da_price ? 'Dashed: day-ahead price. ' : ''}Orange: selling. Blue: charging. Green: how full the battery is.`}
        csv={() => csvFor(data, day)}
      >
        {(ex) => {
          const c = chart(ex);
          return <Chart build={c.build} height={c.height} label={`Chart of ${where} 15-minute prices on ${fmtDate(day.date)} with the battery's charging, discharging and state of charge`} />;
        }}
      </Card>

      <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="Step-through explanation">
        <Group justify="space-between" align="center" mb={6} wrap="nowrap" gap="sm">
          <Text size="sm" fw={600} c="var(--app-accent-text)" className="tnum">Step {Math.min(step, last) + 1} of {plan.steps.length}</Text>
          <Group gap={6} wrap="nowrap" role="group" aria-label="Jump to step">
            {plan.steps.map((s, i) => (
              <button
                key={i} type="button" onClick={() => setStep(i)} aria-label={`Go to step ${i + 1}: ${s.title}`} aria-current={i === step ? 'step' : undefined}
                style={{
                  width: i === step ? 22 : 8, height: 8, borderRadius: 4, border: 0, padding: 0, cursor: 'pointer', flexShrink: 0,
                  background: i === step ? 'var(--mantine-primary-color-filled)' : 'var(--app-hairline-strong)',
                  transition: 'width 220ms var(--app-ease), background 220ms',
                }}
              />
            ))}
          </Group>
        </Group>
        <Title order={3} fz={20} mb="xs" style={{ letterSpacing: '-0.014em' }}>
          {heading}
          {cur.block == null && step === 0 && <Info terms="perfect_foresight" />}
        </Title>
        <Stack gap={8} aria-live="polite" key={`${day.date}-${step}`} className="app-fade">
          {cur.body.map((t, i) => <Text key={i} size="md" lh={1.6} maw={760}>{t}</Text>)}
        </Stack>
        <SimpleGrid cols={{ base: 2, sm: Math.min(4, cur.stats.length) }} spacing="md" mt="md" pt="md" style={{ borderTop: '1px solid var(--app-hairline)' }}>
          {cur.stats.map((s) => <Stat key={s.label} {...s} />)}
        </SimpleGrid>
        <Group mt="lg" gap="sm">
          <Button variant="default" onClick={prev} disabled={step === 0} aria-label="Previous step">Prev</Button>
          {step < last ? (
            <Button onClick={next} aria-label="Next step">Next</Button>
          ) : (
            <Button variant="light" onClick={() => setStep(0)}>Start over</Button>
          )}
          <Text size="xs" c="dimmed" visibleFrom="sm">Tip: arrow keys also step through.</Text>
        </Group>
      </Paper>

      <Group gap="sm">
        <Button
          variant="light"
          onClick={() => go('overview', { location: data.meta.location, duration: data.meta.duration_h, year: data.meta.year, deg: data.meta.deg_cost_per_mwh })}
        >
          See this battery across the whole year
        </Button>
        <Button variant="subtle" onClick={() => go('dispatch', { location: data.meta.location, duration: data.meta.duration_h, year: data.meta.year, deg: data.meta.deg_cost_per_mwh })}>
          Typical charge and discharge pattern
        </Button>
      </Group>
    </Stack>
  );
}
