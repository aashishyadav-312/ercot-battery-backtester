import { useEffect, useState } from 'react';
import { List, Paper, Stack, Text, Title } from '@mantine/core';
import { CaptureCard, MonthlyRealismCard, RealismKpis, RtcbAllCard, RtcbCard } from '../components/realism';
import { useApp } from '../state';
import { useSelectedRun } from '../hooks';
import { loadRtcb } from '../data/loader';
import type { Rtcb } from '../data/types';
import { PageHeader, RunStatus } from './Overview';
import { Ancillary } from '../components/Ancillary';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label={title}>
      <Title order={2} fz={20} mb="sm" style={{ letterSpacing: '-0.014em' }}>{title}</Title>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}

export default function Realism() {
  const { sel, index } = useApp();
  const { run } = useSelectedRun();
  const [rtcb, setRtcb] = useState<Rtcb | null>(null);
  useEffect(() => {
    loadRtcb().then(setRtcb).catch(() => setRtcb(null));
  }, []);

  return (
    <Stack gap="lg">
      <PageHeader title="Realism" hero />
      <RunStatus />
      <RealismKpis run={run} />
      <CaptureCard sel={sel} index={index} />
      <MonthlyRealismCard run={run} />

      <Title order={2} fz={{ base: 22, md: 26 }} mt="md" style={{ letterSpacing: '-0.02em' }}>Before and after RTC+B</Title>
      <Text c="dimmed" maw={760} lh={1.55} mt={-8}>
        ERCOT&rsquo;s real-time co-optimization plus batteries (RTC+B) went live on Dec 5, 2025. These cards compare the same calendar days a
        year apart, so the seasons match. They show what changed. They don&rsquo;t show why.
      </Text>
      <RtcbCard sel={sel} rtcb={rtcb} />
      <RtcbAllCard sel={sel} rtcb={rtcb} index={index} />
      <Ancillary comparison />

      <Section title="How to read this page">
        <List size="sm" spacing={8} maw={820}>
          <List.Item>
            <b>DA-scheduled</b> means the battery plans each day on the day-ahead prices, which are known the day before, then sticks to that
            plan and is paid real-time prices. It is one simple, reproducible strategy, not what a skilled operator would do. Real operators
            re-forecast through the day, sell ancillary services, and bid around their state of charge, so they can beat it or fall short of it.
          </List.Item>
          <List.Item>
            <b>Capture rate</b> is DA-scheduled revenue divided by perfect-foresight revenue on the same days. It says how much of the
            theoretical arbitrage one plain forecast actually reaches. On a day when real-time prices move against the plan, the DA schedule
            can lose money; perfect foresight never does.
          </List.Item>
          <List.Item>
            <b>Not a market position.</b> Here the day-ahead price is only used as a forecast. If the battery had sold its schedule in the
            day-ahead market and followed it exactly, it would have been paid day-ahead prices instead (shown in the capture-rate KPI).
          </List.Item>
          <List.Item>
            <b>What changed vs. what caused it.</b> Revenue, price spreads and volatility after Dec 5, 2025 are measured facts. Calling the
            difference an effect of RTC+B is not supported: battery capacity kept growing quickly, and load, gas prices, weather and
            transmission all changed between the two windows. This model cannot separate RTC+B from those, above all from fleet growth.
          </List.Item>
          <List.Item>
            <b>Energy-only comparison.</b> The original cards above measure arbitrage. The separate energy-and-ancillary card adds a capacity-only screening model.
            A fall in arbitrage revenue says nothing on its own about total battery revenue.
          </List.Item>
          <List.Item>
            <b>Short windows, lumpy years.</b> Each window is under a year, and a handful of spike days can carry a large share of revenue,
            so a single storm in either window can swing the comparison.
          </List.Item>
        </List>
      </Section>
    </Stack>
  );
}
