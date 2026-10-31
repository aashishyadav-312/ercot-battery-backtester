import { createTheme, type MantineColorsTuple } from '@mantine/core';

// One accent (blue). Shades are stepped around the validated chart blue #2a78d6.
const accent: MantineColorsTuple = [
  '#eaf3fd', '#d3e5fa', '#a6caf4', '#78aeee', '#5497e6',
  '#3987e5', '#2a78d6', '#1f62b4', '#174d91', '#10396e',
];

export const theme = createTheme({
  primaryColor: 'accent',
  primaryShade: { light: 6, dark: 5 },
  colors: { accent },
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  defaultRadius: 'md',
  headings: { fontWeight: '650' },
});

/** Chart colours. Categorical slots 1–3 are validated for CVD separation in both modes. */
export const CHART = {
  light: {
    surface: '#fcfcfb', text: '#0b0b0b', muted: '#6b6a66', grid: '#e8e7e3', axis: '#bdbcb6',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6'],
    charge: '#2a78d6', discharge: '#eb6834', neutral: '#f3f2ef',
  },
  dark: {
    surface: '#1a1a19', text: '#f0efec', muted: '#a8a7a0', grid: '#2f2f2d', axis: '#55544f',
    series: ['#3987e5', '#d95926', '#199e70', '#9085e9'],
    charge: '#3987e5', discharge: '#d95926', neutral: '#2a2a28',
  },
};
