import type { Page } from '../state';
import type { Selection } from './types';

/** The battery used everywhere a page needs "a sensible default": Houston Hub, 2 hours of storage, 2025, $10/MWh wear. */
export const START_DEFAULTS: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };

export interface GuideCard {
  page: Page;
  title: string;
  /** The question the page answers, in a newcomer's words. */
  question: string;
  /** What you see there, one sentence. */
  shows: string;
  /** Selection the link opens it with (missing keys fall back to START_DEFAULTS). */
  open: Partial<Selection>;
  /** What the link says. */
  cta: string;
  /** Alt text for the thumbnail. */
  alt: string;
}

export const GUIDE: GuideCard[] = [
  {
    page: 'overview', title: 'Overview',
    question: 'How much could a battery have earned here, and what drove that number?',
    shows: 'Four headline numbers, revenue by month, the running total with the ten best days marked, the charge and discharge pattern, and 1h vs 2h vs 4h.',
    open: {}, cta: 'Open Overview for Houston, 2-hour, 2025',
    alt: 'Thumbnail of the Overview page: headline sentence, four number tiles and revenue charts.',
  },
  {
    page: 'revenue', title: 'Revenue',
    question: 'When in the year did the money come in?',
    shows: 'Daily revenue as bars, the ten best days, and how much of the year they account for.',
    open: {}, cta: 'Open Revenue for Houston, 2-hour, 2025',
    alt: 'Thumbnail of the Revenue page: daily revenue bars and a list of the ten best days.',
  },
  {
    page: 'dispatch', title: 'Dispatch',
    question: 'When during the day does the battery charge and discharge?',
    shows: 'A heatmap of average charging and discharging by hour and month, plus the average day.',
    open: {}, cta: 'Open Dispatch for Houston, 2-hour, 2025',
    alt: 'Thumbnail of the Dispatch page: an hour-by-month heatmap in blue and orange.',
  },
  {
    page: 'compare', title: 'Compare',
    question: 'Does location or battery length change the answer?',
    shows: 'The same battery at a resource node against its hub, 1 vs 2 vs 4 hours, and all ten locations ranked.',
    open: { location: 'RUSSEKST_RN' }, cta: 'Open Compare for a West Texas node',
    alt: 'Thumbnail of the Compare page: a resource node against its hub, and a ranking of all locations.',
  },
  {
    page: 'realism', title: 'Realism',
    question: 'How much of the perfect-foresight number survives a realistic strategy?',
    shows: 'Revenue when the schedule is set from day-ahead prices instead of knowing the future, and before and after the December 2025 market redesign.',
    open: {}, cta: 'Open Realism for Houston, 2-hour, 2025',
    alt: 'Thumbnail of the Realism page: capture rate by location and a month-by-month comparison.',
  },
  {
    page: 'method', title: 'Method',
    question: 'What are the assumptions, and can I trust the number?',
    shows: 'Every assumption in plain words, the perfect-foresight caveat, and a check against published benchmarks.',
    open: {}, cta: 'Open Method',
    alt: 'Thumbnail of the Method page: assumptions and the perfect-foresight caveat.',
  },
];

export interface LeftOut {
  title: string;
  /** Which way leaving it out pushes the headline number. */
  effect: 'Overstates revenue' | 'Understates revenue' | 'Not revenue';
  body: string;
  term?: string;
}

export const LEFT_OUT: LeftOut[] = [
  {
    title: 'Perfect foresight', effect: 'Overstates revenue', term: 'perfect_foresight',
    body: 'Each day’s schedule is chosen knowing that day’s real prices. No real operator has that. The Realism page shows how much is kept when the schedule is set from day-ahead prices instead.',
  },
  {
    title: 'Ancillary services', effect: 'Understates revenue',
    body: 'Batteries are also paid to stand ready: regulation, reserves and similar products. For the real ERCOT fleet these were most of 2024 revenue (see Method). This model counts energy arbitrage only.',
  },
  {
    title: 'Degradation', effect: 'Overstates revenue',
    body: 'Wear is a flat $0 or $10 per MWh sold. A real battery also loses capacity with every cycle and with age, so later years earn less than the first. Here the battery never fades.',
    term: 'degradation_cost',
  },
  {
    title: 'Interconnection and project costs', effect: 'Not revenue',
    body: 'Studies, queue waits, grid upgrades, the battery itself and its financing are all left out. $/kW-yr is revenue, not profit, and it says nothing about payback.',
  },
  {
    title: 'Taxes and incentives', effect: 'Not revenue',
    body: 'Income and property taxes, tax credits and any other subsidies are ignored.',
  },
];
