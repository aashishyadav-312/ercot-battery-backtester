// V5 site report (`#/site?lat=&lon=&dur=&year=[&basis=stack]`): what a battery is worth at one place, who else is building there,
// and a way into Data Center mode. The numbers come from the same model and files as the Atlas Site Value card (v4/site).

import { useEffect, useMemo, useState } from 'react';
import type { Topology } from 'topojson-specification';
import { downloadCsv, usd } from '../../data/format';
import { loadNodes } from '../../data/loader';
import type { NodesFile } from '../../data/types';
import { SITE_NEAR_K } from '../../v4/config';
import { dcLinkFromSite } from '../../v4/dc/dcForm';
import { countiesGeoJson } from '../../v4/geo/load';
import { nearestNodes } from '../../v4/geo/nearest';
import { countyAt, nearestPlace } from '../../v4/geo/place';
import { inTexas } from '../../v4/geo/search';
import type { NodeIndex } from '../../v4/geo/types';
import { REAL_SOURCE, type GeoSource } from '../../v4/map/AtlasSite';
import { FixtureBanner, StackNotes } from '../../v4/Parts';
import { SITE_CAVEATS, SiteControls, SiteRange, YearStrip, BASIS_LABEL, MODE_LABEL, useStripScale } from '../../v4/site/SiteParts';
import { SitePrint } from '../../v4/site/SitePrint';
import { resolveSettings, stripFor, studioHash, studioLocation, upperBoundCaveat, type Settings } from '../../v4/site/siteValue';
import { REAL_SITE_SOURCE, useSiteBase, useSiteFiles, type SiteSource } from '../../v4/site/useSiteData';
import atlas from '../../pages/Atlas.module.css';
import card from '../../v4/site/SiteCard.module.css';
import { DEFAULT_RADIUS_KM, nearbyBatteries, type BatteriesFile } from '../nearby';
import config from '../config.json';
import { loadBatteries } from './loadBatteries';
import { kmLabel, mwLabel, onlineLabel, readReport, releaseLabel, reportCsv, siteReportHash, statusLabel, storageLines, storageSheet } from './report';
import classes from './SiteReport.module.css';

/** Where the report's files come from. The default fetches them; tests pass files read from disk. */
export interface ReportSources { geo: GeoSource; site: SiteSource; nodes: () => Promise<NodesFile>; batteries: () => Promise<BatteriesFile | null> }
const REAL: ReportSources = { geo: REAL_SOURCE, site: REAL_SITE_SOURCE, nodes: loadNodes, batteries: loadBatteries };

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function SiteReport({ sources = REAL }: { sources?: ReportSources }) {
  const hash = useHash();
  const link = useMemo(() => readReport(hash), [hash]);
  if (!link) {
    return (
      <State title="Pick a place first" text="The address needs a latitude and a longitude. Search for a county or city on Home, or drop a pin on the Atlas, and the report opens here." />
    );
  }
  if (!inTexas(link.lat, link.lon)) {
    return <State title="That point is outside Texas" text="The results cover the ERCOT grid in Texas. Search for a Texas county or city instead." />;
  }
  // Keyed by the place, so a new search starts a clean report; settings in the address are read once.
  return <Report key={`${link.lat}:${link.lon}`} site={{ lat: link.lat, lon: link.lon }} initial={link} src={sources} />;
}

function State({ title, text }: { title: string; text: string }) {
  return (
    <div className={classes.page}>
      <section className={`${classes.panel} ${classes.state}`} aria-labelledby="site-state" data-testid="site-state">
        <h1 id="site-state" className={classes.h2}>{title}</h1>
        <p className={classes.body}>{text}</p>
        <div className={classes.stateLinks}>
          <a className={card.action} href="#/home">Search on Home</a>
          <a className={card.action} href="#/atlas">Open the Atlas</a>
        </div>
      </section>
    </div>
  );
}

interface Loaded { nodeIndex: NodeIndex; pricedCodes: Set<string>; topo: Topology | null; places: Awaited<ReturnType<GeoSource['places']>> | null; batteries: BatteriesFile | null }

/** The geo files, the priced node list and the batteries file. Only the node index and the priced list are needed; the rest degrade quietly. */
function useLoaded(src: ReportSources): Loaded | { error: string } | null {
  const [state, setState] = useState<Loaded | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    const soft = <T,>(p: Promise<T>) => p.catch(() => null);
    Promise.all([src.geo.nodeIndex(), src.nodes(), soft(src.geo.topo()), soft(src.geo.places()), soft(src.batteries())])
      .then(([nodeIndex, nodes, topo, places, batteries]) => live && setState({ nodeIndex, pricedCodes: new Set(nodes.nodes.map((n) => n.code)), topo, places, batteries }))
      .catch((e) => live && setState({ error: String(e) }));
    return () => { live = false; };
  }, [src]);
  return state;
}

function Report({ site, initial, src }: { site: { lat: number; lon: number }; initial: Partial<Settings>; src: ReportSources }) {
  const loaded = useLoaded(src);
  const { base, ready } = useSiteBase(src.site, true);
  const [want, setWant] = useState<Partial<Settings>>(initial);
  const settings = useMemo(() => resolveSettings(want, base), [want, base]);
  const { files, loading } = useSiteFiles(src.site, base, ready, settings);
  const data = useMemo(() => ({ ...base, ...files }), [base, files]);
  const set = (patch: Partial<Settings>) => setWant({ ...settings, ...patch });

  const ok = loaded && !('error' in loaded) ? loaded : null;
  // Only nodes with prices in this run, so every row has a value to show.
  const near = useMemo(() => {
    if (!ok) return null;
    const priced: NodeIndex = Object.fromEntries(Object.entries(ok.nodeIndex).filter(([code, n]) => n.kind === 'hub' || ok.pricedCodes.has(code)));
    return nearestNodes(priced, site.lat, site.lon, SITE_NEAR_K);
  }, [ok, site]);
  const county = useMemo(() => (ok?.topo ? countyAt(countiesGeoJson(ok.topo), site.lat, site.lon) : null), [ok, site]);
  const city = useMemo(() => {
    const hit = ok?.places ? nearestPlace(ok.places, site.lat, site.lon) : null;
    return hit ? { name: hit.place.name, km: hit.km } : null;
  }, [ok, site]);

  const nearList = useMemo(() => near?.nodes.map((n) => ({ code: n.code, km: n.km })) ?? [], [near]);
  const hubCode = near?.nearestHub?.code ?? null;
  const strip = useMemo(() => stripFor(settings, nearList, hubCode, data), [settings, nearList, hubCode, data]);
  const cur = strip.find((p) => p.year === settings.year) ?? null;
  const scale = useStripScale(strip);
  const stackFile = settings.basis === 'stack' ? files.stackFiles.get(settings.year) ?? null : null;
  const upper = upperBoundCaveat(settings.basis, strip);
  const caveats = upper ? [...SITE_CAVEATS, upper] : SITE_CAVEATS;
  const studioLoc = studioLocation(nearList, hubCode, base.priceLocations);

  // The address always names the place and the settings, so a copied link opens this same view. Other parameters (such as v5=1) stay.
  const href = siteReportHash(site, settings, window.location.hash);
  useEffect(() => {
    if (ready && href !== window.location.hash) window.history.replaceState(null, '', href);
  }, [ready, href]);

  const storage = useMemo(() => {
    const file = ok?.batteries ?? null;
    if (!file) return null;
    const radiusKm = DEFAULT_RADIUS_KM;
    return { file, radiusKm, near: nearbyBatteries(file.units, site.lat, site.lon, radiusKm) };
  }, [ok, site]);

  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const title = county ? `${county} County` : city ? `Near ${city.name}` : `${site.lat.toFixed(3)}, ${site.lon.toFixed(3)}`;
  const label = county ? `${county} County` : `${site.lat.toFixed(3)}, ${site.lon.toFixed(3)}`;
  const where = [
    county && city ? `${kmLabel(city.km)} km from ${city.name}` : null,
    `${site.lat.toFixed(3)}, ${site.lon.toFixed(3)}`,
    near?.nearestHub ? `nearest hub ${near.nearestHub.code}, ${kmLabel(near.nearestHub.km)} km` : null,
  ].filter(Boolean).join(' · ');

  if (loaded && 'error' in loaded) return <State title="Could not load the results" text={`${loaded.error}. Reload the page to try again.`} />;
  if (!ok || !near) {
    return <div className={atlas.loading} aria-busy="true" data-testid="site-loading">Loading the site report…</div>;
  }

  const copy = () => {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => setStatus('Link copied.'), () => setStatus('Could not copy. The address bar has the link.'));
    else setStatus('Could not copy. The address bar has the link.');
  };
  const csv = () => {
    const { headers, rows } = reportCsv({ name: label, ...site }, settings, strip, storage);
    downloadCsv(`chargeline-site-report-${site.lat.toFixed(3)}_${site.lon.toFixed(3)}.csv`, headers, rows);
  };
  const noNode = near.nodes.length === 0;

  return (
    <div className={classes.page}>
      {/* ------------------------------------------------ where */}
      <header className={classes.head} data-testid="site-where-section">
        <p className={atlas.eyebrow}>Site report</p>
        <h1 className={classes.title} data-testid="site-title">{title}</h1>
        <p className={classes.where} data-testid="site-where">{where}</p>
      </header>

      {/* ------------------------------------------------ battery value */}
      <section className={classes.panel} aria-labelledby="site-value-title" data-testid="site-value">
        <h2 id="site-value-title" className={classes.h2}>Battery value</h2>
        {noNode ? (
          <p className={classes.body} data-testid="site-no-node">No node with prices in this run is placed near this point, so there is no value to show. Try a nearby county.</p>
        ) : (
          <>
            <SiteControls base={base} settings={settings} set={set} />
            {stackFile && <FixtureBanner files={[stackFile]} />}
            <SiteRange cur={cur} settings={settings} scale={scale} loading={loading || !ready} />
            <YearStrip strip={strip} settings={settings} scale={scale} set={set} />
            <h3 className={card.h4}>Nearest nodes</h3>
            <ol className={classes.nodes} data-testid="site-nodes">
              {near.nodes.map((n) => {
                const v = cur?.range?.nodes.find((x) => x.code === n.code)?.value;
                return (
                  <li key={n.code} className={classes.row}>
                    <span className={classes.rowName}>{n.code}<span className={classes.rowSub}>{n.county ? `${n.county} County` : 'County unknown'}{n.precision === 'county' ? ' · county-level location' : ''}</span></span>
                    <span className={classes.num}>{v != null ? usd(v, 1) : 'no result'}</span>
                    <span className={classes.km}>{kmLabel(n.km)} km</span>
                  </li>
                );
              })}
            </ol>
            <p className={classes.small}>Only nodes with price data are listed. A closer node without prices is skipped, so the nearest plant can be nearer than the first row.</p>
          </>
        )}
      </section>

      {/* ------------------------------------------------ storage nearby (hidden when the data file is missing) */}
      {storage && (
        <section className={classes.panel} aria-labelledby="site-storage-title" data-testid="site-storage">
          <h2 id="site-storage-title" className={classes.h2}>Storage nearby</h2>
          <div className={classes.stats}>
            <div className={classes.stat}>
              <p className={classes.statBig} data-testid="storage-operating">{mwLabel(storage.near.operatingMw)}</p>
              <p className={classes.statSub}>operating, {storage.near.operatingCount} {storage.near.operatingCount === 1 ? 'unit' : 'units'}</p>
            </div>
            <div className={classes.stat}>
              <p className={classes.statBig} data-testid="storage-planned">{mwLabel(storage.near.plannedMw)}</p>
              <p className={classes.statSub}>planned, {storage.near.plannedCount} {storage.near.plannedCount === 1 ? 'unit' : 'units'}</p>
            </div>
          </div>
          <p className={classes.small} data-testid="storage-lines">{storageLines(storage.near, storage.radiusKm)[0]}{config.nearbyBatteries.assumption ? ' The radius is a screening choice, not a market rule.' : ''}</p>
          {storage.near.nearest.length > 0 ? (
            <>
              <h3 className={card.h4}>Nearest units</h3>
              <ol className={classes.nodes} data-testid="storage-nearest">
                {storage.near.nearest.map((u) => (
                  <li key={`${u.name}-${u.status}`} className={classes.row}>
                    <span className={classes.rowName}>{u.name}<span className={classes.rowSub}>{statusLabel(u)} · {u.county} County · online {onlineLabel(u.online)}</span></span>
                    <span className={classes.num}>{mwLabel(u.mw)}</span>
                    <span className={classes.km}>{kmLabel(u.distanceKm)} km</span>
                  </li>
                ))}
              </ol>
            </>
          ) : <p className={classes.body}>No operating or planned battery in the EIA data within this radius.</p>}
          <p className={classes.body}>More storage nearby tends to lower the price spreads a new battery can earn.</p>
          <p className={classes.small}>
            Source: {storage.file.source}, {releaseLabel(storage.file.release)} release (as of {storage.file.asOf}). <a className={classes.link} href={storage.file.sourceUrl} target="_blank" rel="noreferrer">EIA-860M workbook</a>.
          </p>
        </section>
      )}

      {/* ------------------------------------------------ for a data center */}
      {studioLoc && (
        <section className={classes.panel} aria-labelledby="site-dc-title" data-testid="site-dc-section">
          <h2 id="site-dc-title" className={classes.h2}>For a data center</h2>
          <p className={classes.body}>
            A large load pays Texas transmission charges that are set by its use during a few peak hours. A battery can cut that use. Data Center mode in Studio screens that case, and it opens here with this place filled in.
          </p>
          <a
            className={classes.cta} data-testid="site-dc"
            href={dcLinkFromSite({ loc: studioLoc, year: settings.year, durationH: settings.durationH, mode: settings.mode, site: { label, lat: site.lat, lon: site.lon, node: nearList[0]?.code ?? null, km: nearList[0]?.km ?? null } })}
          >
            Open Data Center mode
          </a>
        </section>
      )}

      {/* ------------------------------------------------ limits and actions */}
      <section className={classes.panel} aria-labelledby="site-limits-title" data-testid="site-limits">
        <h2 id="site-limits-title" className={classes.h2}>Limits</h2>
        <ul className={card.caveats}>{caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        {stackFile && <StackNotes file={stackFile} />}
        <div className={card.actions}>
          {studioLoc && <a className={card.action} href={studioHash(studioLoc, settings)} data-testid="site-studio">Open in Studio</a>}
          <a className={card.action} href={`#/atlas?${new URLSearchParams({ lat: site.lat.toFixed(4), lon: site.lon.toFixed(4), dur: String(settings.durationH), year: String(settings.year) })}`} data-testid="site-atlas">Open on the Atlas</a>
          <button type="button" className={card.action} onClick={copy} data-testid="site-copy">Copy link</button>
          <button type="button" className={card.action} onClick={csv} disabled={!strip.length} data-testid="site-csv">Download CSV</button>
          <button type="button" className={card.action} onClick={() => window.print()} data-testid="site-print-btn">Print</button>
        </div>
        <p className={card.status} role="status" data-testid="site-status">{status}</p>
      </section>

      <SitePrint
        s={settings} strip={strip} today={new Date().toISOString().slice(0, 10)}
        site={{
          name: title, ...site, county, city: city ? `${kmLabel(city.km)} km from ${city.name}` : null,
          basisLabel: BASIS_LABEL[settings.basis], modeLabel: MODE_LABEL[settings.mode], link: `${window.location.origin}${window.location.pathname}${href}`,
          caveats, sources: stackFile ? stackFile.meta.sources : [],
          storage: storage ? storageSheet(storage.file, storage.near, storage.radiusKm) : undefined,
        }}
      />
    </div>
  );
}
