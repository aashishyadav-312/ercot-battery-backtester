// Rules and constants the revenue-stack UI needs. Each has a source and an "as of" date (plan rule 6).

/**
 * RTC+B (real-time co-optimization plus batteries) went live in ERCOT on this day. Source: the event text in
 * results/rtcb.json (the repository's own before/after study) and ERCOT's RTC+B programme page,
 * https://www.ercot.com/about/rtcb. As of 2026-11-05. A test pins this to results/rtcb.json `after.start`.
 */
export const RTCB_GO_LIVE = '2025-12-05';

/** Years a stack file can exist for, from the Stack results contract. A missing file is simply absent. */
export const STACK_YEARS = [2023, 2024, 2025, 2026] as const;

/** Durations the stack tiers cover (plan Step 1, tiers 1 and 2). */
export const STACK_DURATIONS = [1, 2, 4] as const;
