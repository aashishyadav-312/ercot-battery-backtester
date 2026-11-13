import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadCsv, usd } from '../../data/format';
import type { nearestNodes } from '../geo/nearest';
import { StackNotes, FixtureBanner } from '../Parts';
import { SitePrint } from './SitePrint';
import { dcLinkFromSite } from '../dc/dcForm';
import {
  resolveSettings, siteCsv, stripFor, studioHash, studioLocation, writeSiteToHash, upperBoundCaveat, type Point, type Settings, type SiteData,
} from './siteValue';
import { useSiteBase, useSiteFiles, type SiteSource } from './useSiteData';
import { BASIS_LABEL, MODE_LABEL, SITE_CAVEATS as CAVEATS, SiteControls, SiteRange, YearStrip, useStripScale } from './SiteParts';
import atlas from '../map/AtlasSite.module.css'; // the nearest-node rows keep their Step 4 look
import classes from './SiteCard.module.css';

export interface SitePin { lat: number; lon: number; label: string; sub: string }
export type Near = ReturnType<typeof nearestNodes>;

const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));
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
  /** V5: where the full site report for this pin lives. Shows an "Open site report" link when given. */
  reportHref?: string;
}

export function SiteCard({ pin, near, counts, county, city, source, initial, onSettings, onSelect, onClear, reportHref }: SiteCardProps) {
  const { base, ready } = useSiteBase(source, true);
  const [want, setWant] = useState<Partial<Settings>>(initial ?? {});
  const settings = useMemo(() => resolveSettings(want, base), [want, base]);
  const { files, loading } = useSiteFiles(source, base, ready, settings);
  const data: SiteData = useMemo(() => ({ ...base, ...files }), [base, files]);

  const nearList = useMemo(() => near?.nodes.map((n) => ({ code: n.code, km: n.km })) ?? [], [near]);
  const hubCode = near?.nearestHub?.code ?? null;
  const strip: Point[] = useMemo(() => stripFor(settings, nearList, hubCode, data), [settings, nearList, hubCode, data]);
  const cur = strip.find((p) => p.year === settings.year) ?? null;
  const upper = upperBoundCaveat(settings.basis, strip);
  const caveats = upper ? [...CAVEATS, upper] : CAVEATS;
  const range = cur?.range ?? null;

  useEffect(() => { if (ready) onSettings(settings); }, [ready, settings, onSettings]);

  const studioLoc = studioLocation(nearList, hubCode, base.priceLocations);
  const stackFile = settings.basis === 'stack' ? files.stackFiles.get(settings.year) ?? null : null;

  const scale = useStripScale(strip);

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
          <SiteControls base={base} settings={settings} set={set} />
          {stackFile && <FixtureBanner files={[stackFile]} />}

          <SiteRange cur={cur} settings={settings} scale={scale} loading={loading || !ready} />

          <YearStrip strip={strip} settings={settings} scale={scale} set={set} />

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

          <ul className={classes.caveats}>{caveats.map((c) => <li key={c}>{c}</li>)}</ul>
          {stackFile && <StackNotes file={stackFile} />}

          <div className={classes.actions}>
            {studioLoc && <a className={classes.action} href={studioHash(studioLoc, settings)} data-testid="site-studio">Open in Studio</a>}
            {studioLoc && (
              <a
                className={classes.action} data-testid="site-dc"
                href={dcLinkFromSite({
                  loc: studioLoc, year: settings.year, durationH: settings.durationH, mode: settings.mode,
                  site: { label: pin.label, lat: pin.lat, lon: pin.lon, node: nearList[0]?.code ?? null, km: nearList[0]?.km ?? null },
                })}
              >
                Data Center mode
              </a>
            )}
            {reportHref && <a className={classes.action} href={reportHref} data-testid="site-report-link">Open site report</a>}
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
              caveats, sources,
            }}
          />
        </>
      )}
    </section>
  );
}
