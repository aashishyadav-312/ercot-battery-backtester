---
name: Chargeline
description: Calm, precise, data-first interface for an ERCOT battery revenue backtest, in dark and light themes.
colors:
  bg-dark: "#0F1113"
  panel-dark: "#171A1D"
  panel-hi-dark: "#1C2024"
  line-dark: "#262B30"
  line-2-dark: "#3A4046"
  track-dark: "#242A2F"
  text-dark: "#E8E6E1"
  muted-dark: "#B8BDC2"
  faint-dark: "#A3A9AF"
  bg-light: "#F2F1ED"
  panel-light: "#FAF9F6"
  panel-hi-light: "#FFFFFF"
  line-light: "#DAD7CF"
  line-2-light: "#B4B0A5"
  track-light: "#E4E1D9"
  text-light: "#15171A"
  muted-light: "#3F4348"
  faint-light: "#55595E"
  amber: "#F2A93B"
  amber-text-light: "#8F5200"
  mint-dark: "#5FD6A4"
  mint-light: "#1E9A70"
  mint-text-light: "#0B6A4A"
  on-accent-dark: "#0F1113"
  on-accent-light: "#15171A"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, DM Sans Variable, sans-serif"
    fontSize: "clamp(38px, 4.4vw, 60px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  numeral:
    fontFamily: "Bricolage Grotesque Variable, DM Sans Variable, sans-serif"
    fontSize: "clamp(56px, 7vw, 96px)"
    fontWeight: 800
    lineHeight: 1
  headline:
    fontFamily: "Bricolage Grotesque Variable, DM Sans Variable, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: "Bricolage Grotesque Variable, DM Sans Variable, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "DM Sans Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "DM Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "0.12em"
rounded:
  input: "12px"
  card: "16px"
  panel: "20px"
  pill: "999px"
spacing:
  gutter: "32px"
  gutter-phone: "16px"
  container: "1200px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-accent-dark}"
    rounded: "{rounded.pill}"
    height: "44px"
  tab-active:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-accent-dark}"
    rounded: "{rounded.pill}"
    height: "44px"
  card:
    backgroundColor: "{colors.panel-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.card}"
---

<!-- Written from the spec in docs/REDESIGN.md and its implementation in web/src/styles/tokens.css and web/src/theme.ts
     (step 1). The tokens in tokens.css are normative; if they change, change this file. No Creative North Star was
     chosen: the spec's own words ("data first, calm, precise") stand in for it until the owner picks one. -->

# Design System: Chargeline

## Overview

Chargeline is a reading instrument for numbers. It is data first, calm and precise: a dark page by default, a warm paper page in light, one warm accent, and type that does most of the work. Panels hold the data; the page around them stays quiet. It is not a marketing site and it does not borrow the AI-default look.

Density is moderate and the measure is short. Figures are large where they are the point and small mono where they are labels. Color carries meaning (which metric, which strategy), never decoration, and is always backed by size, position or text so it is not the only signal.

**Key Characteristics:**
- Two themes from one token set; dark is the default, and the system preference decides until the visitor chooses.
- One accent family: amber for revenue and primary action, mint for capture and the second series, bone for spike share.
- A live ticker above the header that inverts against the page so it reads as a separate instrument.
- Rounded but not soft: pills for actions, 12/16/20px for inputs, cards and panels.
- Motion is short, purposeful and fully removable.

## Colors

Warm near-black and warm paper neutrals with amber and mint accents. All values below are in the frontmatter; roles are described here.

### Primary
- **Amber** (`amber`): fills for primary buttons, the selected tab and the revenue metric. Dark text sits on it (`on-accent`). As text on light pages it steps down to `amber-text-light` so it keeps 4.5:1.

### Secondary
- **Mint** (`mint-dark`, `mint-light`): fills for the capture metric and the second series. Text uses `mint-text-light` on light pages.
- **Bone** (same value as `text` in each theme): the spike-share metric, so it reads as neutral and heavy rather than as a third hue.

### Neutral
- **Page** (`bg-*`): the canvas. **Panel** (`panel-*`): cards and panels one step up. **Panel high** (`panel-hi-*`): inputs and raised controls.
- **Lines** (`line-*`, `line-2-*`): hairlines and stronger edges. **Track** (`track-*`): empty bar tracks and hover fills.
- **Text** (`text-*`), **muted** (`muted-*`), **faint** (`faint-*`): primary, secondary and tertiary text; all three pass 4.5:1 on the page and panel in both themes.
- Map and dot colors (`land`, `land-stroke`, `dot-low`), the glass bar and the hero glow are defined in `tokens.css`; the ticker has its own inverted set (`--tick-*`).

### Named Rules
**The Not-Hue-Alone Rule.** A metric is never distinguished by color only; it also differs by size, lightness, position or a text label.
**The One Warm Accent Rule.** Amber is the only warm accent. No purple or blue gradients, and no blue-and-white pairing.

## Typography

**Display Font:** Bricolage Grotesque Variable (with DM Sans Variable, then sans-serif)
**Body Font:** DM Sans Variable (with system-ui)
**Label/Mono Font:** DM Mono (400 and 500), for numbers in tables and tickers, and for labels

**Character:** A characterful grotesque for headings and key numerals, a plain humanist sans for reading, and a mono for anything that is measured. All three are self-hosted from Fontsource; there is no runtime request to a font service.

### Hierarchy
- **Display** (800, `clamp(38px, 4.4vw, 60px)`, 1.04, tracking -0.025em): page and hero headlines.
- **Numeral** (800, `clamp(56px, 7vw, 96px)`): the three key numbers on Home.
- **Headline** (700, 32px, 1.1) and **Title** (700, 22px, 1.2): section and card titles.
- **Body** (400, 15px, 1.55): running text, capped near 65-75ch.
- **Label** (DM Mono, 13px, tracking 0.12em, uppercase): eyebrows and chart labels. Figures in tables use tabular numerals.

### Named Rules
**The Tabular Figures Rule.** Every displayed figure uses tabular numerals so columns and tickers do not jitter.

## Layout

A single centered container, 1200px of content with a 32px side gutter (16px on phones). The header, main content and footer share the same content edge. Phones stack: the header becomes two rows (brand and theme toggle, then the five tabs), tables scroll inside their own box, and the page never scrolls sideways. Touch targets are at least 44px. Spacing follows a 4px rhythm; groups are tight and sections are separated generously.

## Elevation & Depth

Flat by default. Depth comes from tonal layering (page, panel, panel high) and hairlines, not shadows. A soft glass bar (translucent panel with blur) is reserved for the sticky header and the Home map controls, and falls back to a solid page color when reduced transparency is requested. Shadows, where used, have an offset and a soft blur; there are no zero-offset colored halos except the deliberate glow behind the Home map.

### Named Rules
**The One Edge Rule.** A surface has a border or a shadow, not both.

## Shapes

Inputs and chips 12px, cards 16px, panels 20px, buttons and tabs fully round (999px). Corners are consistent within a surface; an inner element is never rounder than its container.

## Components

### Buttons
- **Shape:** pill (999px), 44px minimum height.
- **Primary:** amber fill with dark text; the label states the action.
- **Hover / Focus:** a slightly darker fill; focus is a 2px outline in amber (`amber-text` on light pages) with a 2px offset, on every interactive element.
- **Press:** scale 0.97 over 160ms, off under reduced motion.
- **Secondary:** transparent with a `line-2` border.

### Tabs and view bars
- **Header tabs:** text links with an amber underline on the current one (`aria-current="page"`); 44px tall.
- **View bar:** pill links; the current page is amber filled. Interim navigation for tabs that still hold several pages.

### Cards / Containers
- **Corner style:** 16px for cards, 20px for panels.
- **Background:** `panel`; inputs and raised controls use `panel-hi`.
- **Border:** a 1px `line` hairline; no shadow at rest.
- **Internal padding:** on the 4px scale, generous around headings.

### Inputs / Fields
- **Style:** `panel-hi` fill, 12px radius, 44px minimum height, real labels.
- **Focus:** the shared amber outline.

### Ticker
A thin strip above the header in inverted colors (light on a dark page, dark on a light page). Hub code in muted mono, price in medium weight, change colored and signed. It slides 56 seconds linear, pauses on hover, on focus and with a visible Pause button, and does not move at all under reduced motion. With no data it says "Live prices unavailable"; it never shows a number it did not receive.

## Do's and Don'ts

### Do:
- **Do** take every color from the tokens; switch themes by changing `data-theme` only.
- **Do** keep text at 4.5:1 or better against its surface in both themes (a test reads `tokens.css` and checks the pairs).
- **Do** use tabular numerals for figures and the mono face for labels and tickers.
- **Do** label upper bounds, illustrative values and unavailable data in words.
- **Do** make every moving element removable under `prefers-reduced-motion`, and animate transform or opacity rather than width, height or layout.

### Don't:
- **Don't** use AI-default gradients, blue-and-white pairings, cards with a colored left border, or emoji.
- **Don't** distinguish metrics by hue alone.
- **Don't** type a result number into JSX or CSS; load it or compute it.
- **Don't** put a card around the Home map; it shares the page glow.
- **Don't** add a shadow to a bordered surface.
