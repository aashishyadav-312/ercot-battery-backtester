import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, NumberInput, Paper, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Card, type CsvData } from '../components/Card';
import { Chart, axisBase, tooltipBase, type ChartTheme } from '../components/Chart';
import { Info } from '../components/Info';
import { Kpi } from '../components/Kpi';
import { useApp } from '../state';
import { useSelectedRun } from '../hooks';
import { PageHeader, RunStatus } from './RunHeader';
import { DEFAULTS, compute, tornado, type Assumptions, type Resource } from '../data/economics';
import { fmtDate, num, pct, usd, yearLabel } from '../data/format';
import { locFull } from '../data/site';
import { economicsVerdict } from '../data/notes';
import { TERMS } from '../copy/terms';
import { V4 } from '../v4/flag';
import { useEconStack } from '../v4/useEconStack';
import { getDcCase } from '../v4/dc/dcCase';
import {
  REV_LABEL, effectiveSource, parseRevHash, revOptions, revenueOf, sourceDetail, withRevParams,
  type DcCase, type Offered, type PlanSource, type RevParams, type RevSource,
} from '../v4/revenueSource';
import { revealFocused } from '../shell/panelScroll';
import classes from './Economics.module.css';

/** The revenue-source choice lives in the URL (rev, src, dc). Changing it rewrites the URL in place, so Back still leaves the page. */
function useRevParams(): [RevParams, (patch: Partial<RevParams>) => void] {
  const [p, setP] = useState(() => parseRevHash(window.location.hash));
  useEffect(() => {
    const on = () => setP(parseRevHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const update = useCallback((patch: Partial<RevParams>) => {
    const next = { ...parseRevHash(window.location.hash), ...patch };
    window.history.replaceState(null, '', withRevParams(window.location.hash, next));
    setP(next);
  }, []);
  return [p, update];
}

/** Inputs as typed on screen: rates in percent, everything else in its own unit. */
interface Form {
  costPerKwh: number; omPerKwYr: number; augCostPerKwh: number; augYear: number; lifeYears: number;
  discountPct: number; itcPct: number; haircutPct: number; declinePct: number;
}
const FORM_DEFAULTS: Form = {
  costPerKwh: DEFAULTS.costPerKwh, omPerKwYr: DEFAULTS.omPerKwYr, augCostPerKwh: DEFAULTS.augCostPerKwh, augYear: DEFAULTS.augYear,
  lifeYears: DEFAULTS.lifeYears, discountPct: DEFAULTS.discountRate * 100, itcPct: DEFAULTS.itc * 100,
  haircutPct: DEFAULTS.haircut * 100, declinePct: DEFAULTS.decline * 100,
};
const toAssumptions = (f: Form): Assumptions => ({
  costPerKwh: f.costPerKwh, omPerKwYr: f.omPerKwYr, augCostPerKwh: f.augCostPerKwh, augYear: f.augYear, lifeYears: f.lifeYears,
  discountRate: f.discountPct / 100, itc: f.itcPct / 100, haircut: f.haircutPct / 100, decline: f.declinePct / 100,
});

// Kept at module level so the inputs survive a trip to another page and back.
let remembered: Form = FORM_DEFAULTS;

function Field({ label, term, value, onChange, suffix, prefix, min = 0, max, step = 1, decimals = 0, hint }: {
  label: string; term: string; value: number; onChange: (v: number) => void; suffix?: string; prefix?: string;
  min?: number; max?: number; step?: number; decimals?: number; hint?: string;
}) {
  return (
    <NumberInput
      label={<Group gap={2} wrap="nowrap" component="span" style={{ display: 'inline-flex' }}>{label}<Info terms={term} size={14} /></Group>}
      description={hint}
      value={value} onChange={(v) => onChange(typeof v === 'number' ? v : 0)}
      min={min} max={max} step={step} decimalScale={decimals} fixedDecimalScale={false} suffix={suffix} prefix={prefix}
      allowNegative={false} clampBehavior="strict" size="sm" inputMode="decimal"
    />
  );
}

function Inputs({ form, set, reset }: { form: Form; set: (p: Partial<Form>) => void; reset: () => void }) {
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="Assumptions" className={classes.assumptions} onFocus={revealFocused}>
      <Group justify="space-between" mb="md">
        <Title order={2} fz={17} fw={620}>Assumptions</Title>
        <Button variant="subtle" color="gray" size="compact-sm" onClick={reset}>Reset to defaults</Button>
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 1 }} spacing="md" verticalSpacing="md">
        <Field label="Installed cost" term="installed_cost" prefix="$" suffix="/kWh" value={form.costPerKwh} onChange={(v) => set({ costPerKwh: v })} max={5000} step={10} />
        <Field label="Fixed O&M" term="fixed_om" prefix="$" suffix="/kW-yr" value={form.omPerKwYr} onChange={(v) => set({ omPerKwYr: v })} max={500} />
        <Field label="Augmentation cost" term="augmentation" prefix="$" suffix="/kWh" value={form.augCostPerKwh} onChange={(v) => set({ augCostPerKwh: v })} max={5000} step={5} />
        <Field label="Augmentation year" term="augmentation" value={form.augYear} onChange={(v) => set({ augYear: v })} max={40} hint="0 = none" />
        <Field label="Project life" term="project_life" suffix=" years" value={form.lifeYears} onChange={(v) => set({ lifeYears: v })} min={1} max={40} />
        <Field label="Discount rate" term="discount_rate" suffix="%" value={form.discountPct} onChange={(v) => set({ discountPct: v })} max={50} step={0.5} decimals={1} />
        <Field label="Investment tax credit" term="itc" suffix="%" value={form.itcPct} onChange={(v) => set({ itcPct: v })} max={90} step={5} decimals={1} hint="Your input; no tax law is built in" />
        <Field label="Revenue haircut" term="revenue_haircut" suffix="%" value={form.haircutPct} onChange={(v) => set({ haircutPct: v })} max={100} step={5} decimals={1} />
        <Field label="Annual revenue decline" term="revenue_decline" suffix="%/yr" value={form.declinePct} onChange={(v) => set({ declinePct: v })} max={50} step={0.5} decimals={1} />
      </SimpleGrid>
    </Paper>
  );
}

function TornadoCard({ rows, base, scenario }: { rows: ReturnType<typeof tornado>; base: number; scenario: string }) {
  // Row order: echarts draws a category axis bottom-up, so reverse to put the largest swing on top.
  const build = useMemo(() => {
    const ordered = [...rows].reverse();
    const lo = ordered.map((r) => Math.min(r.npvLow, r.npvHigh) - base);
    const hi = ordered.map((r) => Math.max(r.npvLow, r.npvHigh) - base);
    return (t: ChartTheme) => ({
      grid: { left: 8, right: 16, top: 28, bottom: 28, containLabel: true },
      legend: { top: 0, left: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16, textStyle: { color: t.muted, fontSize: 11 } },
      tooltip: {
        ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (p: { dataIndex: number }[]) => {
          const r = ordered[p[0].dataIndex];
          return `<b>${r.label}</b><br/>${r.lowText}: NPV ${usd(r.npvLow, 0)}/kW<br/>${r.highText}: NPV ${usd(r.npvHigh, 0)}/kW<br/>Base: ${usd(base, 0)}/kW`;
        },
      },
      xAxis: {
        type: 'value', ...axisBase(t), name: 'Change in NPV, $/kW', nameLocation: 'middle', nameGap: 26,
        axisLabel: { ...axisBase(t).axisLabel, formatter: (v: number) => (v > 0 ? `+${v}` : `${v}`) },
      },
      yAxis: { type: 'category', data: ordered.map((r) => r.label), ...axisBase(t), axisLabel: { ...axisBase(t).axisLabel, margin: 8, color: t.text } },
      series: [
        { name: 'NPV falls', type: 'bar', stack: 'swing', data: lo, barMaxWidth: 20, itemStyle: { color: t.orange } },
        {
          name: 'NPV rises', type: 'bar', stack: 'swing', data: hi, barMaxWidth: 20, itemStyle: { color: t.green },
          markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.grey[1], type: 'solid', width: 1 }, data: [{ xAxis: 0 }] },
        },
      ],
    });
  }, [rows, base]);
  const csv = (): CsvData => ({
    filename: 'economics_sensitivity.csv',
    headers: ['input', 'lower_value', 'npv_at_lower_usd_per_kw', 'higher_value', 'npv_at_higher_usd_per_kw', 'base_npv_usd_per_kw'],
    rows: rows.map((r) => [r.label, r.lowText, Math.round(r.npvLow * 100) / 100, r.highText, Math.round(r.npvHigh * 100) / 100, Math.round(base * 100) / 100]),
  });
  return (
    <Card
      title="What moves NPV most" terms="tornado"
      subtitle={`Each input moved down and up on its own, others held · base NPV ${usd(base, 0)}/kW · ${scenario}`} csv={csv}
    >
      {(ex) => <Chart build={build} height={ex ? '70vh' : 360} label="Sensitivity tornado chart of net present value" />}
    </Card>
  );
}

export default function Economics() {
  const { sel } = useApp();
  const { row, run } = useSelectedRun();
  const [form, setForm] = useState<Form>(remembered);
  const [params, setParams] = useRevParams();
  const set = (p: Partial<Form>) => setForm((f) => (remembered = { ...f, ...p }));
  const reset = () => setForm((remembered = FORM_DEFAULTS));

  const hasDa = row?.da_rt_revenue_per_kw_year != null;
  const use: PlanSource = params.plan === 'da' && hasDa ? 'da' : 'pf';

  // Revenue source (v4): Energy is the default; Full stack and Data Center site are offered only when their data exists.
  const stackRes = useEconStack(sel.year, sel.duration, use, sel.location, V4);
  const dcCase: DcCase | null = useMemo(() => {
    if (!V4) return null;
    const mem = getDcCase();
    if (params.dc != null) return { perKwYr: params.dc, label: mem && Math.abs(mem.perKwYr - params.dc) < 0.01 ? mem.label : 'Data Center case from the link' };
    return mem;
  }, [params.dc]);
  const offered: Offered = { stack: stackRes.offered?.row ?? null, stackMeta: stackRes.offered?.meta ?? null, dc: dcCase };
  const options = revOptions(offered);
  const stackPending = V4 && params.rev === 'stack' && stackRes.status === 'loading';
  const rev: RevSource = effectiveSource(params.rev, offered);
  const detail = sourceDetail(rev, offered, use);

  const resource: Resource | undefined = row && !stackPending ? {
    durationH: row.duration_h,
    revenuePerKwYr: revenueOf(rev, use === 'da' ? row.da_rt_revenue_per_kw_year! : row.revenue_per_kw_year, offered),
    cyclesPerYear: use === 'da' ? (run?.metrics.da_cycles_per_year ?? row.cycles_per_year) : row.cycles_per_year,
  } : undefined;
  const assumptions = useMemo(() => toAssumptions(form), [form]);
  const out = useMemo(() => resource && compute(assumptions, resource), [assumptions, resource?.durationH, resource?.revenuePerKwYr, resource?.cyclesPerYear]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => resource && tornado(assumptions, resource), [assumptions, resource?.durationH, resource?.revenuePerKwYr, resource?.cyclesPerYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const scenario = row ? `${locFull(sel.location)} · ${sel.duration}h · ${yearLabel(sel.year)}` : '';
  const yr1 = resource ? resource.revenuePerKwYr * (1 - form.haircutPct / 100) : undefined;
  const life = Math.max(1, Math.round(form.lifeYears));
  const ann = !!row?.annualized && rev === 'energy';

  return (
    <Stack gap="lg">
      <PageHeader title="Economics">
        <Text size="lg" c="dimmed" maw={760} lh={1.5}>
          Turn the backtested revenue for the selected location, duration and year into project metrics: net present value, IRR, payback,
          levelized cost and the capex at which the project breaks even. Everything is per kW of power capacity.
        </Text>
      </PageHeader>
      <Alert color="yellow" variant="light" title="Illustrative screening model, not investment advice." styles={{ title: { fontSize: 15 } }}>
        Defaults are placeholders, not quotes or forecasts. The model has no debt, income tax, depreciation, inflation, salvage value or
        merchant-risk premium, and {rev === 'stack'
          ? 'the revenue is energy plus ancillary services from the backtest, with no allowance for prices falling as more batteries bid.'
          : rev === 'dc'
            ? 'the revenue is the Data Center case you ran, including the 4CP and reliability values you set.'
            : 'the revenue is energy arbitrage only.'} Change every input to your own view.
      </Alert>
      <RunStatus />

      <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="Revenue source">
        <Group justify="space-between" align="flex-end" gap="md">
          <div>
            <Group gap={4}>
              <Text fw={620} c="bright">Revenue source</Text>
              <Info terms={['perfect_foresight', 'capture_rate', 'revenue_haircut']} />
            </Group>
            <Text size="sm" c="dimmed" mt={2} maw={640} lh={1.45}>
              {row && resource ? (
                <>
                  {scenario}: <b className="tnum">{usd(resource.revenuePerKwYr, 1)}/kW-yr</b> before haircut
                  {rev === 'energy' ? '' : ` (${detail.label})`}
                  {ann ? ` (annualized from ${fmtDate(row.first_day)} to ${fmtDate(row.last_day)})` : ''}
                  {detail.yearNote ? ` (${detail.yearNote})` : ''}.
                  {detail.split && <> Energy <b className="tnum">{usd(detail.split.energy, 1)}</b> plus ancillary services <b className="tnum">{usd(detail.split.ancillary, 1)}</b>.</>}
                  {' '}After a {pct(form.haircutPct / 100, 0)} haircut, year 1 revenue is <b className="tnum">{usd(yr1, 1)}/kW-yr</b>.
                  {detail.upperBoundNote && <> {detail.upperBoundNote}</>}
                  {detail.extra && <> {detail.extra}</>}
                </>
              ) : 'Loading…'}
            </Text>
          </div>
          <Group gap="sm" justify="flex-end">
            {options.length > 1 && (
              <SegmentedControl
                value={rev} onChange={(v) => setParams({ rev: v as RevSource, ...(v === 'dc' && dcCase ? { dc: dcCase.perKwYr } : {}) })}
                aria-label="Revenue" data-testid="rev-pill"
                data={options.map((o) => ({ value: o, label: REV_LABEL[o] }))}
              />
            )}
            <SegmentedControl
              value={use} onChange={(v) => setParams({ plan: v as PlanSource })} aria-label="Revenue source"
              data={[{ value: 'pf', label: TERMS.perfectForesight.label }, { value: 'da', label: TERMS.dayAheadPlan.label, disabled: !hasDa }]}
            />
          </Group>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" style={{ alignItems: 'start' }}>
        <Inputs form={form} set={set} reset={reset} />
        <Stack gap="lg" style={{ gridColumn: 'span 2' }} className="econ-main">
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing={{ base: 'sm', sm: 'lg' }}>
            <Kpi
              label="NPV" term="npv" unit="$/kW" value={out && usd(out.npv, 0)}
              hint={out && `${out.npv >= 0 ? 'Earns more' : 'Earns less'} than a ${num(form.discountPct, 1)}% return over ${life} years.`}
            />
            <Kpi
              label="IRR" term="irr" value={out && (out.irr == null ? 'None' : pct(out.irr, 1))}
              hint={out && (out.irr == null ? 'Cash flows never recover the outlay at any rate.' : `Compared with your ${num(form.discountPct, 1)}% discount rate.`)}
            />
            <Kpi
              label="Simple payback" term="payback" value={out && (out.paybackYears == null ? 'Never' : num(out.paybackYears, 1))} unit={out?.paybackYears == null ? undefined : 'years'}
              hint={out && (out.paybackYears == null ? `Not recovered within ${life} years, undiscounted.` : `Undiscounted, of ${life}-year life.`)}
            />
            <Kpi
              label="Levelized cost" term="lcos" unit="$/MWh" value={out && (out.lcosPerMwh == null ? '–' : usd(out.lcosPerMwh, 0))}
              hint={out && 'Lifetime cost per MWh discharged, charging energy excluded.'}
            />
            <Kpi
              label="Breakeven capex" term="breakeven_capex" unit="$/kWh" value={out && (out.breakevenCapexPerKwh == null ? '–' : usd(out.breakevenCapexPerKwh, 0))}
              hint={out && out.breakevenCapexPerKwh != null && `Your input is ${usd(form.costPerKwh, 0)}/kWh; NPV is zero at this cost.`}
            />
            <Kpi
              label="Net upfront cost" term="installed_cost" unit="$/kW" value={out && usd(out.netCapex, 0)}
              hint={resource && `${usd(form.costPerKwh, 0)}/kWh × ${resource.durationH} h${form.itcPct ? `, less ${num(form.itcPct, 1)}% tax credit` : ''}.`}
            />
          </SimpleGrid>
          {out && <Text size="sm" c="dimmed" lh={1.45} data-testid="econ-verdict">{economicsVerdict(out, { source: rev, stackOffered: !!offered.stack })}</Text>}
          {rows && out && <TornadoCard rows={rows} base={out.npv} scenario={scenario} />}
        </Stack>
      </SimpleGrid>

      <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="section" aria-label="How this is calculated">
        <Title order={2} fz={20} mb="sm" style={{ letterSpacing: '-0.014em' }}>How this is calculated</Title>
        <Stack gap={8} maw={820}>
          <Text size="sm" lh={1.55}>
            <b>Cash flows (per kW).</b> Year 0 is the installed cost × duration, less the tax credit. Each year 1 to N earns the backtested revenue ×
            (1 − haircut), shrunk by the annual decline after year 1, less fixed O&amp;M; the augmentation payment lands in its year. Amounts are
            in constant dollars, discounted at the end of each year.
          </Text>
          <Text size="sm" lh={1.55}>
            <b>Revenue.</b> The backtest is one historical year, so it is treated as the first-year revenue. A past year is not a forecast: spreads
            moved a lot between 2024 and 2026, and the 2026 figure is a partial year scaled to 365 days. The haircut and decline are the
            levers for that uncertainty, not measured values.
          </Text>
          <Text size="sm" lh={1.55}>
            <b>Levelized cost</b> divides discounted lifetime costs by discounted MWh discharged (cycles per year × duration, held flat).
            <b> Breakeven capex</b> is exact because NPV is linear in installed cost. <b>Sensitivity</b> moves one input at a time by the stated
            step; it does not show interactions.
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
