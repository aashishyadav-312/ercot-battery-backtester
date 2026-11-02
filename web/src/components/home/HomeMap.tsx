import type { CSSProperties } from 'react';
import { VIEW_H, VIEW_W, calloutWidth, type MapDot, type Metric } from '../../data/home';
import classes from './HomeMap.module.css';

export interface Marker {
  n: number;
  x: number;
  y: number;
  /** Short callout text: place name and the value of the active metric. */
  callout: string;
  /** Second callout line, e.g. "location under review" or "hub, schematic". */
  note: string | null;
  /** Hover text: what the marker is and how it was placed. */
  tip: string;
}

/** Fill for a dot: the metric's colour for the top tenth, a mix for the upper half, the neutral grey below. */
export const METRIC_VAR: Record<Metric, string> = { rev: 'var(--amber)', capture: 'var(--mint)', top10: 'var(--bone)' };
export function fill(d: MapDot, metric: Metric) {
  const c = METRIC_VAR[metric];
  return d.tier === 'top' ? c : d.tier === 'mid' ? `color-mix(in srgb, ${c} 60%, var(--dot-low))` : 'var(--dot-low)';
}

/**
 * Texas with every placed node of the all-node run, drawn in the spec projection (src/data/home.ts). No card around
 * it: it shares the hero's glow. The numbered markers are chosen with the chips below the map, which are the keyboard
 * path; clicking a marker does the same.
 */
export function HomeMap({ outline, dots, metric, markers, selected, onSelect, label }: {
  outline: string;
  dots: MapDot[];
  metric: Metric;
  markers: Marker[];
  selected: number;
  onSelect: (n: number) => void;
  label: string;
}) {
  const top3 = dots.slice(-3).map((d) => d.code); // the three largest values breathe, each a third of a cycle behind the last
  const breathing = new Set(top3);
  const on = markers.find((m) => m.n === selected);
  return (
    <svg className={classes.map} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={label} data-metric={metric}>
      <path d={outline} className={classes.land} />
      <g>
        {dots.map((d) => (
          <g key={d.code} className={breathing.has(d.code) ? classes.breathe : undefined} style={breathing.has(d.code) ? ({ '--n': top3.indexOf(d.code) } as CSSProperties) : undefined}>
            {d.halo && <circle cx={d.x} cy={d.y} r={d.haloR} className={classes.halo} style={{ fill: fill(d, metric) }} />}
            {breathing.has(d.code) && <circle cx={d.x} cy={d.y} r={d.r} className={classes.ring} style={{ stroke: fill(d, metric) }} />}
            <circle
              cx={d.x} cy={d.y} r={d.r}
              className={d.county ? classes.county : classes.dot}
              style={d.county ? { stroke: fill(d, metric), opacity: d.opacity } : { fill: fill(d, metric), opacity: d.opacity }}
            />
          </g>
        ))}
      </g>
      {markers.map((m) => (
        <g key={m.n} className={classes.marker} data-on={m.n === selected || undefined} onClick={() => onSelect(m.n)}>
          <title>{m.tip}</title>
          <circle cx={m.x} cy={m.y} r={11} className={classes.markerDisc} />
          <text x={m.x} y={m.y} className={classes.markerNum} textAnchor="middle" dominantBaseline="central">{m.n}</text>
        </g>
      ))}
      {on && <Callout m={on} />}
    </svg>
  );
}

function Callout({ m }: { m: Marker }) {
  const w = Math.max(calloutWidth(m.callout), m.note ? calloutWidth(m.note) : 0);
  const h = m.note ? 40 : 24;
  // Level with the marker, to its left, flipped to the right when that would leave the map.
  let x = m.x - w - 18;
  if (x < 4) x = m.x + 18;
  x = Math.min(x, VIEW_W - w - 4);
  const y = Math.min(Math.max(4, m.y - h / 2), VIEW_H - h - 4);
  return (
    <g className={classes.callout} aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} rx={6} />
      <text x={x + 8} y={y + 16}>{m.callout}</text>
      {m.note && <text x={x + 8} y={y + 32} className={classes.calloutNote}>{m.note}</text>}
    </g>
  );
}
