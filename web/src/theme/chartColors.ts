// Chart colours, read from the design tokens in styles/tokens.css so charts follow the theme with no colour values of
// their own. Chart components take every colour from here; a test (chartColors.test.ts) fails if one hardcodes a hex.
//
// Mapping (docs/PLAN_V3_POLISH.md, step 4): perfect foresight and charging are mint, the day-ahead plan and discharging
// are amber; before RTC+B, earlier years and unselected durations are grey steps; after RTC+B, the latest or selected
// year and the selected duration are amber. The --chart-* tokens are the mark colours: each passes 3:1 on the panel.

export type ChartMode = 'light' | 'dark';

export interface ChartTheme {
  mode: ChartMode;
  surface: string;
  text: string;
  muted: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  amber: string;
  mint: string;
  /** Second mint step (regulation down next to regulation up). */
  mint2: string;
  /** Grey marks, strongest first. */
  grey: [string, string, string];
  /** Thin context lines (other hubs): quiet on purpose. */
  line2: string;
  /** Marker for a location with no value. */
  noData: string;
  land: string;
  landStroke: string;
  foresight: string;
  plan: string;
  charge: string;
  discharge: string;
  before: string;
  after: string;
  selected: string;
}

const TOOLTIP = {
  light: { bg: 'rgba(255,255,255,0.94)', border: 'rgba(21,23,26,0.12)' },
  dark: { bg: 'rgba(28,32,36,0.94)', border: 'rgba(232,230,225,0.14)' },
};

const read = (name: string) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  } catch {
    return '';
  }
};

/** Chart colours for the theme on <html> now. `mode` must match it (SchemeProvider sets both in a layout effect). */
export function chartColors(mode: ChartMode): ChartTheme {
  const amber = read('chart-amber');
  const mint = read('chart-mint');
  const grey = [read('chart-grey-1'), read('chart-grey-2'), read('chart-grey-3')] as [string, string, string];
  return {
    mode,
    surface: read('panel'),
    text: read('text'),
    muted: read('muted'),
    grid: read('line'),
    axis: read('line-2'),
    tooltipBg: TOOLTIP[mode].bg,
    tooltipBorder: TOOLTIP[mode].border,
    amber,
    mint,
    mint2: read('chart-mint-2'),
    grey,
    line2: read('line-2'),
    noData: read('dot-low'),
    land: read('land'),
    landStroke: read('land-stroke'),
    foresight: mint,
    plan: amber,
    charge: mint,
    discharge: amber,
    before: grey[1],
    after: amber,
    selected: amber,
  };
}

const rgb = (c: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
};

/** `c` at opacity `a`, as rgba. Colours that are not 6-digit hex come back unchanged. */
export function alpha(c: string, a: number): string {
  const v = rgb(c);
  return v ? `rgba(${v.join(',')},${a})` : c;
}

/** `a` mixed with `b`, `k` of the way to `a` (k = 1 is `a`). */
export function mix(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  return `rgb(${x.map((v, i) => Math.round(v * k + y[i] * (1 - k))).join(',')})`;
}

/** Vertical fade from a colour to transparent, for area fills. */
export const fade = (c: string, top = 0.22) => ({
  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [{ offset: 0, color: alpha(c, top) }, { offset: 1, color: alpha(c, 0) }],
});

/** `n` grey-to-amber steps for an ordered series (years): earlier entries grey, the last amber. */
export function steps(t: ChartTheme, n: number): string[] {
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? t.amber : t.grey[Math.min(2, n - 2 - i)]));
}
