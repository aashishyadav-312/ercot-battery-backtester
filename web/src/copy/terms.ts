// The one place the site's shared labels and short definitions are spelled. Components import from here so a term
// reads the same on every page. Prose may use the long form of a label where a sentence needs it, with the same words.
// copy/terms.test.ts fails if a retired label comes back anywhere in the UI source.

export interface Term {
  /** The label, as shown on a tab, pill, column head, legend or stat. */
  label: string;
  /** One or two plain sentences, for the glossary, tooltips and the tour. */
  definition: string;
}

export const TERMS = {
  perfectForesight: {
    label: 'Perfect foresight',
    definition: 'The best schedule, made knowing every real-time price in advance. No operator can do this.',
  },
  dayAheadPlan: {
    label: 'Day-ahead plan',
    definition: 'Plan the day before on day-ahead prices, then settle at real-time prices.',
  },
  captureRate: {
    label: 'Capture rate',
    definition: 'Share of perfect-foresight revenue the day-ahead plan keeps.',
  },
  top10DayShare: {
    label: 'Top-10-day share',
    definition: 'Share of the year’s revenue earned on its 10 best days.',
  },
  revenueUnit: {
    label: '$/kW-yr',
    definition: 'Dollars per kW of power capacity per year.',
  },
  degradationCost: {
    label: 'Degradation cost',
    definition: 'A cost charged on every MWh discharged, to stand in for battery wear.',
  },
  hub: {
    label: 'Hub',
    definition: 'A price average over an area.',
  },
  node: {
    label: 'Node',
    definition: 'One point on the grid, usually one plant.',
  },
} as const satisfies Record<string, Term>;

export type TermKey = keyof typeof TERMS;

/** The same terms by plural, for group headings ("Hubs", "Nodes"). */
export const HUBS_LABEL = `${TERMS.hub.label}s`;
export const NODES_LABEL = `${TERMS.node.label}s`;

/** Spelled out once per page next to the first $/kW-yr figure. */
export const PER_KW_PER_YEAR = 'per kW per year';
