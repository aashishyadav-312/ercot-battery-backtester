import { useEffect, useRef } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  AriaComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TitleComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { CHART, CHART_FONT } from '../theme';

echarts.use([
  BarChart, LineChart, HeatmapChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent,
  VisualMapComponent, MarkLineComponent, MarkAreaComponent, TitleComponent, DataZoomComponent, AriaComponent, SVGRenderer,
]);

export type ChartTheme = (typeof CHART)['light'] & { mode: 'light' | 'dark' };

/** Axis styling shared by every card so each chart only supplies data and series. */
export function axisBase(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11, margin: 10 },
    splitLine: { lineStyle: { color: t.grid } },
    nameTextStyle: { color: t.muted, fontSize: 11 },
  };
}

/** Legend as quiet chips above the plot. */
export const legendBase = (t: ChartTheme) => ({
  top: 0, left: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16,
  textStyle: { color: t.muted, fontSize: 11 },
});

export const tooltipBase = (t: ChartTheme) => ({
  backgroundColor: t.tooltipBg,
  borderColor: t.tooltipBorder,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: t.text, fontSize: 12, fontFamily: CHART_FONT },
  extraCssText:
    'border-radius:10px;box-shadow:0 2px 6px rgb(0 0 0/.06),0 12px 32px rgb(0 0 0/.14);' +
    '-webkit-backdrop-filter:saturate(180%) blur(16px);backdrop-filter:saturate(180%) blur(16px);' +
    'font-variant-numeric:tabular-nums;line-height:1.55;',
  confine: true,
  transitionDuration: 0.18,
});

interface Props {
  build: (t: ChartTheme) => EChartsCoreOption;
  height: number | string;
  label: string;
}

type SeriesLike = { id?: string; name?: string };

/**
 * The single place that owns echarts lifecycle, resize, colour scheme and animation.
 *
 * Updates MERGE into the live chart (series matched by id) rather than replacing it, so when a
 * selector changes the bars, lines and cells travel from their current on-screen values to the
 * new ones. Series that disappear are removed (replaceMerge). Reduced motion turns animation off.
 * The SVG renderer keeps text as real text, so axis labels get tabular figures from CSS.
 */
export function Chart({ build, height, label }: Props) {
  const scheme = useComputedColorScheme('light');
  const reduce = useReducedMotion();
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: 'svg' });
    inst.current = chart;
    const ro = new ResizeObserver(() => chart.resize({ animation: { duration: 0 } }));
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = inst.current;
    if (!chart) return;
    const t: ChartTheme = { ...CHART[scheme], mode: scheme };
    const opt = build(t) as Record<string, unknown>;
    const series = ([] as SeriesLike[]).concat((opt.series as SeriesLike | SeriesLike[] | undefined) ?? []);
    const withIds = series.map((s, i) => ({ ...s, id: s.id ?? s.name ?? `s${i}` }));
    chart.setOption(
      {
        backgroundColor: 'transparent',
        animation: !reduce,
        animationDuration: 700,
        animationEasing: 'cubicOut',
        animationDurationUpdate: 520,
        animationEasingUpdate: 'cubicInOut',
        textStyle: { fontFamily: CHART_FONT },
        ...opt,
        series: withIds,
      },
      { replaceMerge: ['series'] },
    );
  }, [build, scheme, reduce]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={label}
      className="tnum"
      style={{ width: '100%', height, fontFeatureSettings: '"tnum" 1' }}
    />
  );
}
