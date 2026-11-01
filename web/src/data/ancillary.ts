export const STACK_KEYS = ['energy', 'REGUP', 'REGDN', 'RRS', 'ECRS', 'NSPIN'] as const;
export const STACK_LABELS = ['Energy (net)', 'Regulation Up', 'Regulation Down', 'Responsive Reserve', 'ECRS', 'Non-Spin'];
export type StackDay = Record<typeof STACK_KEYS[number], number> & { date: string; energy_only: number; market: 'DA' | 'RT'; solver_gap?: number | null };
export interface StackRun { daily: StackDay[]; skipped_days: string[]; runtime_s: number; }
export interface AncillaryFile { runs: Record<string, string>; }

export function sumStack(rows: StackDay[], stacked: boolean): number[] {
  return STACK_KEYS.map((k) => rows.reduce((s, r) => s + (stacked ? r[k] : k === 'energy' ? r.energy_only : 0), 0));
}

/** Approximate monetary bounds reconstructed from the recorded relative MIP gaps. */
export function stackBounds(rows: StackDay[]) {
  const lower = sumStack(rows, true).reduce((a,b) => a+b,0);
  if (rows.some((r) => r.solver_gap == null)) return { lower, upper: null };
  // Six components rounded to six decimals can differ by <= 3e-6 $/kW.
  const slack = rows.reduce((sum, r) => sum + Math.abs(STACK_KEYS.reduce((s,k) => s+r[k],0)) * (r.solver_gap ?? 0)
    + 3e-6 * (1 + (r.solver_gap ?? 0)), 0);
  return { lower, upper: lower + slack };
}

/** Same calendar days one year apart, always on their intersection, never zero-filled. */
export function pairedStack(before: StackDay[], after: StackDay[]) {
  const next = new Map(after.map((r) => [r.date, r]));
  const pairs = before.filter((r) => r.date >= '2024-12-05' && r.date <= '2025-10-24')
    .map((r) => [r, next.get(`${Number(r.date.slice(0, 4)) + 1}${r.date.slice(4)}`)] as const)
    .filter((p): p is readonly [StackDay, StackDay] => !!p[1]);
  return { before: pairs.map((p) => p[0]), after: pairs.map((p) => p[1]) };
}
