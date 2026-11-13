// First-visit tour: copy, "seen" memory and placement. Pure functions and one tiny event, so the rules are testable
// without the DOM (the component in Tour.tsx only wires them up).
import { V5_RESEARCH_IN_LEARN } from '../../shell/route';

export interface TourStep {
  /** Matches a `data-tour` attribute on the element the step points at. */
  anchor: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  { anchor: 'hero', title: 'Welcome to Chargeline', body: 'Chargeline replays real ERCOT prices through a battery to show where in Texas it earns the most. Prices in the top bar are live.' },
  { anchor: 'tab-atlas', title: 'Atlas', body: 'Every hub and node on one map. Click any dot to see what a battery there would have earned.' },
  { anchor: 'tab-studio', title: 'Studio', body: 'Run your own battery. Pick a place, size and year; anything new solves in your browser.' },
  { anchor: 'tab-research', title: 'Research', body: 'What the replay found, how far a real schedule falls short, and how the model works.' },
  { anchor: 'tab-learn', title: 'Learn', body: 'New to ERCOT? Start here. You will also find the glossary and who built this.' },
  { anchor: 'support', title: 'Support', body: 'If you like Chargeline, please consider supporting the creator and help offset its build costs. Even a small donation matters.' },
];

/** With V4 on, the Atlas stop also tells the visitor about site search. The step count and anchors stay the same. */
const ATLAS_SITE_BODY = 'Every hub and node on one map. Click a dot to see what a battery there would have earned, or search a county or city to see what one is worth at a site.';
/** With V5 on, Research is not a tab any more, so its stop goes and the Learn stop says where it went. The hero stop now points at the site search. */
const V5_LEARN_BODY = 'New to ERCOT? Start here. Learn also holds the research findings, the glossary and who built this.';
const V5_HERO_BODY = 'Search a county, city, or lat, lon to screen a site. Chargeline replays real ERCOT prices through a battery there. Prices in the top bar are live.';
export const tourSteps = (v4: boolean, v5 = false): TourStep[] => {
  const base = v4 ? TOUR_STEPS.map((s) => (s.anchor === 'tab-atlas' ? { ...s, body: ATLAS_SITE_BODY } : s)) : TOUR_STEPS;
  if (!v5) return base;
  if (!V5_RESEARCH_IN_LEARN) return base.map((s) => (s.anchor === 'hero' ? { ...s, body: V5_HERO_BODY } : s));
  return base
    .filter((s) => s.anchor !== 'tab-research')
    .map((s) => (s.anchor === 'tab-learn' ? { ...s, body: V5_LEARN_BODY } : s.anchor === 'hero' ? { ...s, body: V5_HERO_BODY } : s));
};

/** Finishing the tour (Done) is remembered for good. */
export const DONE_KEY = 'chargeline-tour-done';
/** Skipping or Esc is remembered for this browser session only (it survives a refresh, not closing the browser). */
export const SHOWN_KEY = 'chargeline-tour-shown';
/** Viewports narrower than this get the popover docked to the bottom edge, pointing at nothing. */
export const PHONE_MAX = 640;

/** Set on any close, so the tour never auto-opens twice in one page session even when storage is blocked. */
let seenThisSession = false;

const read = (store: () => Storage, key: string) => { try { return store().getItem(key) === '1'; } catch { return false; } };
const write = (store: () => Storage, key: string) => { try { store().setItem(key, '1'); } catch { /* storage blocked: the in-memory flag covers this page session */ } };

export function hasSeenTour(): boolean {
  return seenThisSession || read(() => sessionStorage, SHOWN_KEY) || read(() => localStorage, DONE_KEY);
}

/** `completed` is true only when the visitor reached Done. */
export function markTourSeen(completed = false): void {
  seenThisSession = true;
  write(() => sessionStorage, SHOWN_KEY);
  if (completed) write(() => localStorage, DONE_KEY);
}

/** Test hook: forget the in-memory flag. */
export function resetTourSession(): void { seenThisSession = false; }

/** The tour opens by itself on Home, once per browser session, until the visitor has finished it. */
export function shouldAutoStart(page: string): boolean {
  return page === 'home' && !hasSeenTour();
}

const REPLAY_EVENT = 'chargeline:tour';

/** Ask the tour to start again from step 1 (footer link, Learn). It goes to Home first when needed. */
export function requestTour(): void {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}
export function onTourRequest(fn: () => void): () => void {
  window.addEventListener(REPLAY_EVENT, fn);
  return () => window.removeEventListener(REPLAY_EVENT, fn);
}

export interface Box { left: number; top: number; width: number; height: number }
export interface Placement {
  left: number; top: number; originX: number; originY: number;
  /** Which edge of the popover points at the anchor; "over" means it had no room beside it and sits on top, pointing at nothing. */
  side: 'below' | 'above' | 'over';
}

const GAP = 12;
const MARGIN = 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Where the popover goes: under its anchor if it fits, else above it, else at the bottom of the viewport with no pointer.
 * It is centred on a small anchor and left-aligned with a wide one, and kept inside the viewport. `minTop` is the bottom
 * edge of the sticky header. `origin` is the anchor's centre in the popover's own coordinates, so the open animation
 * grows from the anchor.
 */
export function placePopover(a: Box, pop: { width: number; height: number }, vp: { width: number; height: number }, minTop = MARGIN): Placement {
  const cx = a.left + a.width / 2;
  const left = clamp(a.width > pop.width ? a.left : cx - pop.width / 2, MARGIN, vp.width - pop.width - MARGIN);
  const originX = clamp(cx - left, 0, pop.width);
  const below = a.top + a.height + GAP;
  if (below + pop.height <= vp.height - MARGIN) return { left, top: below, originX, originY: 0, side: 'below' };
  const above = a.top - GAP - pop.height;
  if (above >= minTop) return { left, top: above, originX, originY: pop.height, side: 'above' };
  return { left, top: clamp(vp.height - MARGIN - pop.height, MARGIN, vp.height), originX, originY: pop.height / 2, side: 'over' };
}
