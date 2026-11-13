// Feature flags. V4 (site intelligence: map context, Site Value card, revenue stack, Data Center mode) is on for everyone (V4_DEFAULT_ON).
// Once it is on, ?v4=0 or VITE_V4=0 turns it off again (the unit tests run with VITE_V4=0, see vite.config.ts).

/** The release switch. Step 8 flips this in its own final commit, so that commit can be reverted alone. */
export const V4_DEFAULT_ON = true;

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

// V5 (site-first release: a new front door, four tabs, an Advanced switch on the Atlas) is off until its release step flips V5_DEFAULT_ON.
// ?v5=1 or ?v5=0 in the address wins over VITE_V5, which wins over the default. V5 builds on V4, so with V4 off V5 is off too.

/** The release switch. A later step flips this in its own final commit, so that commit can be reverted alone. */
export const V5_DEFAULT_ON = true;

/** Pure so it can be tested. Same order as V4: address, then build variable, then `defaultOn`. `v4On` false always wins. */
export function v5Enabled(envValue: string | undefined, search: string, hash: string, defaultOn = false, v4On = true): boolean {
  if (!v4On) return false;
  const inHash = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
  const asked = [search, inHash].map((q) => new URLSearchParams(q).get('v5'));
  if (asked.includes('1')) return true;
  if (asked.includes('0')) return false;
  if (envValue === '1') return true;
  if (envValue === '0') return false;
  return defaultOn;
}

export const V5: boolean = v5Enabled(
  import.meta.env.VITE_V5,
  typeof window === 'undefined' ? '' : window.location.search,
  typeof window === 'undefined' ? '' : window.location.hash,
  V5_DEFAULT_ON,
  V4,
);
