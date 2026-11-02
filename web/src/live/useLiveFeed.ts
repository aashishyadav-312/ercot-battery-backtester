import { useEffect, useState } from 'react';
import { loadLive, type LiveLoad } from './live';

/** The Worker refreshes its snapshot every 5 minutes, so there is no point asking more often. */
export const LIVE_REFRESH_MS = 5 * 60_000;

/** The ticker and Home both read the feed; callers within a few seconds of each other share one request. */
const SHARE_MS = 10_000;
let shared: { at: number; p: Promise<LiveLoad> } | null = null;
function sharedLoad(): Promise<LiveLoad> {
  const now = Date.now();
  if (!shared || now - shared.at > SHARE_MS) shared = { at: now, p: loadLive() };
  return shared.p;
}

/** The latest snapshot for the ticker (worker, else the copy saved in this browser, else none). `null` until the first answer. */
export function useLiveFeed(intervalMs = LIVE_REFRESH_MS) {
  const [feed, setFeed] = useState<{ load: LiveLoad | null; now: number }>({ load: null, now: Date.now() });
  useEffect(() => {
    let alive = true;
    const run = () => { sharedLoad().then((load) => alive && setFeed({ load, now: Date.now() })); };
    run();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, intervalMs);
    return () => { alive = false; window.clearInterval(id); };
  }, [intervalMs]);
  return feed;
}
