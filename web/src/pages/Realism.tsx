import { useEffect, useState } from 'react';
import { List, Paper, Stack, Text, Title } from '@mantine/core';
import { CaptureCard, MonthlyRealismCard, RealismKpis, RtcbAllCard, RtcbCard } from '../components/realism';
import { useApp } from '../state';
import { useSelectedRun } from '../hooks';
import { loadRtcb } from '../data/loader';
import type { Rtcb } from '../data/types';
import { PageHeader, RunStatus } from './RunHeader';
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
      <PageHeader title="Reality check" hero />
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
            <b>Day-ahead plan.</b> The battery plans each day on day-ahead prices, known the day before, sticks to that plan and is
            paid real-time prices. It is one simple strategy, not what a skilled operator would do.
          </List.Item>
          <List.Item>
            <b>Capture rate.</b> Day-ahead plan revenue divided by perfect-foresight revenue on the same days. When real-time prices
            move against the plan, the plan can lose money on a day; perfect foresight never does.
          </List.Item>
          <List.Item>
            <b>What changed, not why.</b> Revenue, spreads and volatility after Dec 5, 2025 are measured. Battery capacity, load, gas
            prices, weather and transmission changed too, and this model cannot separate them from RTC+B.
          </List.Item>
          <List.Item>
            <b>Energy only, short windows.</b> The original cards measure arbitrage; the energy-and-ancillary card is a separate
            screening model. Each window is under a year, so a few spike days can swing the comparison.
          </List.Item>
        </List>
      </Section>
    </Stack>
  );
}
