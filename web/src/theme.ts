import {
  ActionIcon, Alert, Anchor, AppShell, Badge, Modal, NavLink, Paper, Select, Skeleton, Table, Text, Title, Tooltip,
  createTheme, rem, type CSSVariablesResolver, type MantineColorsTuple,
} from '@mantine/core';
import classes from './theme.module.css';

/*
 * Design tokens. Everything visual is set here and in theme.module.css (pseudo-classes and
 * media queries the theme object can't express). Components only pick sizes and variants.
 *
 * Colour: warm neutral grays plus ONE accent. The accent is the validated chart blue
 * (categorical slot 1), so a selected control and the main data series read as the same thing.
 */

// Accent (blue). Shade 6 = chart blue in light mode, shade 5 = chart blue in dark mode.
const accent: MantineColorsTuple = [
  '#edf4fd', '#d8e7fb', '#b0cff6', '#86b6ef', '#5598e7',
  '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#104281',
];

// Light-mode neutrals: the warm grays the chart palette was validated against.
const gray: MantineColorsTuple = [
  '#f7f7f5', '#f0efec', '#e8e7e3', '#dddcd7', '#c8c7c1',
  '#a8a7a0', '#6b6a66', '#52514e', '#3a3936', '#232321',
];

// Dark-mode neutrals. Mantine reads: 0 text, 2 dimmed, 4 borders, 6 inputs, 7 surfaces.
const dark: MantineColorsTuple = [
  '#f0efec', '#d6d5cf', '#a8a7a0', '#85847d', '#383835',
  '#2e2e2c', '#242423', '#1a1a19', '#121211', '#0c0c0b',
];

const FONT = '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  primaryColor: 'accent',
  primaryShade: { light: 6, dark: 5 },
  colors: { accent, gray, dark },
  black: '#161615',
  white: '#ffffff',
  autoContrast: true,
  respectReducedMotion: true,
  cursorType: 'pointer',
  focusRing: 'auto',

  // Type: one optical-size variable face. Scale is 12 / 13 / 15 / 17 / 20, headings 22–40.
  fontFamily: FONT,
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSizes: { xs: rem(12), sm: rem(13), md: rem(15), lg: rem(17), xl: rem(20) },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.55', lg: '1.5', xl: '1.4' },
  headings: {
    fontFamily: FONT,
    fontWeight: '640',
    textWrap: 'balance',
    sizes: {
      h1: { fontSize: rem(40), lineHeight: '1.08', fontWeight: '680' },
      h2: { fontSize: rem(30), lineHeight: '1.12', fontWeight: '660' },
      h3: { fontSize: rem(20), lineHeight: '1.25', fontWeight: '620' },
      h4: { fontSize: rem(17), lineHeight: '1.3', fontWeight: '620' },
      h5: { fontSize: rem(15), lineHeight: '1.35', fontWeight: '600' },
      h6: { fontSize: rem(13), lineHeight: '1.4', fontWeight: '600' },
    },
  },

  // Spacing on a 4px rhythm.
  spacing: { xs: rem(8), sm: rem(12), md: rem(16), lg: rem(24), xl: rem(40) },
  radius: { xs: rem(6), sm: rem(8), md: rem(10), lg: rem(16), xl: rem(22) },
  defaultRadius: 'md',
  shadows: {
    xs: '0 1px 1px rgb(22 22 21 / 0.03)',
    sm: '0 1px 2px rgb(22 22 21 / 0.04), 0 2px 6px rgb(22 22 21 / 0.03)',
    md: '0 1px 2px rgb(22 22 21 / 0.04), 0 8px 24px rgb(22 22 21 / 0.07)',
    lg: '0 2px 6px rgb(22 22 21 / 0.06), 0 16px 40px rgb(22 22 21 / 0.12)',
    xl: '0 4px 12px rgb(22 22 21 / 0.08), 0 32px 72px rgb(22 22 21 / 0.18)',
  },

  components: {
    AppShell: AppShell.extend({ classNames: { root: classes.shell, header: classes.header, navbar: classes.navbar, main: classes.main } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' }, classNames: { root: classes.paper } }),
    Title: Title.extend({ classNames: { root: classes.title } }),
    Text: Text.extend({ classNames: { root: classes.text } }),
    NavLink: NavLink.extend({ classNames: { root: classes.navLink, label: classes.navLabel, section: classes.navSection } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: 'md' }, classNames: { root: classes.actionIcon } }),
    Select: Select.extend({
      defaultProps: { radius: 'md', variant: 'filled', withCheckIcon: false, comboboxProps: { shadow: 'lg', radius: 'md', transitionProps: { transition: 'pop', duration: 140 } } },
      classNames: { input: classes.selectInput, label: classes.inputLabel, option: classes.option, dropdown: classes.dropdown, groupLabel: classes.groupLabel },
    }),
    Tooltip: Tooltip.extend({ defaultProps: { openDelay: 350, radius: 'sm', transitionProps: { transition: 'fade', duration: 120 } }, classNames: { tooltip: classes.tooltip } }),
    Modal: Modal.extend({
      defaultProps: { radius: 'lg', shadow: 'xl', overlayProps: { backgroundOpacity: 0.35, blur: 6 }, transitionProps: { transition: 'pop', duration: 220 } },
      classNames: { content: classes.modalContent, header: classes.modalHeader, title: classes.modalTitle },
    }),
    Table: Table.extend({ defaultProps: { tabularNums: true, verticalSpacing: 7, horizontalSpacing: 'sm', fz: 'sm' }, classNames: { table: classes.table, th: classes.th, tr: classes.tr } }),
    Anchor: Anchor.extend({ classNames: { root: classes.anchor } }),
    Badge: Badge.extend({ defaultProps: { radius: 'sm' }, classNames: { root: classes.badge } }),
    Alert: Alert.extend({ defaultProps: { radius: 'lg', variant: 'light' }, classNames: { root: classes.alert, title: classes.alertTitle } }),
    Skeleton: Skeleton.extend({ classNames: { root: classes.skeleton } }),
  },
});

/** App-level tokens the Mantine defaults don't cover: page canvas, hairlines, glass. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--app-ease': 'cubic-bezier(0.22, 1, 0.36, 1)',
    '--app-ease-inout': 'cubic-bezier(0.65, 0, 0.35, 1)',
    '--app-header-h': rem(60),
  },
  light: {
    '--app-canvas': '#f4f4f2',
    '--app-hairline': 'rgb(22 22 21 / 0.08)',
    '--app-hairline-strong': 'rgb(22 22 21 / 0.14)',
    '--app-glass': 'rgb(244 244 242 / 0.72)',
    '--app-card-hover-border': 'rgb(22 22 21 / 0.16)',
    '--app-accent-text': 'var(--mantine-color-accent-7)',
    '--mantine-color-dimmed': 'var(--mantine-color-gray-6)',
    '--mantine-color-default-border': 'var(--mantine-color-gray-3)',
    '--mantine-color-default-hover': 'var(--mantine-color-gray-1)',
  },
  dark: {
    '--app-canvas': '#0f0f0e',
    '--app-hairline': 'rgb(240 239 236 / 0.08)',
    '--app-hairline-strong': 'rgb(240 239 236 / 0.14)',
    '--app-glass': 'rgb(15 15 14 / 0.7)',
    '--app-card-hover-border': 'rgb(240 239 236 / 0.18)',
    '--app-accent-text': 'var(--mantine-color-accent-4)',
  },
});

/**
 * Chart colours. Categorical slots are the validated palette in fixed order (blue, orange, aqua,
 * violet); light checked against the white card, dark against #1a1a19, both pass CVD and
 * normal-vision gates. Neutrals are the same warm grays as the UI so charts sit on the cards
 * without a seam. `baseline` is the neutral series colour for reference bars (hubs), ≥3:1.
 */
export const CHART = {
  light: {
    surface: '#ffffff', text: '#161615', muted: '#6b6a66', grid: '#eeede9', axis: '#d6d5cf',
    baseline: '#8f8e88',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6'],
    charge: '#2a78d6', discharge: '#eb6834', neutral: '#f0efec',
    tooltipBg: 'rgba(255,255,255,0.92)', tooltipBorder: 'rgba(22,22,21,0.08)',
  },
  dark: {
    surface: '#1a1a19', text: '#f0efec', muted: '#a8a7a0', grid: '#2a2a28', axis: '#3d3d3a',
    baseline: '#6f6e68',
    series: ['#3987e5', '#d95926', '#199e70', '#9085e9'],
    charge: '#3987e5', discharge: '#d95926', neutral: '#383835',
    tooltipBg: 'rgba(36,36,35,0.92)', tooltipBorder: 'rgba(240,239,236,0.1)',
  },
};

export const CHART_FONT = FONT;
