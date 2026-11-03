import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { readStoredScheme, resolveScheme, storeScheme, systemScheme, type Scheme } from '../../shell/scheme';

interface Ctx { scheme: Scheme; toggle: () => void }
const SchemeCtx = createContext<Ctx>({ scheme: 'dark', toggle: () => {} });
export const useScheme = () => useContext(SchemeCtx);

/**
 * Owns the light/dark choice: the saved choice, else the system preference (followed live until the visitor picks).
 * Writes `data-theme` on <html> for tokens.css; Mantine is told the same value through its `forceColorScheme` prop.
 */
export function SchemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Scheme | null>(() => readStoredScheme());
  const [system, setSystem] = useState<Scheme>(systemScheme);
  const scheme = resolveScheme(stored, system);

  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-color-scheme: light)'); } catch { return; }
    const on = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // A layout effect, so the tokens have switched before any chart's effect reads them (src/theme/chartColors.ts).
  useLayoutEffect(() => { document.documentElement.setAttribute('data-theme', scheme); }, [scheme]);

  const toggle = useCallback(() => {
    const next: Scheme = scheme === 'dark' ? 'light' : 'dark';
    setStored(next);
    storeScheme(next);
  }, [scheme]);

  const value = useMemo(() => ({ scheme, toggle }), [scheme, toggle]);
  return <SchemeCtx.Provider value={value}>{children}</SchemeCtx.Provider>;
}
