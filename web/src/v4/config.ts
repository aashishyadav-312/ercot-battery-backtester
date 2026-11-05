// Rules and constants the revenue-stack UI needs. Each has a source and an "as of" date (plan rule 6).

/**
 * RTC+B (real-time co-optimization plus batteries) went live in ERCOT on this day. Source: the event text in
 * results/rtcb.json (the repository's own before/after study) and ERCOT's go-live announcement,
 * https://www.ercot.com/news/release/12052025-ercot-goes-live. As of 2026-11-05. A test pins this to results/rtcb.json `after.start`.
 */
export const RTCB_GO_LIVE = '2025-12-05';

/** Years a stack file can exist for, from the Stack results contract. A missing file is simply absent. */
export const STACK_YEARS = [2023, 2024, 2025, 2026] as const;

/** Durations the stack tiers cover (plan Step 1, tiers 1 and 2). */
export const STACK_DURATIONS = [1, 2, 4] as const;

/** Site Value card: how many of the nearest nodes (with price data) the $/kW-yr range is taken over. Plan Step 5 says 3 to 5. */
export const SITE_NEAR_K = 5;

/**
 * Degradation cost ($/MWh) of the all-node files (nodes_*.json meta.deg_cost_per_mwh). The card reads hub values for years with no
 * all-node file from results/index.json at this same cost, so node and hub values share one basis. A test pins it to nodes_2025_2h.json.
 */
export const SITE_DEG = 10;

/** Duration the card opens on when it has data for it. */
export const SITE_DEFAULT_DURATION_H = 2;
