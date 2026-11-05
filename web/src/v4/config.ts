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

/** Years with a 4CP file (results/v4/fourcp/<year>.json, Step 2). A test pins this list to the files. */
export const FOURCP_YEARS = [2023, 2024, 2025, 2026] as const;

/**
 * Battery the Step 1 stack files were computed for: round-trip efficiency and degradation cost ($/MWh discharged). Source: the
 * first line of meta.assumptions in every results/v4/stack file. As of 2026-11-05. Data Center mode uses a stack row for ancillary
 * services only when its battery matches these, and a test pins them to the files.
 */
export const STACK_BATTERY = { rte: 0.85, degCost: 10 } as const;

/**
 * Years whose full-stack values are an upper bound. In 2023 ERCOT's ancillary service prices were extreme (the ancillary part of
 * a 2 h hub stack is several times that of every later year, pinned in config.test.ts from the stack files), and the model
 * assumes the battery does not move prices. The ancillary part of these years is shown as a ceiling, and the year is labelled
 * "(upper bound)" wherever a full-stack value for it appears. Source: results/v4/stack/2023_*.json and meta.assumptions
 * ("Price taker"). As of 2026-11-05.
 */
export const AS_UPPER_BOUND_YEARS: readonly number[] = [2023];

/** The one sentence shown under any full-stack figure for an upper-bound year. Plain words, no number. */
export const AS_UPPER_BOUND_NOTE =
  'Full-stack values for 2023 are an upper bound. Ancillary service prices were extreme that year, and the model assumes the battery does not move prices.';
