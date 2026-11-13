// Chart options for Data Center mode, kept apart from the components so the tests can check the series against the engine output.
import type { DispatchSample, Breakdown } from '../../custom/datacenter';
import { axisBase, legendBase, tooltipBase, type ChartTheme } from '../../components/Chart';
import { alpha } from '../../theme/chartColors';
import { usd } from '../../data/format';
import { BREAKDOWN_KEYS, waterfall, type BreakdownKey } from './dcForm';

/** One chart hue per value source; the total is grey. */
export const BREAKDOWN_TOKEN: Record<BreakdownKey, 'blue' | 'green' | 'violet' | 'orange'> = { energy: 'blue', as: 'green', fourCp: 'violet', reliability: 'orange' };

/** Waterfall in $/kW-yr: Energy, Ancillary, 4CP avoided, Reliability, then the total from zero. */
export function buildWaterfallOption(t: ChartTheme, perKw: Breakdown, peak = '4CP') {
  const steps = waterfall(perKw, peak);
  const colors = [...BREAKDOWN_KEYS.map((k) => t[BREAKDOWN_TOKEN[k]]), t.grey[0]];
  return {
    tooltip: {
      ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps: { dataIndex: number }[]) => {
        const i = ps[0]?.dataIndex ?? 0;
        const s = steps[i];
        const signed = i < BREAKDOWN_KEYS.length ? perKw[BREAKDOWN_KEYS[i]] : s.end;
        return `${s.label}: ${usd(signed, 1)} $/kW-yr`;
      },
    },
    grid: { left: 56, right: 16, top: 16, bottom: 32 },
    xAxis: { ...axisBase(t), type: 'category', data: steps.map((s) => s.label) },
    yAxis: { ...axisBase(t), type: 'value', name: '$/kW-yr', nameGap: 14 },
    series: [
      { name: 'base', type: 'bar', stack: 'w', silent: true, itemStyle: { color: 'transparent' }, data: steps.map((s) => s.base) },
      {
        name: 'Value', type: 'bar', stack: 'w', barMaxWidth: 64,
        data: steps.map((s, i) => ({ value: s.value, itemStyle: { color: colors[i] } })),
      },
    ],
  };
}

/** One day of the sample: load, battery output and grid draw (MW), with the 4CP interval and the alert window shaded. */
export function dispatchSeries(s: DispatchSample) {
  const net = s.times.map((_, i) => s.dischargeMw[i] - s.chargeMw[i]);
  return {
    load: s.loadMw,
    discharge: s.dischargeMw,
    charge: s.chargeMw.map((v) => -v),
    grid: s.loadMw.map((l, i) => l - net[i]),
  };
}

export function buildDispatchOption(t: ChartTheme, s: DispatchSample, peak = '4CP') {
  const d = dispatchSeries(s);
  const areas: object[] = [];
  if (s.windows) for (const w of s.windows) areas.push([{ xAxis: s.times[w[0]], itemStyle: { color: alpha(t.blue, 0.08) } }, { xAxis: s.times[w[1] - 1] }]);
  else if (s.window) areas.push([{ xAxis: s.times[s.window[0]], itemStyle: { color: alpha(t.blue, 0.08) } }, { xAxis: s.times[s.window[1] - 1] }]);
  if (s.fourCp) areas.push([{ xAxis: s.times[s.fourCp[0]], itemStyle: { color: alpha(t.violet, 0.28) }, name: peak }, { xAxis: s.times[s.fourCp[1] - 1] }]);
  return {
    tooltip: { ...tooltipBase(t), trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(1)} MW` },
    legend: { ...legendBase(t), data: ['Site load', 'Grid draw', 'Discharge', 'Charge'] },
    grid: { left: 56, right: 16, top: 56, bottom: 32 },
    xAxis: { ...axisBase(t), type: 'category', data: s.times, axisLabel: { color: t.muted, fontSize: 11, interval: 11 } },
    yAxis: { ...axisBase(t), type: 'value', name: 'MW', nameGap: 14 },
    series: [
      {
        name: 'Discharge', type: 'bar', stack: 'b', data: d.discharge, itemStyle: { color: t.discharge }, barCategoryGap: '10%',
        markArea: areas.length ? { silent: true, label: { show: true, color: t.muted, fontSize: 11, position: 'insideTop' }, data: areas } : undefined,
      },
      { name: 'Charge', type: 'bar', stack: 'b', data: d.charge, itemStyle: { color: t.charge } },
      { name: 'Site load', type: 'line', step: 'end', symbol: 'none', data: d.load, lineStyle: { color: t.grey[0], width: 2 }, itemStyle: { color: t.grey[0] } },
      { name: 'Grid draw', type: 'line', step: 'end', symbol: 'none', data: d.grid, lineStyle: { color: t.blue, width: 2 }, itemStyle: { color: t.blue } },
    ],
  };
}
