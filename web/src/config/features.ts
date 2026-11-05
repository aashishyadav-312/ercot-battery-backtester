// Feature flags. V4 (site intelligence: map context, Site Value card, revenue stack, Data Center mode) is off on the live
// site until the release step. Turn it on locally with VITE_V4=1 or by opening the site with ?v4=1.

/** Pure so it can be tested: true for VITE_V4=1, or ?v4=1 in the address (before or after the #). */
export function v4Enabled(envValue: string | undefined, search: string, hash: string): boolean {
  if (envValue === '1') return true;
  const inHash = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
  return [search, inHash].some((q) => new URLSearchParams(q).get('v4') === '1');
}

export const V4: boolean = v4Enabled(
  import.meta.env.VITE_V4,
  typeof window === 'undefined' ? '' : window.location.search,
  typeof window === 'undefined' ? '' : window.location.hash,
);
