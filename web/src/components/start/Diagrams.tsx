import type { ReactNode } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import { CHART } from '../../theme';
import { clock } from '../../data/walkthrough';
import type { WalkDay } from '../../data/types';

/*
 * Four small inline-SVG diagrams for "ERCOT in 2 minutes". They draw with theme variables and the chart palette,
 * so they follow light and dark mode. Three are schematics (labelled as such); the day-ahead vs real-time one is
 * drawn from the real featured-day data.
 */

function useInk() {
  const scheme = useComputedColorScheme('light');
  const c = CHART[scheme];
  return {
    text: c.text, muted: c.muted, line: c.axis, grid: c.grid, surface: c.surface,
    blue: c.series[0], orange: c.series[1], green: c.series[2], violet: c.series[3], base: c.baseline,
    tint: scheme === 'dark' ? 'rgb(240 239 236 / 0.06)' : 'rgb(22 22 21 / 0.04)',
  };
}

function Frame({ label, w, h, children }: { label: string; w: number; h: number; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} fontFamily="inherit">
      {children}
    </svg>
  );
}

const FS = 11.5;

/** Arrow from (x1,y1) to (x2,y2) with a small head. */
function Arrow({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = (d: number) => x2 - 7 * Math.cos(a + d);
  const hy = (d: number) => y2 - 7 * Math.sin(a + d);
  return (
    <g stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={`M${hx(0.45)} ${hy(0.45)} L${x2} ${y2} L${hx(-0.45)} ${hy(-0.45)}`} />
    </g>
  );
}

/** 1. What ERCOT is: plants and batteries on one side, customers on the other, ERCOT balancing in the middle. */
export function ErcotDiagram() {
  const k = useInk();
  const src = [
    { y: 14, t: 'Wind', c: k.green },
    { y: 50, t: 'Solar', c: k.orange },
    { y: 86, t: 'Gas, coal', c: k.base },
    { y: 122, t: 'Batteries', c: k.blue },
  ];
  return (
    <Frame label="Diagram: power plants and batteries feed the Texas grid, ERCOT balances supply and demand and runs the markets, and the power reaches homes and businesses." w={360} h={170}>
      {src.map((s) => (
        <g key={s.t}>
          <rect x={4} y={s.y} width={92} height={28} rx={8} fill={k.tint} stroke={k.line} />
          <circle cx={19} cy={s.y + 14} r={5} fill={s.c} />
          <text x={30} y={s.y + 18} fontSize={FS} fill={k.text}>{s.t}</text>
          <Arrow x1={96} y1={s.y + 14} x2={122} y2={85} color={k.base} />
        </g>
      ))}
      <rect x={124} y={50} width={118} height={70} rx={12} fill="none" stroke={k.blue} strokeWidth={2} />
      <text x={183} y={76} fontSize={14} fontWeight={650} textAnchor="middle" fill={k.text}>ERCOT</text>
      <text x={183} y={93} fontSize={10.5} textAnchor="middle" fill={k.muted}>balances supply</text>
      <text x={183} y={107} fontSize={10.5} textAnchor="middle" fill={k.muted}>and runs the markets</text>
      <Arrow x1={242} y1={85} x2={266} y2={85} color={k.base} />
      <rect x={268} y={52} width={88} height={66} rx={12} fill={k.tint} stroke={k.line} />
      <text x={312} y={82} fontSize={FS} textAnchor="middle" fill={k.text}>Homes and</text>
      <text x={312} y={97} fontSize={FS} textAnchor="middle" fill={k.text}>businesses</text>
      <text x={180} y={158} fontSize={10.5} textAnchor="middle" fill={k.muted}>Schematic</text>
    </Frame>
  );
}

/** 2. Resource nodes roll up into load zones and hubs. */
export function LocationsDiagram() {
  const k = useInk();
  const dots = [[22, 24], [58, 14], [94, 30], [34, 62], [74, 70], [110, 58]];
  return (
    <Frame label="Diagram: many resource nodes, each one plant or battery, are averaged into a load zone price that customers pay and a hub price used as a reference." w={360} h={170}>
      <rect x={2} y={0} width={132} height={96} rx={12} fill="none" stroke={k.line} strokeDasharray="4 4" />
      {dots.map(([x, y], i) => <circle key={i} cx={x + 4} cy={y + 6} r={7} fill={i === 3 ? k.orange : k.blue} />)}
      <text x={68} y={118} fontSize={FS} textAnchor="middle" fontWeight={600} fill={k.text}>Resource nodes</text>
      <text x={68} y={133} fontSize={10.5} textAnchor="middle" fill={k.muted}>one plant or battery each;</text>
      <text x={68} y={146} fontSize={10.5} textAnchor="middle" fill={k.muted}>price includes local congestion</text>
      <Arrow x1={136} y1={34} x2={206} y2={34} color={k.base} />
      <Arrow x1={136} y1={64} x2={206} y2={110} color={k.base} />
      <rect x={208} y={10} width={148} height={46} rx={10} fill={k.tint} stroke={k.line} />
      <text x={282} y={30} fontSize={FS} textAnchor="middle" fontWeight={600} fill={k.text}>Load zone</text>
      <text x={282} y={45} fontSize={10.5} textAnchor="middle" fill={k.muted}>one averaged price for customers</text>
      <rect x={208} y={88} width={148} height={46} rx={10} fill={k.tint} stroke={k.line} />
      <text x={282} y={108} fontSize={FS} textAnchor="middle" fontWeight={600} fill={k.text}>Hub</text>
      <text x={282} y={123} fontSize={10.5} textAnchor="middle" fill={k.muted}>regional average, a smooth reference</text>
      <text x={282} y={158} fontSize={10.5} textAnchor="middle" fill={k.muted}>Schematic</text>
    </Frame>
  );
}

/** 3. Day-ahead (hourly steps) against real-time (15-minute) prices, drawn from a real featured day. */
export function DaRtDiagram({ day, where }: { day?: WalkDay; where: string }) {
  const k = useInk();
  const W = 360, Hh = 170, L = 6, R = 6, T = 14, B = 34;
  if (!day) return <div style={{ height: Hh }} aria-hidden />;
  const rt = day.price;
  const da = day.da_price ? rt.map((_, i) => day.da_price![Math.floor(i / 4)]) : undefined;
  const hi = Math.max(...rt, ...(da ?? [0]));
  const lo = Math.min(0, ...rt, ...(da ?? [0]));
  const x = (i: number) => L + (i / 96) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (Hh - T - B);
  const stepPath = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}L${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const peak = rt.indexOf(Math.max(...rt));
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <Frame
      label={`Chart: day-ahead and real-time prices at ${where} on ${date}. Day-ahead is one flat price per hour; real-time changes every 15 minutes and peaks at $${Math.round(hi).toLocaleString('en-US')} per megawatt-hour.`}
      w={W} h={Hh}
    >
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={k.line} />
      {[0, 24, 48, 72, 96].map((i) => (
        <text key={i} x={x(i)} y={Hh - B + 14} fontSize={10.5} textAnchor={i === 0 ? 'start' : i === 96 ? 'end' : 'middle'} fill={k.muted}>
          {i === 96 ? '12am' : clock(i).replace(':00 ', '')}
        </text>
      ))}
      {da && <path d={stepPath(da)} fill="none" stroke={k.base} strokeWidth={1.6} strokeDasharray="4 3" />}
      <path d={stepPath(rt)} fill="none" stroke={k.text} strokeWidth={1.5} strokeLinejoin="round" />
      <text x={Math.min(Math.max(x(peak), 70), W - 70)} y={T - 3} fontSize={10.5} textAnchor="middle" fill={k.text} fontWeight={600}>
        ${Math.round(hi).toLocaleString('en-US')}/MWh
      </text>
      <g fontSize={10.5}>
        <line x1={L} x2={L + 18} y1={Hh - 8} y2={Hh - 8} stroke={k.text} strokeWidth={1.5} />
        <text x={L + 24} y={Hh - 4} fill={k.muted}>Real-time (15 min)</text>
        {da && (
          <>
            <line x1={150} x2={168} y1={Hh - 8} y2={Hh - 8} stroke={k.base} strokeWidth={1.6} strokeDasharray="4 3" />
            <text x={174} y={Hh - 4} fill={k.muted}>Day-ahead (hourly)</text>
          </>
        )}
      </g>
    </Frame>
  );
}

/** 4. Why prices spike: a schematic supply stack with a normal and a stressed evening. */
export function SpikeDiagram() {
  const k = useInk();
  const L = 26, R = 350, Bt = 128, T = 14;
  const wd = R - L;
  // Cost steps (x as a share of supply, height as a share of the plot). Deliberately schematic: no price scale.
  const steps: { to: number; h: number; c: string; t: string }[] = [
    { to: 0.34, h: 0.1, c: k.green, t: 'Wind, solar' },
    { to: 0.58, h: 0.18, c: k.violet, t: 'Nuclear, coal' },
    { to: 0.80, h: 0.34, c: k.base, t: 'Gas' },
    { to: 0.92, h: 0.62, c: k.base, t: 'Peakers' },
    { to: 1.0, h: 1.0, c: k.orange, t: '' },
  ];
  let from = 0;
  const rects = steps.map((s) => {
    const r = { x: L + from * wd, w: (s.to - from) * wd, h: s.h * (Bt - T), c: s.c, t: s.t };
    from = s.to;
    return r;
  });
  const d1 = 0.52, d2 = 0.88;
  const yAt = (d: number) => Bt - steps.find((s) => d <= s.to)!.h * (Bt - T);
  return (
    <Frame label="Schematic: power sources lined up from cheapest to most expensive. On a normal evening demand is met by cheap sources and the price is low. On a hot, calm evening demand reaches the steep end of the line and the price jumps." w={360} h={170}>
      {rects.map((r, i) => <rect key={i} x={r.x + 0.5} y={Bt - r.h} width={r.w - 1} height={r.h} fill={r.c} opacity={0.5} rx={2} />)}
      <line x1={L} x2={R} y1={Bt} y2={Bt} stroke={k.line} />
      <line x1={L} x2={L} y1={T} y2={Bt} stroke={k.line} />
      <text x={L - 6} y={T + 6} fontSize={10.5} textAnchor="end" fill={k.muted} transform={`rotate(-90 ${L - 6} ${T + 6})`} dy={-2}>Price</text>
      {[[d1, 'Normal evening', k.blue], [d2, 'Hot, calm evening', k.orange]].map(([d, t, c]) => {
        const xx = L + (d as number) * wd;
        return (
          <g key={t as string}>
            <line x1={xx} x2={xx} y1={yAt(d as number) - 4} y2={Bt} stroke={c as string} strokeWidth={2} />
            <circle cx={xx} cy={yAt(d as number) - 4} r={4} fill={c as string} />
            <text x={xx} y={Bt + 15} fontSize={10.5} textAnchor="middle" fill={c as string} fontWeight={600}>{t as string}</text>
          </g>
        );
      })}
      <text x={L + 0.17 * wd} y={Bt - 4} fontSize={10} textAnchor="middle" fill={k.text}>cheap</text>
      <text x={L + 0.96 * wd} y={T + 8} fontSize={10} textAnchor="end" fill={k.text} dx={4}>scarce</text>
      <text x={(L + R) / 2} y={162} fontSize={10.5} textAnchor="middle" fill={k.muted}>Schematic: sources from cheapest to dearest, left to right</text>
    </Frame>
  );
}
