// Parts of the Site Value card that the V5 site report shows too: the settings pills, the range figure and the by-year strip.
// They take everything as props, so the card and the report render the same thing from the same model (siteValue.ts).

import { useMemo } from 'react';
import { usd } from '../../data/format';
import { TERMS } from '../../copy/terms';
import type { StackMode } from '../stack';
import { durationsFor, hasFullStack, modesFor, type Basis, type Point, type Settings, type SiteData } from './siteValue';
import classes from './SiteCard.module.css';

export const MODE_LABEL: Record<StackMode, string> = { realistic: TERMS.dayAheadPlan.label, foresight: TERMS.perfectForesight.label };
export const BASIS_LABEL: Record<Basis, string> = { energy: 'Energy', stack: 'Full stack' };

/** Plain caveats (V4 plan Step 5). The numbers they refer to are on the card, not in these sentences. */
export const SITE_CAVEATS = [
  'A backtest of past prices, not a forecast.',
  'Distance to a node is a straight line. It is not an interconnection point, and a real site needs its own study.',
  'Ancillary-service prices are thin markets. A large fleet would push them down, so Full stack values are not what the next battery would earn.',
];

/** Energy or Full stack, the strategy, and the battery size. `base` is the lists of what files exist. */
export function SiteControls({ base, settings, set }: { base: Pick<SiteData, 'manifest' | 'runs' | 'stackKeys'>; settings: Settings; set: (patch: Partial<Settings>) => void }) {
  const durs = durationsFor(base, settings.basis, settings.mode);
  const modes = modesFor(base, settings.basis, settings.durationH);
  return (
    <div className={classes.controls}>
      {hasFullStack(base) && (
        <div className={classes.group} role="group" aria-label="Revenue basis">
          {(['energy', 'stack'] as const).map((b) => (
            <button key={b} type="button" className={classes.pill} aria-pressed={settings.basis === b} onClick={() => set({ basis: b })} data-testid={`site-basis-${b}`}>{BASIS_LABEL[b]}</button>
          ))}
        </div>
      )}
      <div className={classes.group} role="group" aria-label="Mode">
        {modes.map((m) => (
          <button key={m} type="button" className={classes.pill} aria-pressed={settings.mode === m} onClick={() => set({ mode: m })} data-testid={`site-mode-${m}`}>{MODE_LABEL[m]}</button>
        ))}
      </div>
      <div className={classes.group} role="group" aria-label="Battery duration">
        {durs.length > 1
          ? durs.map((d) => <button key={d} type="button" className={classes.pill} aria-pressed={settings.durationH === d} onClick={() => set({ durationH: d })} data-testid={`site-dur-${d}`}>{d} h</button>)
          : <span className={classes.fixed}>{settings.durationH}-hour battery</span>}
      </div>
    </div>
  );
}

/** One scale for every row of the strip and the bar above it, so bars compare across years. */
export function useStripScale(strip: Point[]) {
  return useMemo(() => {
    const v = strip.flatMap((p) => (p.range ? [p.range.min, p.range.max] : p.hub != null ? [p.hub] : []));
    const lo = Math.min(0, ...v);
    const hi = Math.max(...v, 0);
    const span = hi - lo || 1;
    return {
      at: (x: number) => `${(((x - lo) / span) * 100).toFixed(2)}%`,
      wide: (a: number, b: number) => `${Math.max(((b - a) / span) * 100, 1.2).toFixed(2)}%`,
    };
  }, [strip]);
}
export type StripScale = ReturnType<typeof useStripScale>;

/** The big figure for the chosen year: the range over the nearest nodes with the median marked, or the hub alone when no node has a value. */
export function SiteRange({ cur, settings, scale, loading }: { cur: Point | null; settings: Settings; scale: StripScale; loading: boolean }) {
  const range = cur?.range ?? null;
  return (
    <div className={classes.main} aria-live="polite">
      {loading ? <p className={classes.unit}>Loading results…</p> : range ? (
        <>
          <p className={classes.big} data-testid="site-range">{usd(range.min, 1)} to {usd(range.max, 1)}</p>
          <p className={classes.unit} data-testid="site-range-note">
            {TERMS.revenueUnit.label} · {BASIS_LABEL[settings.basis]}, {MODE_LABEL[settings.mode].toLowerCase()} · {cur?.label} · {settings.durationH}-hour battery · median {usd(range.median, 1)}, {range.n} of {range.of} nearest nodes
          </p>
          <div className={classes.bar} aria-hidden="true">
            <span className={classes.barFill} style={{ left: scale.at(range.min), width: scale.wide(range.min, range.max) }} />
            <span className={classes.barMed} style={{ left: scale.at(range.median) }} />
          </div>
        </>
      ) : cur?.hub != null ? (
        <>
          <p className={classes.big} data-testid="site-range">{usd(cur.hub, 1)}</p>
          <p className={classes.unit} data-testid="site-range-note">
            {TERMS.revenueUnit.label} · nearest hub {cur.hubCode} · {cur.label} · {settings.durationH}-hour battery. No all-node result for these settings, so this is the hub, not a node range.
          </p>
        </>
      ) : (
        <p className={classes.unit} data-testid="site-range-note">No result for these settings at the nearest nodes.</p>
      )}
    </div>
  );
}

/** One row per year with a result; a row is a button that picks that year. */
export function YearStrip({ strip, settings, scale, set }: { strip: Point[]; settings: Settings; scale: StripScale; set: (patch: Partial<Settings>) => void }) {
  if (!strip.length) return null;
  return (
    <>
      <h4 className={classes.h4}>By year</h4>
      <ol className={classes.strip} data-testid="site-strip" aria-label="Range by year. Pick a year to show it above.">
        {strip.map((p) => (
          <li key={p.year}>
            <button type="button" className={classes.stripBtn} aria-pressed={p.year === settings.year} onClick={() => set({ year: p.year })} data-testid={`site-year-${p.year}`}>
              <span>{p.label}</span>
              <span className={classes.stripTrack} aria-hidden="true">
                {p.range ? (
                  <>
                    <span className={classes.stripRange} style={{ left: scale.at(p.range.min), width: scale.wide(p.range.min, p.range.max) }} />
                    <span className={classes.stripMed} style={{ left: scale.at(p.range.median) }} />
                  </>
                ) : p.hub != null ? <span className={classes.stripDot} style={{ left: scale.at(p.hub) }} /> : null}
              </span>
              <span className={classes.stripVal}>
                {p.range ? `${usd(p.range.min, 0)} to ${usd(p.range.max, 0)}` : p.hub != null ? `hub ${usd(p.hub, 0)}` : 'no result'}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
