import type { Selection } from './types';

/** The battery used everywhere a page needs "a sensible default": Houston Hub, 2 hours of storage, 2025, $10/MWh wear. */
export const START_DEFAULTS: Selection = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };
