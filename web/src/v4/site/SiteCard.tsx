import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadCsv, usd } from '../../data/format';
import { TERMS } from '../../copy/terms';
import type { nearestNodes } from '../geo/nearest';
import { StackNotes, FixtureBanner } from '../Parts';
import { SitePrint } from './SitePrint';
import {
  resolveSettings, siteCsv, stripFor, studioHash, studioLocation, durationsFor, hasFullStack, modesFor, writeSiteToHash,
  type Basis, type Point, type Settings, type SiteData,
} from './siteValue';
import { useSiteBase, useSiteFiles, type SiteSource } from './useSiteData';
import type { StackMode } from '../stack';
import atlas from '../map/AtlasSite.module.css'; // the nearest-node rows keep their Step 4 look
import classes from './SiteCard.module.css';

export interface SitePin { lat: number; lon: number; label: string; sub: string }
export type Near = ReturnType<typeof nearestNodes>;

const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));
const MODE_LABEL: Record<StackMode, string> = { realistic: TERMS.dayAheadPlan.label, foresight: TERMS.perfectForesight.label };
const BASIS_LABEL: Record<Basis, string> = { energy: 'Energy', stack: 'Full stack' };

/** Plain caveats (plan Step 5). The numbers they refer to are on the card, not in these sentences. */
const CAVEATS = [
  'A backtest of past prices, not a forecast.',
  'Distance to a node is a straight line. It is not an interconnection point, and a real site needs its own study.',
  'Ancillary-service prices are thin markets. A large fleet would push them down, so Full stack values are not what the next battery would earn.',
];

export interface SiteCardProps {
  pin: SitePin;
  near: Near | null;
  /** Nodes placed in the geo index, and how many of those have prices in the run on screen. */
  counts: { indexed: number; priced: number };
  county: string | null;
  city: { name: string; km: number } | null;
  source: SiteSource;
  /** Settings from a shared link, applied once. */
  initial?: Partial<Settings>;
  onSettings: (s: Settings) => void;
  onSelect: (code: string) => void;
  onClear: () => void;
}

export function SiteCard({ pin, near, counts, county, city, source, initial, onSettings, onSelect, onClear }: SiteCardProps) {
  const { base, ready } = useSiteBase(source, true);
  const [want, setWant] = useState<Partial<Settings>>(initial ?? {});
  const settings = useMemo(() => resolveSettings(want, base), [want, base]);
  const { files, loading } = useSiteFiles(source, base, ready, settings);
  const data: SiteData = useMemo(() => ({ ...base, ...files }), [base, files]);

  const nearList = useMemo(() => near?.nodes.map((n) => ({ code: n.code, km: n.km })) ?? [], [near]);
  const hubCode = near?.nearestHub?.code ?? null;
  const strip: Point[] = useMemo(() => stripFor(settings, nearList, hubCode, data), [settings, nearList, hubCode, data]);
  const cur = strip.find((p) => p.year === settings.year) ?? null;
  const range = cur?.range ?? null;

  useEffect(() => { if (ready) onSettings(settings); }, [ready, settings, onSettings]);

  const durs = durationsFor(base, settings.basis, settings.mode);
  const modes = modesFor(base, settings.basis, settings.durationH);
  const studioLoc = studioLocation(nearList, hubCode, base.priceLocations);
  const stackFile = settings.basis === 'stack' ? files.stackFiles.get(settings.year) ?? null : null;

  // One scale for every row of the strip, so bars compare across years.
  const scale = useMemo(() => {
    const v = strip.flatMap((p) => (p.range ? [p.range.min, p.range.max] : p.hub != null ? [p.hub] : []));
    const lo = Math.min(0, ...v);
    const hi = Math.max(...v, 0);
    return { lo, span: hi - lo || 1 };
  }, [strip]);
  const at = (v: number) => `${(((v - scale.lo) / scale.span) * 100).toFixed(2)}%`;
  const wide = (a: number, b: number) => `${Math.max(((b - a) / scale.span) * 100, 1.2).toFixed(2)}%`;

  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (m: string) => { setStatus(m); clearTimeout(timer.current); timer.current = setTimeout(() => setStatus(''), 4000); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    const url = window.location.href;
    const ok = () => say('Link copied.');
    const fail = () => say('Could not copy. The address bar has the link.');
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(ok, fail); else fail();
  };
  const csv = () => {
    const { headers, rows } = siteCsv({ name: pin.label, lat: pin.lat, lon: pin.lon }, settings, strip);
    downloadCsv(`chargeline-site-${pin.lat.toFixed(3)}_${pin.lon.toFixed(3)}.csv`, headers, rows);
  };

  const set = (patch: Partial<Settings>) => setWant({ ...settings, ...patch });
  const link = writeSiteToHash(window.location.hash, pin, settings);
  const sources = stackFile ? stackFile.meta.sources : [];

  return (
    <section className={classes.card} aria-labelledby="site-title" data-testid="site-panel">
      <div className={classes.head}>
        <div>
          <p className={classes.eyebrow}>Site value</p>
          <h3 id="site-title" className={classes.title}>{pin.label}</h3>
          <p className={classes.sub} data-testid="site-where">
            {[county ? `${county} County` : null, city ? `${fmtKm(city.km)} km from ${city.name}` : null, pin.label.includes(pin.lat.toFixed(3)) ? null : `${pin.lat.toFixed(3)}, ${pin.lon.toFixed(3)}`, pin.sub].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button type="button" className={classes.clear} onClick={onClear}>Clear site</button>
      </div>

      {!near ? <p className={classes.sub}>Finding nearby nodes…</p> : (
        <>
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
          {stackFile && <FixtureBanner files={[stackFile]} />}

          <div className={classes.main} aria-live="polite">
            {loading || !ready ? <p className={classes.unit}>Loading results…</p> : range ? (
              <>
                <p className={classes.big} data-testid="site-range">{usd(range.min, 1)} to {usd(range.max, 1)}</p>
                <p className={classes.unit} data-testid="site-range-note">
                  {TERMS.revenueUnit.label} · {BASIS_LABEL[settings.basis]}, {MODE_LABEL[settings.mode].toLowerCase()} · {cur?.label} · {settings.durationH}-hour battery · median {usd(range.median, 1)}, {range.n} of {range.of} nearest nodes
                </p>
                <div className={classes.bar} aria-hidden="true">
                  <span className={classes.barFill} style={{ left: at(range.min), width: wide(range.min, range.max) }} />
                  <span className={classes.barMed} style={{ left: at(range.median) }} />
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

          {strip.length > 0 && (
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
                            <span className={classes.stripRange} style={{ left: at(p.range.min), width: wide(p.range.min, p.range.max) }} />
                            <span className={classes.stripMed} style={{ left: at(p.range.median) }} />
                          </>
                        ) : p.hub != null ? <span className={classes.stripDot} style={{ left: at(p.hub) }} /> : null}
                      </span>
                      <span className={classes.stripVal}>
                        {p.range ? `${usd(p.range.min, 0)} to ${usd(p.range.max, 0)}` : p.hub != null ? `hub ${usd(p.hub, 0)}` : 'no result'}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}

          <h4 className={classes.h4}>Nearest nodes</h4>
          <ol className={atlas.nearList} data-testid="near-list">
            {near.nodes.map((n, i) => {
              const v = range?.nodes.find((x) => x.code === n.code)?.value;
              return (
                <li key={n.code}>
                  <button type="button" className={atlas.nearBtn} onClick={() => onSelect(n.code)}>
                    <span className={atlas.nearNum}>{i + 1}</span>
                    <span className={atlas.nearName}>
                      <span>{n.code}</span>
                      <span className={atlas.nearSub}>{n.county ? `${n.county} County` : 'County unknown'}{n.precision === 'county' ? ' · county-level location' : ''}</span>
                    </span>
                    <span className={classes.nearVal} data-testid={`near-val-${n.code}`}>{v != null ? usd(v, 1) : 'no result'}</span>
                    <span className={atlas.nearKm}>{fmtKm(n.km)} km</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {near.nodes.length === 0 && <p className={classes.priced}>No placed node with prices in this run.</p>}
          <p className={classes.priced} data-testid="near-priced">
            Only nodes with price data are listed: {counts.priced} of {counts.indexed} placed nodes. A closer node without prices is skipped, so the nearest plant can be nearer than the first row.
          </p>
          {near.nearestHub && (
            <p className={classes.priced} data-testid="near-hub">
              Nearest hub marker: <span>{near.nearestHub.code}</span>, {fmtKm(near.nearestHub.km)} km{cur?.hub != null ? `, ${usd(cur.hub, 1)} for ${cur.label}` : ''}.
              {near.zoneHub && near.zoneHub !== near.nearestHub.code && <> Load-zone hub of the nearest node: <span>{near.zoneHub}</span>.</>}
            </p>
          )}

          <ul className={classes.caveats}>{CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>
          {stackFile && <StackNotes file={stackFile} />}

          <div className={classes.actions}>
            {studioLoc && <a className={classes.action} href={studioHash(studioLoc, settings)} data-testid="site-studio">Open in Studio</a>}
            <button type="button" className={classes.action} onClick={copy}>Copy link</button>
            <button type="button" className={classes.action} onClick={csv} disabled={!strip.length}>Download CSV</button>
            <button type="button" className={classes.action} onClick={() => window.print()}>Print</button>
          </div>
          {studioLoc && studioLoc !== nearList[0]?.code && (
            <p className={classes.priced}>Studio opens {studioLoc}: it has price files for {base.priceLocations.size} locations, and this is the nearest one.</p>
          )}
          <p className={classes.status} role="status" data-testid="site-status">{status}</p>
          <SitePrint
            s={settings} strip={strip} today={new Date().toISOString().slice(0, 10)}
            site={{
              name: pin.label, lat: pin.lat, lon: pin.lon, county, city: city ? `${fmtKm(city.km)} km from ${city.name}` : null,
              basisLabel: BASIS_LABEL[settings.basis], modeLabel: MODE_LABEL[settings.mode], link: `${window.location.origin}${window.location.pathname}${link}`,
              caveats: CAVEATS, sources,
            }}
          />
        </>
      )}
    </section>
  );
}
