import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Group, NumberInput, Paper, Progress, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { Info } from '../components/Info';
import { DataQuality } from '../components/DataQuality';
import { CumulativeCard, HeatmapCard, MonthlyRevenueCard, TopDaysCard } from '../components/cards';
import { MonthlyRealismCard, RealismKpis } from '../components/realism';
import { KpiRow, PageHeader } from './Overview';
import { useApp } from '../state';
import { findRun, loadPriceIndex } from '../data/loader';
import { fmtDate, pct, usd } from '../data/format';
import { locFull } from '../data/site';
import { cancelRun, runInWorker, type CustomRunResult, type RunProgress } from '../custom/client';
import {
  FORM_DEFAULTS, LIMITS, fitRange, formQuery, parseForm, precomputedKey, toParams, type Coverage, type CustomForm, type Strategy,
} from '../custom/params';

type RunState =
  | { status: 'idle' }
  | { status: 'running'; progress?: RunProgress; previous?: Done }
  | { status: 'error'; message: string; previous?: Done }
  | Done;
type Done = { status: 'done'; result: CustomRunResult; ms: number; key: string };

/** Inputs that change the numbers (the strategy only changes which figures lead). */
const runKey = (f: CustomForm) => formQuery({ ...f, strategy: 'pf' });
const hashQuery = () => window.location.hash.split('?')[1] ?? '';

function Field({ label, term, value, onChange, suffix, prefix, lim, step, decimals = 0 }: {
  label: string; term: string; value: number; onChange: (v: number) => void; suffix?: string; prefix?: string;
  lim: { min: number; max: number }; step: number; decimals?: number;
}) {
  return (
    <NumberInput
      label={<Group gap={2} wrap="nowrap" component="span" style={{ display: 'inline-flex' }}>{label}<Info terms={term} size={14} /></Group>}
      aria-label={label} value={value} onChange={(v) => typeof v === 'number' && onChange(v)}
      min={lim.min} max={lim.max} step={step} decimalScale={decimals} suffix={suffix} prefix={prefix}
      allowNegative={false} clampBehavior="blur" size="sm" inputMode="decimal"
    />
  );
}

function Inputs({ form, coverage, set, running, onRun, onCancel, stale }: {
  form: CustomForm; coverage: Coverage[]; set: (p: Partial<CustomForm>) => void;
  running: boolean; onRun: () => void; onCancel: () => void; stale: boolean;
}) {
  const locations = [...new Set(coverage.map((c) => c.location))];
  const years = coverage.filter((c) => c.location === form.location);
  const year = years.find((c) => c.year === Number(form.startDate.slice(0, 4)));
  const common = { size: 'sm' as const, allowDeselect: false, comboboxProps: { withinPortal: true } };
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="Custom run inputs">
      <Group justify="space-between" mb="md" gap="xs">
        <Title order={2} fz={17} fw={620}>Your battery</Title>
        <Button variant="subtle" color="gray" size="compact-sm" onClick={() => set(FORM_DEFAULTS)}>Reset to defaults</Button>
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md" verticalSpacing="md">
        <Select
          {...common} label="Location" searchable
          data={[
            { group: 'Hubs', items: locations.filter((l) => l.startsWith('HB_')).map((c) => ({ value: c, label: locFull(c) })) },
            { group: 'Resource nodes', items: locations.filter((l) => !l.startsWith('HB_')).map((c) => ({ value: c, label: locFull(c) })) },
          ]}
          value={form.location} onChange={(v) => v && set({ location: v })}
        />
        <Select
          {...common} label="Year"
          data={years.map((c) => ({ value: String(c.year), label: c.last.endsWith('12-31') ? String(c.year) : `${c.year} (to ${fmtDate(c.last)})` }))}
          value={form.startDate.slice(0, 4)}
          onChange={(v) => {
            const c = years.find((y) => String(y.year) === v);
            if (c) set({ startDate: c.first, endDate: c.last });
          }}
        />
        <TextInput label="From" type="date" size="sm" value={form.startDate} min={year?.first} max={year?.last} onChange={(e) => e.currentTarget.value && set({ startDate: e.currentTarget.value })} />
        <TextInput label="To" type="date" size="sm" value={form.endDate} min={year?.first} max={year?.last} onChange={(e) => e.currentTarget.value && set({ endDate: e.currentTarget.value })} />
        <Field label="Power" term="power_mw" suffix=" MW" value={form.powerMw} onChange={(v) => set({ powerMw: v })} lim={LIMITS.powerMw} step={10} decimals={1} />
        <Field label="Duration" term="duration_h" suffix=" h" value={form.durationH} onChange={(v) => set({ durationH: v })} lim={LIMITS.durationH} step={0.5} decimals={2} />
        <Field label="Round-trip efficiency" term="rte" suffix="%" value={form.rtePct} onChange={(v) => set({ rtePct: v })} lim={LIMITS.rtePct} step={1} decimals={1} />
        <Field label="Degradation cost" term="degradation_cost" prefix="$" suffix="/MWh" value={form.degCost} onChange={(v) => set({ degCost: v })} lim={LIMITS.degCost} step={1} decimals={2} />
      </SimpleGrid>
      <Group justify="space-between" mt="lg" gap="sm">
        <Stack gap={4}>
          <Group gap={2}><Text size="sm" fw={560}>Strategy</Text><Info terms={['perfect_foresight', 'capture_rate']} size={14} /></Group>
          <SegmentedControl
            size="sm" value={form.strategy} onChange={(v) => set({ strategy: v as Strategy })}
            data={[{ value: 'pf', label: 'Perfect foresight' }, { value: 'da', label: 'DA-scheduled' }]}
          />
        </Stack>
        <Group gap="xs">
          {running && <Button variant="default" onClick={onCancel}>Cancel</Button>}
          <Button onClick={onRun} loading={running} disabled={running}>{stale ? 'Run with these inputs' : 'Run again'}</Button>
        </Group>
      </Group>
    </Paper>
  );
}

function RunProgressBar({ state }: { state: Extract<RunState, { status: 'running' }> }) {
  const p = state.progress;
  const solving = p?.stage === 'solving' && p.daysTotal > 0; // progress arrives as each month starts
  const value = solving ? (100 * p.daysDone) / p.daysTotal : 0;
  const month = solving && p.month ? new Date(`${p.month}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  return (
    <Paper withBorder p="md" aria-live="polite">
      <Group justify="space-between" mb={8} gap="xs">
        <Text size="sm" fw={560}>{solving ? (p.daysDone < p.daysTotal ? `Solving ${month}` : 'Finishing…') : 'Loading prices and the solver…'}</Text>
        {solving && <Text size="sm" c="dimmed" className="tnum">{p.daysDone} of {p.daysTotal} days</Text>}
      </Group>
      <Progress value={value} animated={!solving} striped={!solving} size="md" radius="xl" aria-label="Custom run progress" />
    </Paper>
  );
}

function Summary({ done, form }: { done: Done; form: CustomForm }) {
  const { index } = useApp();
  const { run, skippedDays, daSkippedDays } = done.result;
  const m = run.metrics;
  const key = precomputedKey(form);
  const row = key && index ? findRun(index, { location: key.location, year: key.year, duration: key.duration, deg: key.deg }) : undefined;
  // Compare only when both cover the same days (the price files can run ahead of the precomputed results).
  const same = row && row.first_day === run.meta.first_day && row.last_day === run.meta.last_day;
  const energy = run.meta.energy_mwh;
  return (
    <Stack gap={6}>
      <Text size="sm" c="dimmed" lh={1.55}>
        {locFull(run.meta.location)} · {run.meta.power_mw} MW, {run.meta.duration_h} h ({energy.toLocaleString('en-US', { maximumFractionDigits: 1 })} MWh) ·{' '}
        {pct(run.meta.rte, 0)} round trip · ${run.meta.deg_cost_per_mwh}/MWh degradation · {fmtDate(run.meta.first_day)} to {fmtDate(run.meta.last_day)},{' '}
        {run.meta.days_solved} days solved in {(done.ms / 1000).toFixed(1)} s in your browser{m.milp_days ? ` (${m.milp_days} re-solved as MILP)` : ''}.
      </Text>
      {(skippedDays.length > 0 || daSkippedDays.length > 0) && (
        <Text size="sm" c="dimmed">
          {skippedDays.length > 0 && `Skipped for missing prices: ${skippedDays.map(fmtDate).join(', ')}. `}
          {daSkippedDays.length > 0 && `DA-scheduled skipped ${daSkippedDays.length} day(s) whose day-ahead prices were incomplete.`}
        </Text>
      )}
      {same && (
        <Text size="sm" c="dimmed">
          Check: the precomputed result for these inputs is {usd(row.revenue_per_kw_year, 2)}/kW-yr perfect foresight
          {row.da_rt_revenue_per_kw_year != null && ` and ${usd(row.da_rt_revenue_per_kw_year, 2)}/kW-yr DA-scheduled`}; this run gives{' '}
          {usd(m.revenue_per_kw_year, 2)} and {usd(m.da_rt_revenue_per_kw_year, 2)}.
        </Text>
      )}
    </Stack>
  );
}

export default function Custom() {
  const [coverage, setCoverage] = useState<Coverage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setFormState] = useState<CustomForm | null>(null);
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const autoRan = useRef(false);

  useEffect(() => {
    loadPriceIndex()
      .then((ix) => {
        const cov = ix.files.map((f) => ({ location: f.location, year: f.year, first: f.rt_first_day, last: f.rt_last_day }));
        setCoverage(cov);
        setFormState(parseForm(hashQuery(), cov));
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  // A pasted link or the back button changes the hash: read the inputs again and run them.
  // (Typing in the form uses replaceState, which never fires hashchange.)
  useEffect(() => {
    if (!coverage) return;
    const on = () => {
      if (!window.location.hash.startsWith('#/custom')) return;
      autoRan.current = false;
      setFormState(parseForm(hashQuery(), coverage));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [coverage]);

  const set = useCallback((patch: Partial<CustomForm>) => {
    setFormState((cur) => {
      if (!cur || !coverage) return cur;
      const merged = { ...cur, ...patch };
      // Keep the dates inside one year this location has prices for.
      const next = { ...merged, ...fitRange(merged.location, merged.startDate, merged.endDate, coverage) };
      // replaceState keeps typing out of the browser history and doesn't fire hashchange.
      history.replaceState(null, '', `#/custom?${formQuery(next)}`);
      return next;
    });
  }, [coverage]);

  const run = useCallback(() => {
    if (!form) return;
    const key = runKey(form);
    setState((s) => ({ status: 'running', previous: s.status === 'done' ? s : 'previous' in s ? s.previous : undefined }));
    runInWorker(toParams(form), (progress) => setState((s) => (s.status === 'running' ? { ...s, progress } : s)))
      .then(({ result, ms }) => setState({ status: 'done', result, ms, key }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setState((s) => ({ status: 'error', message: e instanceof Error ? e.message : String(e), previous: 'previous' in s ? s.previous : undefined }));
      });
  }, [form]);

  const cancel = () => {
    cancelRun();
    setState((s) => (s.status === 'running' ? (s.previous ?? { status: 'idle' }) : s));
  };

  // Run once on arrival, so a shared link opens with its results.
  useEffect(() => {
    if (form && !autoRan.current) {
      autoRan.current = true;
      history.replaceState(null, '', `#/custom?${formQuery(form)}`);
      run();
    }
  }, [form, run]);
  useEffect(() => () => cancelRun(), []); // leaving the page stops a run in progress

  const done = state.status === 'done' ? state : 'previous' in state ? state.previous : undefined;
  const stale = !!form && (!done || done.key !== runKey(form));
  const view = useMemo(() => done?.result.run, [done]);

  return (
    <Stack gap="lg">
      <PageHeader title="Custom run">
        <Text size="lg" c="dimmed" maw={760} lh={1.5}>
          Size your own battery and pick a location and dates. Every day is solved in your browser with the same
          optimization as the precomputed results (HiGHS, compiled to WebAssembly); nothing is sent to a server. Energy
          arbitrage only. The link in the address bar saves these inputs.
        </Text>
      </PageHeader>
      {loadError && <Alert color="red" title="Could not load the price files">{loadError}</Alert>}
      {form && coverage && (
        <Inputs form={form} coverage={coverage} set={set} running={state.status === 'running'} onRun={run} onCancel={cancel} stale={stale} />
      )}
      {state.status === 'running' && <RunProgressBar state={state} />}
      {state.status === 'error' && <Alert color="red" title="The run failed">{state.message}</Alert>}
      {done && form && (
        <div style={{ opacity: state.status === 'running' ? 0.55 : 1, transition: 'opacity 200ms' }} aria-busy={state.status === 'running'}>
          <Stack gap="lg">
            {stale && state.status !== 'running' && (
              <Alert color="yellow" title="Inputs changed">These results are for the previous inputs. Press Run to update.</Alert>
            )}
            <Summary done={done} form={form} />
            <DataQuality run={view} />
            {form.strategy === 'da' ? <RealismKpis run={view} /> : <KpiRow run={view} />}
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              {form.strategy === 'da' ? <MonthlyRealismCard run={view} /> : <MonthlyRevenueCard run={view} />}
              <CumulativeCard run={view} />
              <HeatmapCard run={view} />
              <TopDaysCard run={view} />
            </SimpleGrid>
            {form.strategy === 'da' && (
              <Text size="sm" c="dimmed">
                The cumulative, dispatch and best-day charts show the perfect-foresight schedule; the figures above compare
                it with the day-ahead schedule settled at real-time prices.
              </Text>
            )}
          </Stack>
        </div>
      )}
    </Stack>
  );
}
