import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActionIcon, Group, Tooltip, useComputedColorScheme } from '@mantine/core';
import * as echarts from 'echarts/core';
import { LinesChart } from 'echarts/charts';
import { GeoComponent } from 'echarts/components';
import { Chart, tooltipBase, type ChartTheme } from '../Chart';
import { IconMinus, IconPlus, IconReset } from '../Icons';
import { captureColor, markerSize, type Domain } from './scale';
import type { LocationRec, TexasGeo } from '../../data/types';
import { usd } from '../../data/format';

// Geo pieces are registered here (not in Chart.tsx) so they ship only in the lazily loaded Map page chunk.
echarts.use([GeoComponent, LinesChart]);

const MAP_NAME = 'texas-counties';

export interface MapPoint {
  loc: LocationRec;
  revenue: number | null;
  capture: number | null;
}

/** Fly-to request from the search box; `n` changes on every request so the same node can be chosen twice. */
export interface Focus {
  code: string;
  n: number;
}

let registered = false;
function ensureMap(geo: TexasGeo) {
  if (registered) return;
  echarts.registerMap(MAP_NAME, { type: 'FeatureCollection', features: geo.counties.features } as never);
  registered = true;
}

/** Outer rings of the state outline (the mainland plus any islands), drawn as a line over the county fills. */
function outlineRings(geo: TexasGeo): [number, number][][] {
  const g = geo.state.geometry;
  return g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
}

function bboxCenter(geo: TexasGeo): [number, number] {
  const pts = outlineRings(geo).flat();
  const lon = pts.map((p) => p[0]);
  const lat = pts.map((p) => p[1]);
  return [(Math.min(...lon) + Math.max(...lon)) / 2, (Math.min(...lat) + Math.max(...lat)) / 2];
}

interface Props {
  geo: TexasGeo;
  points: MapPoint[];
  domain: Domain;
  selected: string;
  onSelect: (code: string) => void;
  focus: Focus | null;
  height: number;
  label: string;
}

/**
 * Texas county map drawn with echarts' geo component (no mapping library, no tiles).
 * Marker size = $/kW-yr, colour = capture rate. Hubs are diamonds at a representative city, nodes are circles at their plant.
 */
export function TexasMap({ geo, points, domain, selected, onSelect, focus, height, label }: Props) {
  ensureMap(geo);
  const mode = useComputedColorScheme('light');
  const chart = useRef<echarts.ECharts | null>(null);
  const home = useMemo(() => bboxCenter(geo), [geo]);
  const rings = useMemo(() => outlineRings(geo), [geo]);

  const build = useCallback(
    (t: ChartTheme) => {
      const item = (p: MapPoint) => {
        const on = p.loc.code === selected;
        return {
          name: p.loc.name,
          code: p.loc.code,
          value: [p.loc.lon, p.loc.lat, p.revenue, p.capture],
          symbolSize: markerSize(p.revenue, domain),
          z: on ? 30 : 10,
          itemStyle: { color: captureColor(p.capture, domain, t.mode), borderColor: on ? t.text : t.surface, borderWidth: on ? 3 : 1.5, opacity: 0.96 },
        };
      };
      const series = (id: string, symbol: string, kind: LocationRec['type']) => ({
        id, name: id, type: 'scatter', coordinateSystem: 'geo', symbol,
        data: points.filter((p) => p.loc.geocoded && p.loc.type === kind).map(item),
        label: {
          show: true, position: 'right', distance: 6, formatter: '{b}', color: t.text, fontSize: 11, fontWeight: 560,
          textBorderColor: t.surface, textBorderWidth: 3,
        },
        labelLayout: { hideOverlap: true },
        emphasis: { scale: 1.12, focus: 'none' },
        cursor: 'pointer',
      });
      return {
        tooltip: {
          ...tooltipBase(t),
          trigger: 'item',
          formatter: (p: { seriesType?: string; name: string; value: (number | null)[] }) => 
            p.seriesType === 'scatter' ? `<b>${p.name}</b><br/>${p.value[2] == null ? '–' : usd(p.value[2], 1)} per kW-yr` : '',
        },
        geo: {
          map: MAP_NAME, roam: true, silent: true, scaleLimit: { min: 1, max: 14 }, aspectScale: 0.86, layoutCenter: ['50%', '52%'], layoutSize: '104%',
          itemStyle: { areaColor: t.mode === 'light' ? '#eeede9' : '#242423', borderColor: t.mode === 'light' ? '#d9d8d2' : '#3a3a37', borderWidth: 0.5 },
          emphasis: { disabled: true }, select: { disabled: true }, label: { show: false },
        },
        series: [
          {
            id: 'outline', name: 'outline', type: 'lines', coordinateSystem: 'geo', polyline: true, silent: true, z: 5,
            data: rings.map((coords) => ({ coords })), lineStyle: { color: t.baseline, width: 1.3, opacity: 0.9 },
          },
          series('Hubs', 'diamond', 'hub'),
          series('Resource nodes', 'circle', 'node'),
        ],
      };
    },
    [points, domain, selected, rings],
  );

  const zoom = (f: number) => {
    const c = chart.current;
    if (c) c.dispatchAction({ type: 'geoRoam', componentType: 'geo', zoom: f, originX: c.getWidth() / 2, originY: c.getHeight() / 2 });
  };
  const reset = () => chart.current?.setOption({ geo: { center: home, zoom: 1 } });

  // Search box: centre and zoom on the requested node.
  useEffect(() => {
    if (!focus) return;
    const p = points.find((x) => x.loc.code === focus.code);
    if (p?.loc.geocoded) chart.current?.setOption({ geo: { center: [p.loc.lon, p.loc.lat], zoom: 4 } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div style={{ position: 'relative' }} data-scheme={mode}>
      <Chart
        build={build} height={height} label={label}
        onChartReady={(c) => { chart.current = c; }}
        onClick={(p) => {
          const d = p.data as { code?: string } | undefined;
          if (p.componentType === 'series' && p.seriesType === 'scatter' && d?.code) onSelect(d.code);
        }}
      />
      <Group gap={4} style={{ position: 'absolute', top: 8, right: 8 }} role="group" aria-label="Map zoom">
        <Tooltip label="Zoom in"><ActionIcon variant="default" size="lg" aria-label="Zoom in" onClick={() => zoom(1.5)}><IconPlus /></ActionIcon></Tooltip>
        <Tooltip label="Zoom out"><ActionIcon variant="default" size="lg" aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}><IconMinus /></ActionIcon></Tooltip>
        <Tooltip label="Reset view"><ActionIcon variant="default" size="lg" aria-label="Reset map view" onClick={reset}><IconReset /></ActionIcon></Tooltip>
      </Group>
    </div>
  );
}
