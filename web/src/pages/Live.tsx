import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Badge, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { Card } from '../components/Card';
import { Chart, axisBase, legendBase, tooltipBase, type ChartTheme } from '../components/Chart';
import { Info } from '../components/Info';
import { IconWarn } from '../components/Icons';
import { PageHeader } from './Overview';
import { locFull, locName } from '../data/site';
import { usd } from '../data/format';
import type { DayResult } from '../custom/dispatch';
import {
  RT_MIN, SPIKE_THRESHOLD, STALE_MIN, ago, ctDay, ctTime, filledSoFar, intervalStart, isComplete, latest, loadLive, pricesThrough, spikes,
  type LiveDay, type LiveLoad, type LiveState,
} from '../live/live';
import { LIVE_RTE, solveDay } from '../live/solver';

const REFRESH_MS = 5 * 60_000;
const HOUR = 3_600_000;
const DURATIONS = ['1', '2', '4'];

const money = (v: number | null | undefined, d = 2) => (v == null ? '–' : usd(v, d));
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${usd(Math.abs(v), 2)}`;

function useLive() {
  const [load, setLoad] = useState<LiveLoad | null>(null);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(() => {
    loadLive().then((l) => { setLoad(l); setNow(Date.now()); });
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);
  return { load, now };
}

/** The time axis for one operating day, labelled in Central time. */
function dayAxis(t: ChartTheme, day: LiveDay) {
  const start = Date.parse(day.startUtc);
  return {
    type: 'value' as const, min: start, max: start + day.hours * HOUR, interval: 3 * HOUR, ...axisBase(t),
    axisLabel: { ...axisBase(t).axisLabel, hideOverlap: true, showMaxLabel: false, formatter: (v: number) => ctTime(v).replace(':00', '') },
    splitLine: { show: false },
  };
}

function Freshness({ load, now }: { load: Extract<LiveLoad, { state: LiveState }>; now: number }) {
  const s = load.state;
  const through = pricesThrough(s);
  const late = through !== null && now - through > STALE_MIN * 60_000;
  const [label, color] = load.source === 'cache' ? ['Saved copy', 'gray'] : late ? ['Delayed', 'yellow'] : ['Live', 'green'];
  return (
    <Group gap="xs" wrap="wrap">
      <Badge variant="dot" color={color} size="lg" radius="sm" style={{ textTransform: 'none' }}>{label}</Badge>
      <Text size="sm" c="dimmed">
        {ctDay(s.today.date)}.{' '}
        {through === null ? 'No real-time prices posted yet today.' : <>Prices through <b>{ctTime(through)} CT</b> ({ago(through, now)}).</>}{' '}
        Last updated {ctTime(s.checkedAt)} CT ({ago(Date.parse(s.checkedAt), now)}).
      </Text>
    </Group>
  );
}

function HubTiles({ s, selected, onSelect }: { s: LiveState; selected: string; onSelect: (loc: string) => void }) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing={{ base: 'sm', sm: 'md' }}>
      {s.hubs.map((loc) => {
        const l = latest(s.today.rt[loc] ?? []);
        const up = l?.change != null && l.change > 0;
        const down = l?.change != null && l.change < 0;
        return (
          <UnstyledButton key={loc} onClick={() => onSelect(loc)} aria-pressed={selected === loc} aria-label={`Show ${locFull(loc)} in the charts`}>
            <Paper withBorder p="md" data-interactive style={selected === loc ? { borderColor: 'var(--mantine-primary-color-filled)' } : undefined}>
              <Text size="xs" c="dimmed" fw={560} tt="uppercase" style={{ letterSpacing: '.06em' }} truncate>{locName(loc)}</Text>
              <Text className="tnum" fz={{ base: 24, sm: 28 }} fw={640} lh={1.1} mt={6} c="bright">
                {l ? usd(l.price, 2) : '–'}
                <Text span fz="xs" c="dimmed" fw={500} ml={4}>/MWh</Text>
              </Text>
              <Text size="xs" mt={6} className="tnum" c={up ? 'red' : down ? 'teal' : 'dimmed'}>
                {l?.change == null ? 'No earlier interval to compare' : `${up ? '▲' : down ? '▼' : '•'} ${signed(l.change)} vs previous 15 min`}
              </Text>
            </Paper>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

function PriceCard({ s, loc }: { s: LiveState; loc: string }) {
  const today = s.today;
  const others = s.hubs.filter((h) => h !== loc);
  const rtData = (l: string) => (today.rt[l] ?? []).map((v, i) => [intervalStart(today, i), v]);
  // Day-ahead hourly prices drawn as steps across their hour.
  const da = today.da?.[loc];
  const daData = da ? [...da.map((v, i) => [intervalStart(today, i, 60), v]), [intervalStart(today, da.length, 60), da.at(-1) ?? null]] : [];
  const build = (t: ChartTheme) => ({
    grid: { top: 56, right: 12, bottom: 28, left: 52 },
    legend: { ...legendBase(t), data: [locName(loc), 'Day-ahead', 'Other hubs'] },
    tooltip: {
      ...tooltipBase(t), trigger: 'axis',
      formatter: (ps: { seriesName: string; value: [number, number | null]; color: string }[]) => {
        const shown = ps.filter((p) => p.seriesName !== 'Other hubs' && p.value[1] != null);
        if (!shown.length) return '';
        return `<b>${ctTime(ps[0].value[0])} CT</b><br/>` + shown.map((p) => `${p.seriesName}: ${usd(p.value[1]!, 2)}/MWh`).join('<br/>');
      },
    },
    xAxis: dayAxis(t, today),
    yAxis: { type: 'value', name: '$/MWh', scale: true, ...axisBase(t) },
    series: [
      ...others.map((h) => ({
        id: `o-${h}`, name: 'Other hubs', type: 'line', showSymbol: false, symbol: 'none', silent: true, z: 1,
        lineStyle: { width: 1, color: t.baseline, opacity: 0.55 }, itemStyle: { color: t.baseline }, data: rtData(h),
      })),
      { id: 'da', name: 'Day-ahead', type: 'line', step: 'end', showSymbol: false, symbol: 'none', z: 2, lineStyle: { width: 1.5, type: 'dashed', color: t.series[1] }, itemStyle: { color: t.series[1] }, data: daData },
      { id: 'rt', name: locName(loc), type: 'line', showSymbol: false, symbol: 'none', z: 3, lineStyle: { width: 2.2, color: t.series[0] }, itemStyle: { color: t.series[0] }, data: rtData(loc) },
    ],
  });
  return (
    <Card
      title="Real-time prices today" terms={['rt', 'da']}
      subtitle={`${locFull(loc)}, 15-minute settlement point prices, with its day-ahead hourly price and the other hubs for reference.`}
      csv={() => ({
        filename: `live_rt_${today.date}.csv`,
        headers: ['interval_start_utc', 'interval_start_central', ...s.hubs, ...s.nodes],
        rows: (today.rt[s.hubs[0]] ?? []).map((_, i) => {
          const ms = intervalStart(today, i);
          return [new Date(ms).toISOString(), ctTime(ms), ...[...s.hubs, ...s.nodes].map((l) => today.rt[l]?.[i] ?? null)];
        }),
      })}
    >
      {(ex) => <Chart build={build} height={ex ? 520 : 320} label={`Real-time prices today at ${locFull(loc)}`} />}
    </Card>
  );
}

/** Price line plus charge (below zero) and discharge (above zero) bars for one solved day. */
function dispatchBuild(day: LiveDay, prices: number[], r: DayResult, minutes: number, priceName: string) {
  return (t: ChartTheme) => {
    const x = (i: number) => intervalStart(day, i, minutes) + (minutes * 60_000) / 2;
    const net = prices.map((_, i) => r.discharge[i] - r.charge[i]);
    return {
      grid: { top: 56, right: 52, bottom: 28, left: 52 },
      legend: { ...legendBase(t), data: [priceName, 'Charge', 'Discharge'] },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis',
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          const mw = net[i];
          return `<b>${ctTime(intervalStart(day, i, minutes))} CT</b><br/>${priceName}: ${usd(prices[i], 2)}/MWh<br/>` +
            (mw > 1e-6 ? `Discharge ${mw.toFixed(2)} MW` : mw < -1e-6 ? `Charge ${(-mw).toFixed(2)} MW` : 'Idle') +
            `<br/>Stored ${r.soc[i].toFixed(2)} MWh`;
        },
      },
      xAxis: dayAxis(t, day),
      yAxis: [
        { type: 'value', name: 'MW', min: -1, max: 1, ...axisBase(t) },
        { type: 'value', name: '$/MWh', scale: true, ...axisBase(t), splitLine: { show: false } },
      ],
      series: [
        { id: 'charge', name: 'Charge', type: 'bar', stack: 'mw', itemStyle: { color: t.charge }, data: net.map((v, i) => [x(i), v < 0 ? v : 0]) },
        { id: 'discharge', name: 'Discharge', type: 'bar', stack: 'mw', itemStyle: { color: t.discharge }, data: net.map((v, i) => [x(i), v > 0 ? v : 0]) },
        { id: 'price', name: priceName, type: 'line', yAxisIndex: 1, step: 'middle', showSymbol: false, symbol: 'none', lineStyle: { width: 1.6, color: t.muted }, itemStyle: { color: t.muted }, data: prices.map((p, i) => [x(i), p]) },
      ],
    };
  };
}

function useSolve(prices: number[] | null, dt: number, durationH: number) {
  const [out, setOut] = useState<{ key: string; result?: DayResult; error?: string } | null>(null);
  const key = prices ? `${dt}|${durationH}|${prices.join(',')}` : '';
  useEffect(() => {
    if (!prices || prices.length < 2) return;
    let live = true;
    solveDay(prices, dt, durationH)
      .then((result) => live && setOut({ key, result }))
      .catch((e) => live && setOut({ key, error: e instanceof Error ? e.message : String(e) }));
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return out?.key === key ? out : null;
}

function Figures({ items }: { items: [string, string][] }) {
  return (
    <Group gap="xl" mb="sm" wrap="wrap">
      {items.map(([k, v]) => (
        <div key={k}>
          <Text size="xs" c="dimmed" fw={560} tt="uppercase" style={{ letterSpacing: '.06em' }}>{k}</Text>
          <Text className="tnum" fz={20} fw={640} c="bright">{v}</Text>
        </div>
      ))}
    </Group>
  );
}

function SoFarCard({ s, loc, durationH }: { s: LiveState; loc: string; durationH: number }) {
  const so = useMemo(() => filledSoFar(s.today.rt[loc] ?? []), [s, loc]);
  const solved = useSolve(so.prices.length ? so.prices : null, RT_MIN / 60, durationH);
  const r = solved?.result;
  const through = so.prices.length ? ctTime(intervalStart(s.today, so.prices.length)) : null;
  return (
    <Card
      title="Best possible battery so far today" terms={['perfect_foresight', 'cycles']}
      subtitle={`A 1 MW, ${durationH}-hour battery at ${locName(loc)} with perfect hindsight on today's real-time prices from midnight${through ? ` to ${through} CT` : ''}.`}
      csv={() => r && ({
        filename: `live_so_far_${loc}_${s.today.date}_${durationH}h.csv`,
        headers: ['interval_start_utc', 'price', 'charge_mw', 'discharge_mw', 'soc_mwh'],
        rows: so.prices.map((p, i) => [new Date(intervalStart(s.today, i)).toISOString(), p, r.charge[i], r.discharge[i], r.soc[i]]),
      })}
      footer={
        <Text size="xs" c="dimmed" lh={1.5}>
          {Math.round(LIVE_RTE * 100)}% round trip, no degradation cost, starts and ends the period empty: the same daily model as the
          rest of the site, run in your browser on prices so far. An upper bound: no real battery knows the afternoon in the morning.
          {so.filled > 0 && ` ${so.filled} missing interval${so.filled > 1 ? 's' : ''} filled with the previous price.`}
        </Text>
      }
    >
      {(ex) => so.prices.length < 2 ? (
        <Text size="sm" c="dimmed">Too few real-time prices yet today. The first ones post a few minutes after 12:15 AM CT.</Text>
      ) : solved?.error ? (
        <Text size="sm" c="red">Could not solve: {solved.error}</Text>
      ) : !r ? (
        <Text size="sm" c="dimmed">Solving…</Text>
      ) : (
        <>
          <Figures items={[
            ['Revenue so far', `${money(r.revenue)} per MW`],
            ['Per kW', `${money(r.revenue / 1000, 3)}/kW`],
            ['Cycles', r.cycles.toFixed(2)],
          ]} />
          <Chart build={dispatchBuild(s.today, so.prices, r, RT_MIN, 'Real-time price')} height={ex ? 480 : 280} label={`Best dispatch so far today at ${locFull(loc)}`} />
        </>
      )}
    </Card>
  );
}

function TomorrowCard({ s, loc, durationH }: { s: LiveState; loc: string; durationH: number }) {
  const day = s.tomorrow;
  const da = day.da?.[loc];
  const ready = isComplete(da ?? undefined, day.hours);
  const solved = useSolve(ready ? (da as number[]) : null, 1, durationH);
  const r = solved?.result;
  return (
    <Card
      title={`Tomorrow's plan (${ctDay(day.date)})`} terms={['da', 'capture_rate']}
      subtitle={`The schedule a 1 MW, ${durationH}-hour battery at ${locName(loc)} would follow if it traded tomorrow's day-ahead prices.`}
      csv={() => r && ready ? ({
        filename: `live_tomorrow_${loc}_${day.date}_${durationH}h.csv`,
        headers: ['hour_start_utc', 'da_price', 'charge_mw', 'discharge_mw', 'soc_mwh'],
        rows: (da as number[]).map((p, i) => [new Date(intervalStart(day, i, 60)).toISOString(), p, r.charge[i], r.discharge[i], r.soc[i]]),
      }) : undefined}
      footer={
        <Text size="xs" c="dimmed" lh={1.5}>
          Revenue here is at day-ahead prices. Settled against tomorrow's real-time prices it will differ: that gap is the capture rate
          on the Realism page. {day.daFirstSeenAt && `Tomorrow's day-ahead prices were first seen at ${ctTime(day.daFirstSeenAt)} CT today.`}
        </Text>
      }
    >
      {(ex) => !ready ? (
        <Text size="sm" c="dimmed" lh={1.55}>
          Tomorrow's day-ahead prices have not posted yet. The market closes at 10:00 AM CT and ERCOT usually posts prices around
          12:30 PM CT, sometimes hours later. This page checks every 5 minutes.
        </Text>
      ) : solved?.error ? (
        <Text size="sm" c="red">Could not solve: {solved.error}</Text>
      ) : !r ? (
        <Text size="sm" c="dimmed">Solving…</Text>
      ) : (
        <>
          <Figures items={[
            ['Day-ahead revenue', `${money(r.revenue)} per MW`],
            ['Charge hours', String(r.charge.filter((v) => v > 1e-6).length)],
            ['Discharge hours', String(r.discharge.filter((v) => v > 1e-6).length)],
          ]} />
          <Chart build={dispatchBuild(day, da as number[], r, 60, 'Day-ahead price')} height={ex ? 480 : 280} label={`Tomorrow's day-ahead dispatch at ${locFull(loc)}`} />
        </>
      )}
    </Card>
  );
}

export default function Live() {
  const { load, now } = useLive();
  const [loc, setLoc] = useState('HB_HOUSTON');
  const [dur, setDur] = useState('2');

  const header = (
    <PageHeader title="Today in ERCOT">
      <Text c="dimmed" maw={760} lh={1.55}>
        Today's real-time prices at the five hubs and the five resource nodes this site studies, what a battery could have earned
        so far today, and tomorrow's plan once day-ahead prices post. Refreshes every 5 minutes from ERCOT's public API.
      </Text>
    </PageHeader>
  );
  if (!load) return <Stack gap="lg">{header}<Text c="dimmed">Loading live prices…</Text></Stack>;
  if (load.source === 'none') {
    return (
      <Stack gap="lg">
        {header}
        <Alert color="gray" icon={<IconWarn />} title="Live prices are unavailable right now">
          The page could not load live prices ({load.reason}) and has no saved copy in this browser yet. Try again in a few minutes;
          the historical pages work as usual.
        </Alert>
      </Stack>
    );
  }

  const s = load.state;
  const hot = spikes(s);
  const all = [...s.hubs, ...s.nodes];
  return (
    <Stack gap="lg">
      {header}
      <Freshness load={load} now={now} />
      {load.source === 'cache' && (
        <Alert color="yellow" icon={<IconWarn />} title="Showing the last saved prices">
          New prices could not be loaded ({load.reason}). This is the copy saved in this browser, last updated
          {' '}{ctTime(s.checkedAt)} CT on {ctDay(s.today.date)}. The page will try again every 5 minutes.
        </Alert>
      )}
      {hot.length > 0 && (
        <Alert color="red" variant="filled" icon={<IconWarn />} title="Price spike">
          {hot.map((h) => `${locFull(h.loc)} ${usd(h.last.price, 2)}/MWh at ${ctTime(intervalStart(s.today, h.last.index))} CT`).join(' · ')}
          {' '}(threshold {usd(SPIKE_THRESHOLD, 0)}/MWh).
        </Alert>
      )}
      {s.errors.length > 0 && load.source === 'worker' && (
        <Text size="xs" c="dimmed">
          The last update could not fetch everything from ERCOT, so some figures carry over from earlier: {s.errors.join('; ')}.
        </Text>
      )}

      <HubTiles s={s} selected={loc} onSelect={setLoc} />

      <Group gap="md" align="flex-end" wrap="wrap">
        <Select
          label="Location" size="sm" w={{ base: '100%', xs: 340 }} allowDeselect={false} comboboxProps={{ withinPortal: true }}
          data={[
            { group: 'Hubs', items: s.hubs.map((c) => ({ value: c, label: locFull(c) })) },
            { group: 'Resource nodes', items: s.nodes.map((c) => ({ value: c, label: locFull(c) })) },
          ]}
          value={all.includes(loc) ? loc : s.hubs[0]} onChange={(v) => v && setLoc(v)}
        />
        <Stack gap={4}>
          <Group gap={2}><Text size="sm" fw={500}>Battery duration</Text><Info terms="duration_h" size={14} /></Group>
          <SegmentedControl size="sm" value={dur} onChange={setDur} data={DURATIONS.map((d) => ({ value: d, label: `${d} h` }))} />
        </Stack>
      </Group>

      <PriceCard s={s} loc={loc} />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <SoFarCard s={s} loc={loc} durationH={Number(dur)} />
        <TomorrowCard s={s} loc={loc} durationH={Number(dur)} />
      </SimpleGrid>

      <Text size="xs" c="dimmed" lh={1.6}>
        Source: ERCOT public API (real-time settlement point prices, NP6-905-CD; day-ahead settlement point prices, NP4-190-CD),
        fetched every 5 minutes by a small Cloudflare Worker that keeps the API key off this page. Prices are as first posted and can
        be corrected later. Times are US Central. <Anchor href="#/method" size="xs">How the model works</Anchor>.
      </Text>
    </Stack>
  );
}
