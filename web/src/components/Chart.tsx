import { useEffect, useRef } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  AriaComponent, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { CHART } from '../theme';

echarts.use([
  BarChart, LineChart, HeatmapChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent,
  VisualMapComponent, MarkLineComponent, DataZoomComponent, AriaComponent, CanvasRenderer,
]);

export type ChartTheme = (typeof CHART)['light'] & { mode: 'light' | 'dark' };

const tabular = { fontFeatureSettings: '"tnum"' };

/** Axis styling shared by every card so each chart only supplies data and series. */
export function axisBase(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid } },
    nameTextStyle: { color: t.muted, fontSize: 11 },
  };
}

export const tooltipBase = (t: ChartTheme) => ({
  backgroundColor: t.surface,
  borderColor: t.grid,
  borderWidth: 1,
  textStyle: { color: t.text, fontSize: 12, ...tabular },
  extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,.18);border-radius:8px;',
  confine: true,
});

interface Props {
  build: (t: ChartTheme) => EChartsCoreOption;
  height: number | string;
  label: string;
}

/** The single place that owns echarts lifecycle, resize, colour scheme and animation. */
export function Chart({ build, height, label }: Props) {
  const scheme = useComputedColorScheme('light');
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: 'canvas' });
    inst.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    const t: ChartTheme = { ...CHART[scheme], mode: scheme };
    const opt = build(t) as Record<string, unknown>;
    inst.current?.setOption(
      {
        backgroundColor: 'transparent',
        animation: !reduce,
        animationDuration: 400,
        animationDurationUpdate: 350,
        textStyle: { fontFamily: 'inherit', ...tabular },
        ...opt,
      },
      { notMerge: true },
    );
  }, [build, scheme, reduce]);

  return <div ref={el} role="img" aria-label={label} style={{ width: '100%', height }} />;
}
