// The latest Data Center case total, kept for the session so Project economics can offer it as a revenue source ("Data Center site").
// Nothing is stored on disk; a fresh page load has no case until Data Center mode runs again, and the pill stays hidden.
import type { DcCase } from '../revenueSource';

let current: DcCase | null = null;

export const setDcCase = (c: DcCase | null): void => { current = c; };
export const getDcCase = (): DcCase | null => current;
