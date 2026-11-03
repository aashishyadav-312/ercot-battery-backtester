// Chart colours, read from the design tokens in styles/tokens.css so charts follow the theme with no colour values of
// their own. Chart components take every colour from here; a test (chartColors.test.ts) fails if one hardcodes a hex.
//
// Charts use their own six hues, not the amber UI accent. Mapping: charging and perfect foresight are green, discharging
// is orange, the day-ahead plan and single revenue series are blue; before RTC+B, hubs and unselected durations are grey,
// after RTC+B and the selected duration are blue; the ten best days are orange. Stacked products take one hue each.
// The --chart-* tokens are the mark colours: each passes 3:1 on the panel.

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
  blue: string;
  green: string;
  cyan: string;
  violet: string;
  orange: string;
  rose: string;
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
  /** Marks picked out from the rest (the ten best days). */
  highlight: string;
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
  const blue = read('chart-blue');
  const green = read('chart-green');
  const orange = read('chart-orange');
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
    blue,
    green,
    cyan: read('chart-cyan'),
    violet: read('chart-violet'),
    orange,
    rose: read('chart-rose'),
    grey,
    line2: read('line-2'),
    noData: read('dot-low'),
    land: read('land'),
    landStroke: read('land-stroke'),
    foresight: green,
    plan: blue,
    charge: green,
    discharge: orange,
    before: grey[1],
    after: blue,
    selected: blue,
    highlight: orange,
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
