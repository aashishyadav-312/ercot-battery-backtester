// Light/dark choice. The saved choice wins; with none, the system preference decides.
// Storage can be missing or blocked (private windows, blocked site data), so every access is guarded.

export type Scheme = 'dark' | 'light';

/** Same key as before the redesign, so a visitor's saved choice survives. */
export const SCHEME_KEY = 'ebb-scheme';

export function readStoredScheme(storage?: Pick<Storage, 'getItem'>): Scheme | null {
  try {
    const s = (storage ?? localStorage).getItem(SCHEME_KEY);
    return s === 'dark' || s === 'light' ? s : null;
  } catch {
    return null;
  }
}

export function storeScheme(scheme: Scheme, storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? localStorage).setItem(SCHEME_KEY, scheme);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

export function systemScheme(): Scheme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveScheme(stored: Scheme | null, system: Scheme): Scheme {
  return stored ?? system;
}
