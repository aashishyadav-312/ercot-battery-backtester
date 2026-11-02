import {
  ActionIcon, Alert, Anchor, Badge, Button, Modal, NavLink, Paper, Select, Skeleton, Table, Text, Title, Tooltip,
  createTheme, rem, type CSSVariablesResolver, type MantineColorsTuple,
} from '@mantine/core';
import classes from './theme.module.css';

/*
 * Mantine mapped onto the Chargeline tokens (src/styles/tokens.css). The tokens are the source of truth:
 * the resolver below points Mantine's surface, text, border and primary variables at them, so a component
 * that asks Mantine for "body", "dimmed" or "primary" gets the token for the active theme.
 * Pseudo-classes and media queries the theme object can't express live in theme.module.css.
 *
 * Primary is amber. Charts still draw their series in the earlier blue/orange/aqua/violet set until
 * each page is redesigned (CHART below); only the surfaces under them moved to the new tokens.
 */

// Amber ramp. Shade 5 is the token --amber (#F2A93B), the fill for buttons and selected controls.
const accent: MantineColorsTuple = [
  '#fff6e4', '#fde9c2', '#fbd991', '#f8c963', '#f5b94b',
  '#f2a93b', '#d98f1f', '#b87310', '#8f5200', '#5f3600',
];

// Neutrals tuned to the tokens: light mode reads bg, track, line, line-2, faint, muted.
const gray: MantineColorsTuple = [
  '#f2f1ed', '#ece9e2', '#e4e1d9', '#dad7cf', '#c9c6bc',
  '#b4b0a5', '#55595e', '#3f4348', '#2a2d31', '#15171a',
];

// Dark mode reads text, muted, faint, line-2, panel and bg through these.
const dark: MantineColorsTuple = [
  '#e8e6e1', '#d3d1cc', '#b8bdc2', '#a3a9af', '#3a4046',
  '#2b3136', '#242a2f', '#171a1d', '#0f1113', '#0a0c0d',
];

const FONT = '"DM Sans Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Bricolage Grotesque Variable", "DM Sans Variable", ui-sans-serif, system-ui, sans-serif';
const FONT_MONO = '"DM Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const theme = createTheme({
  primaryColor: 'accent',
  primaryShade: { light: 5, dark: 5 },
  colors: { accent, gray, dark },
  black: '#15171a',
  white: '#ffffff',
  autoContrast: true,
  respectReducedMotion: true,
  cursorType: 'pointer',
  focusRing: 'auto',

  // Type: DM Sans for reading, Bricolage Grotesque for headings, DM Mono for figures and labels.
  fontFamily: FONT,
  fontFamilyMonospace: FONT_MONO,
  fontSizes: { xs: rem(12), sm: rem(13), md: rem(15), lg: rem(17), xl: rem(20) },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.55', lg: '1.5', xl: '1.4' },
  headings: {
    fontFamily: FONT_DISPLAY,
    fontWeight: '700',
    textWrap: 'balance',
    sizes: {
      h1: { fontSize: 'clamp(38px, 4.4vw, 60px)', lineHeight: '1.04', fontWeight: '800' },
      h2: { fontSize: rem(32), lineHeight: '1.1', fontWeight: '700' },
      h3: { fontSize: rem(22), lineHeight: '1.2', fontWeight: '700' },
      h4: { fontSize: rem(17), lineHeight: '1.3', fontWeight: '650' },
      h5: { fontSize: rem(15), lineHeight: '1.35', fontWeight: '650' },
      h6: { fontSize: rem(13), lineHeight: '1.4', fontWeight: '650' },
    },
  },

  // Spacing on a 4px rhythm. Radius: inputs and chips 12 (md), cards 16 (lg), panels 20 (xl); buttons are pills.
  spacing: { xs: rem(8), sm: rem(12), md: rem(16), lg: rem(24), xl: rem(40) },
  radius: { xs: rem(6), sm: rem(8), md: rem(12), lg: rem(16), xl: rem(20) },
  defaultRadius: 'md',
  shadows: {
    xs: '0 1px 1px rgb(21 23 26 / 0.03)',
    sm: '0 1px 2px rgb(21 23 26 / 0.04), 0 2px 6px rgb(21 23 26 / 0.03)',
    md: '0 1px 2px rgb(21 23 26 / 0.04), 0 8px 24px rgb(21 23 26 / 0.07)',
    lg: '0 2px 6px rgb(21 23 26 / 0.06), 0 16px 40px rgb(21 23 26 / 0.12)',
    xl: '0 4px 12px rgb(21 23 26 / 0.08), 0 32px 72px rgb(21 23 26 / 0.18)',
  },

  components: {
    Paper: Paper.extend({ defaultProps: { radius: 'lg' }, classNames: { root: classes.paper } }),
    Title: Title.extend({ classNames: { root: classes.title } }),
    Text: Text.extend({ classNames: { root: classes.text } }),
    NavLink: NavLink.extend({ classNames: { root: classes.navLink, label: classes.navLabel, section: classes.navSection } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: 'md' }, classNames: { root: classes.actionIcon } }),
    Button: Button.extend({ defaultProps: { radius: 999 }, classNames: { root: classes.button } }),
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
    Anchor: Anchor.extend({ defaultProps: { underline: 'always' }, classNames: { root: classes.anchor } }),
    Badge: Badge.extend({ defaultProps: { radius: 'sm' }, classNames: { root: classes.badge } }),
    Alert: Alert.extend({ defaultProps: { radius: 'lg', variant: 'light' }, classNames: { root: classes.alert, title: classes.alertTitle } }),
    Skeleton: Skeleton.extend({ classNames: { root: classes.skeleton } }),
  },
});

/**
 * Mantine's variables pointed at the tokens, plus the app-level aliases the pages already use (--app-*).
 * Colour values are `var(--token)` references, so the theme switches by changing `data-theme` alone.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => {
  // Mantine writes its own colour variables per scheme, so these go in both scheme blocks to win over its defaults.
  const both = {
    '--app-canvas': 'var(--bg)',
    '--app-hairline': 'var(--line)',
    '--app-hairline-strong': 'var(--line-2)',
    '--app-glass': 'var(--glass)',
    '--app-accent-text': 'var(--amber-text)',
    '--app-card-hover-border': 'var(--line-2)',

    '--mantine-color-body': 'var(--panel)',
    '--mantine-color-text': 'var(--text)',
    '--mantine-color-bright': 'var(--text)',
    '--mantine-color-dimmed': 'var(--muted)',
    '--mantine-color-error': 'var(--tick-down)',
    '--mantine-color-placeholder': 'var(--faint)',
    '--mantine-color-anchor': 'var(--amber-text)',
    '--mantine-color-default': 'var(--panel-hi)',
    '--mantine-color-default-hover': 'var(--track)',
    '--mantine-color-default-color': 'var(--text)',
    '--mantine-color-default-border': 'var(--line-2)',

    '--mantine-primary-color-filled': 'var(--amber)',
    '--mantine-primary-color-filled-hover': 'color-mix(in srgb, var(--amber) 88%, var(--text))',
    '--mantine-primary-color-light': 'color-mix(in srgb, var(--amber) 16%, transparent)',
    '--mantine-primary-color-light-hover': 'color-mix(in srgb, var(--amber) 24%, transparent)',
    '--mantine-primary-color-light-color': 'var(--amber-text)',
    '--mantine-primary-color-contrast': 'var(--on-accent)',

    '--mantine-color-accent-filled': 'var(--amber)',
    '--mantine-color-accent-filled-hover': 'color-mix(in srgb, var(--amber) 88%, var(--text))',
    '--mantine-color-accent-light': 'color-mix(in srgb, var(--amber) 16%, transparent)',
    '--mantine-color-accent-light-hover': 'color-mix(in srgb, var(--amber) 24%, transparent)',
    '--mantine-color-accent-light-color': 'var(--amber-text)',
    '--mantine-color-accent-outline': 'var(--amber-text)',
    '--mantine-color-accent-outline-hover': 'color-mix(in srgb, var(--amber) 16%, transparent)',
    '--mantine-color-accent-text': 'var(--amber-text)',
  };
  // Mantine's light-variant text colours (alert titles, badge labels) are its mid shades, which miss 4.5:1 on the cream page.
  // On the light page they take the token text colours instead; on dark Mantine's own tints already pass.
  const lightText = {
    '--mantine-color-yellow-light-color': 'var(--amber-text)',
    '--mantine-color-orange-light-color': 'var(--amber-text)',
    '--mantine-color-red-light-color': 'var(--down)',
    '--mantine-color-green-light-color': 'var(--mint-text)',
    '--mantine-color-teal-light-color': 'var(--mint-text)',
  };
  return {
    variables: { '--app-ease': 'var(--ease)', '--app-ease-inout': 'cubic-bezier(0.65, 0, 0.35, 1)' },
    light: { ...both, ...lightText },
    dark: both,
  };
};

/**
 * Chart colours. Categorical series keep the set the charts were validated with (blue, orange, aqua, violet),
 * checked on the old surfaces and re-checked on the new panels (both pass 3:1 for marks). Text, grid, axis and
 * tooltip colours are the Chargeline tokens, so charts sit on the panel without a seam. `baseline` is the neutral
 * series colour for reference bars (hubs). Charts are redrawn page by page in later steps.
 */
export const CHART = {
  light: {
    surface: '#faf9f6', text: '#15171a', muted: '#55595e', grid: '#e4e1d9', axis: '#b4b0a5',
    baseline: '#8f8e88',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6'],
    charge: '#2a78d6', discharge: '#eb6834', neutral: '#e4e1d9',
    tooltipBg: 'rgba(255,255,255,0.94)', tooltipBorder: 'rgba(21,23,26,0.12)',
  },
  dark: {
    surface: '#171a1d', text: '#e8e6e1', muted: '#b8bdc2', grid: '#262b30', axis: '#3a4046',
    baseline: '#7d858c',
    series: ['#3987e5', '#d95926', '#199e70', '#9085e9'],
    charge: '#3987e5', discharge: '#d95926', neutral: '#242a2f',
    tooltipBg: 'rgba(28,32,36,0.94)', tooltipBorder: 'rgba(232,230,225,0.14)',
  },
};

export const CHART_FONT = FONT;
