import { useEffect, useState } from 'react';
import { Alert, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { Card } from './Card';
import { Chart, axisBase, legendBase, tooltipBase } from './Chart';
import { useApp } from '../state';
import { loadAncillary, loadAncillaryRun, findRun } from '../data/loader';
import { pairedStack, sumStack, stackBounds, STACK_LABELS, type AncillaryFile, type StackDay, type StackRun } from '../data/ancillary';
import { usd } from '../data/format';

export function Ancillary({ comparison = false }: { comparison?: boolean }) {
  const { index, sel } = useApp();
  const [file, setFile] = useState<AncillaryFile>();
  const [loaded, setLoaded] = useState<Record<string, StackRun>>({});
  const [error, setError] = useState(false);
  const [strategy, setStrategy] = useState('energy');
  useEffect(() => {
    let live = true;
    loadAncillary().then((d) => { if (live) setFile(d); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  const row = index ? findRun(index, sel) : undefined;
  useEffect(() => {
    if (!file || !index) return;
    let live = true;
    const years = comparison ? [2024, 2025, 2026] : [sel.year];
    const keys = years.map((y) => findRun(index, sel, sel.location, y)?.file)
      .filter((k): k is string => !!k && !!file.runs[k]);
    setError(false);
    Promise.all(keys.map(async (k) => [k, await loadAncillaryRun(file.runs[k])] as const))
      .then((entries) => { if (live) setLoaded((p) => ({ ...p, ...Object.fromEntries(entries) })); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [file, index, sel.location, sel.duration, sel.deg, sel.year, comparison]);
  const run = row ? loaded[row.file] : undefined;
  const stacked = strategy === 'stacked';
  const counterpart = (year: number) => {
    const r = index ? findRun(index, sel, sel.location, year) : undefined;
    return r ? loaded[r.file]?.daily ?? [] : [];
  };
  const pairs = pairedStack([...counterpart(2024), ...counterpart(2025)], [...counterpart(2025), ...counterpart(2026)]);
  const rows = run?.daily ?? [];
  const expected = (comparison ? [2024, 2025, 2026] : [sel.year])
    .map((year) => index ? findRun(index, sel, sel.location, year)?.file : undefined);
  const pending = !file || !index || expected.some((k) => !!k && !!file.runs[k] && !loaded[k]);
  const available = comparison ? pairs.before.length > 0 : rows.length > 0;
  const buckets: { label: string; rows: StackDay[] }[] = comparison
    ? [{ label: 'Before RTC+B', rows: pairs.before }, { label: 'After RTC+B', rows: pairs.after }]
    : [...new Set(rows.map((d) => d.date.slice(0, 7)))].map((m) => ({ label: m, rows: rows.filter((d) => d.date.startsWith(m)) }));
  const values = buckets.map((b) => sumStack(b.rows, stacked));
  const total = sumStack(rows, stacked).reduce((s, v) => s + v, 0);
  const baseline = sumStack(rows, false)[0];
  const displayedRows = comparison ? [...pairs.before, ...pairs.after] : rows;
  const uncertainDays = displayedRows.filter((r) => r.solver_gap === null || (r.solver_gap ?? 0) > 1e-3 + 1e-8).length;
  return (
    <Card title={comparison ? 'RTC+B: energy and ancillary revenue' : 'Energy and ancillary revenue'}
      terms="ancillary_services"
      subtitle={comparison ? 'Same calendar days one year apart; actual $/kW over each matched window.' : 'Compare strategies on identical as-posted prices and days. KPI tiles and other charts remain energy-only.'}
      csv={available ? () => ({ filename: `${comparison ? 'rtcb' : sel.year}_${sel.location}_${sel.duration}h_deg${sel.deg}_${strategy}.csv`,
        headers: ['Period', ...STACK_LABELS.map((l) => `${l} ($/kW)`)], rows: buckets.map((b, i) => [b.label, ...values[i]]) }) : undefined}>
      {(expanded) => <Stack gap="md">
        <Group justify="space-between">
          <SegmentedControl aria-label="Revenue stack strategy" value={strategy} onChange={setStrategy}
            data={[{ value: 'energy', label: 'Energy only' }, { value: 'stacked', label: 'Energy + AS' }]} />
          {!comparison && available && <Text fw={600}>{usd(total, 2)}/kW over {rows.length} covered days</Text>}
        </Group>
        {error ? <Alert color="red">Ancillary results could not be loaded. Existing energy-only results are still available.</Alert>
          : pending ? <Text c="dimmed">Loading ancillary results…</Text>
          : !available ? <Alert color="yellow">No complete ancillary backtest for this selection yet. Missing AS prices are never treated as zero.</Alert>
          : <>
            <Chart height={expanded ? '65vh' : 340} label="Revenue by energy and ancillary product"
              build={(t) => ({
                color: ['#3182ce', '#2f9e7a', '#79b86a', '#9566bb', '#d79740', '#bd6173'],
                tooltip: { ...tooltipBase(t), trigger: 'axis', valueFormatter: (v: number) => usd(v, 3) },
                legend: { ...legendBase(t), type: 'scroll' },
                grid: { left: 55, right: 16, top: 70, bottom: 55 },
                xAxis: { ...axisBase(t), type: 'category', data: buckets.map((b) => b.label), axisLabel: { color: t.muted, rotate: comparison ? 0 : 45 } },
                yAxis: { ...axisBase(t), type: 'value', name: '$/kW', nameGap: 14 },
                series: STACK_LABELS.map((name, j) => ({ name, type: 'bar', stack: 'revenue',
                  data: values.map((v) => v[j]), barMaxWidth: comparison ? 90 : 32 })),
              })} />
            <Text size="sm" c="dimmed">
              {comparison ? `${pairs.before.length} paired days per window, Dec 5–Oct 24. Price basis changes from hourly day-ahead AS to 15-minute real-time AS on Dec 5, 2025. Changes reflect market prices, model rules and fleet conditions; this is not a causal RTC+B estimate.`
                : `${rows[0].date} to ${rows[rows.length-1].date}; ${run?.skipped_days.length ?? 0} incomplete days excluded. Energy-only comparison: ${usd(baseline, 2)}/kW. ${stacked ? `Modeled uplift: ${usd(total-baseline, 2)}/kW.` : ''} These are period totals, not annualized rates.`}
            </Text>
            {uncertainDays > 0 && <Alert color="yellow">{uncertainDays} displayed days did not reach the 0.1% solver-gap target. Feasible schedules are shown; these are not proven optima.</Alert>}
            {stacked && uncertainDays > 0 && <Text size="sm" c="dimmed">Approximate solver ranges: {(comparison ? buckets : [{label:'Selected period',rows}]).map((b) => {
              const bound = stackBounds(b.rows);
              return `${b.label}: ${usd(bound.lower,2)}–${bound.upper == null ? 'unknown upper bound' : usd(bound.upper,2)}/kW`;
            }).join('; ')}. These reflect numerical uncertainty only, not forecast or operating risk.</Text>}
          </>}
        <Text size="xs" c="dimmed">Capacity-only screening with perfect foresight, shared power and energy backing. No AS deployment energy, mileage, penalties, outages, qualification or market-depth limits. AS prices are system-wide; allocation and earnings depend on the location’s energy opportunity cost. Original hub charts use corrected energy-price archives, so their baseline may differ. See Method for reserve durations and sources.</Text>
      </Stack>}
    </Card>
  );
}
