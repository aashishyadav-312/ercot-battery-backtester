import type { ComponentProps, ReactNode, Ref } from 'react';
import { VIEW_H, VIEW_W, type MapDot, type Metric } from '../../data/atlas';
import { fill } from '../home/HomeMap';
import classes from './AtlasMap.module.css';

/** Smallest clickable radius around a dot, in viewBox units, so the smallest dots can still be hit with a mouse. */
const HIT_R = 7;

/**
 * Every placed node of the all-node run in the spec projection (src/data/home.ts), with the same size, opacity and
 * colour rules as the Home map. Clicking a dot selects it. The dots are not tab stops (there are hundreds); the
 * ranked list, the search box and the table below are the keyboard path, so the drawing itself is one labelled image.
 */
export function AtlasMap({ outline, dots, metric, zoneOf, zone, selected, onSelect, label, v4 }: {
  outline: string;
  dots: MapDot[];
  metric: Metric;
  /** Load zone of each node, by code, for dimming nodes outside the zone filter. */
  zoneOf: Map<string, string | null>;
  zone: string | null;
  selected: string | null;
  onSelect: (code: string) => void;
  label: string;
  /**
   * V4 only (map context, site search). Absent on the live site, where nothing below changes: `viewBox` zooms the drawing,
   * `zoom` keeps dot sizes and line weights readable when zoomed, `under` and `over` are extra layers behind and in front
   * of the nodes, `picking` pauses node clicks while a site is being picked, and `svgProps` and `svgRef` reach the svg.
   */
  v4?: {
    viewBox?: string; zoom?: number; under?: ReactNode; over?: ReactNode; picking?: boolean;
    svgProps?: ComponentProps<'svg'>; svgRef?: Ref<SVGSVGElement>;
  };
}) {
  const on = dots.find((d) => d.code === selected);
  const inZone = (code: string) => !zone || zoneOf.get(code) === zone;
  const zoom = v4?.zoom ?? 1;
  const k = 1 / Math.sqrt(zoom); // dots shrink a little as the map zooms in, so they stay apart
  const picking = !!v4?.picking;
  return (
    <svg
      {...v4?.svgProps} ref={v4?.svgRef} className={classes.map} viewBox={v4?.viewBox ?? `0 0 ${VIEW_W} ${VIEW_H}`} role="img"
      aria-label={label} data-metric={metric} data-picking={picking || undefined} data-zoomed={zoom > 1 || undefined}
    >
      <path d={outline} className={classes.land} style={zoom > 1 ? { strokeWidth: 1.2 / zoom } : undefined} />
      {v4?.under}
      {/* Nodes outside the zone filter sit underneath, dimmed, so the zone keeps its geography. */}
      {[false, true].map((front) => (
        <g key={String(front)} aria-hidden="true">
          {dots.filter((d) => inZone(d.code) === front).map((d) => (
            <g key={d.code} className={classes.node} data-out={!front || undefined} onClick={front && !picking ? () => onSelect(d.code) : undefined}>
              <title>{d.code}</title>
              {front && d.halo && <circle cx={d.x} cy={d.y} r={d.haloR * k} className={classes.halo} style={{ fill: fill(d, metric) }} />}
              <circle
                cx={d.x} cy={d.y} r={d.r * k}
                className={d.county ? classes.county : classes.dot}
                style={d.county ? { stroke: fill(d, metric), opacity: d.opacity } : { fill: fill(d, metric), opacity: d.opacity }}
              />
              <circle cx={d.x} cy={d.y} r={Math.max(d.r, HIT_R) * k} className={classes.hit} />
            </g>
          ))}
        </g>
      ))}
      {on && (
        <g className={classes.selected} aria-hidden="true">
          <circle cx={on.x} cy={on.y} r={(on.r + 5) * k} />
          <circle cx={on.x} cy={on.y} r={(on.r + 10) * k} className={classes.outer} />
        </g>
      )}
      {v4?.over}
    </svg>
  );
}
