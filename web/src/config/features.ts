// Feature flags. V4 (site intelligence: map context, Site Value card, revenue stack, Data Center mode) is switched on for
// everyone by V4_DEFAULT_ON. Until then it is off, and visible locally with VITE_V4=1 or by opening the site with ?v4=1.
// Once it is on, ?v4=0 or VITE_V4=0 turns it off again (the unit tests run with VITE_V4=0, see vite.config.ts).

/** The release switch. Step 8 flips this in its own final commit, so that commit can be reverted alone. */
export const V4_DEFAULT_ON = false;

/** Pure so it can be tested. An address parameter wins over the build variable, which wins over `defaultOn`. */
export function v4Enabled(envValue: string | undefined, search: string, hash: string, defaultOn = false): boolean {
  const inHash = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
  const asked = [search, inHash].map((q) => new URLSearchParams(q).get('v4'));
  if (asked.includes('1')) return true;
  if (asked.includes('0')) return false;
  if (envValue === '1') return true;
  if (envValue === '0') return false;
  return defaultOn;
}

export const V4: boolean = v4Enabled(
  import.meta.env.VITE_V4,
  typeof window === 'undefined' ? '' : window.location.search,
  typeof window === 'undefined' ? '' : window.location.hash,
  V4_DEFAULT_ON,
);
