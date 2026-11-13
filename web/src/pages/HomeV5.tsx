// Home with V5 on (V5 step 1): one action first (screen a site), then the three figures a developer acts on, the hub table and
// live prices, and a way into each of Atlas, Studio and Learn. The old Home (pages/Home.tsx) is unchanged and used with V5 off.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { buildHash } from '../shell/route';
import { loadNodes } from '../data/loader';
import { pct, usd } from '../data/format';
import { buildHome, yearSpan, type HomeModel } from '../data/home';
import type { IndexRun, NodesFile, Selection } from '../data/types';
import { loadCountyIndex, loadPlaces } from '../v4/geo/load';
import { buildSearchIndex, type SearchHit, type SearchIndex } from '../v4/geo/search';
import { SiteSearch } from '../v4/map/SiteSearch';
import { siteHash } from '../v5/siteTarget';
import { useLiveFeed } from '../live/useLiveFeed';
import type { LiveLoad } from '../live/live';
import { HubTable, Today } from './Home';
import { PER_KW_PER_YEAR, TERMS } from '../copy/terms';
import classes from './Home.module.css';

/** Counties and cities for the search box, loaded when Home opens. A failed load leaves the box saying it is loading. */
function usePlaceIndex(): SearchIndex | null {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadCountyIndex(), loadPlaces()]).then(([counties, places]) => live && setIndex(buildSearchIndex(counties, places))).catch(() => {});
    return () => { live = false; };
  }, []);
  return index;
}

/** The all-node file, for the node count and the best node. */
function useNodes() {
  const [data, setData] = useState<NodesFile | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    loadNodes().then((n) => live && setData(n)).catch((e) => live && setData({ error: String(e) }));
    return () => { live = false; };
  }, []);
  return data;
}

export default function HomeV5() {
  const { index, sel } = useApp();
  const nodes = useNodes();
  const feed = useLiveFeed();
  const places = usePlaceIndex();
  if (nodes && 'error' in nodes) return <p className={classes.lede}>Could not load the results for this page: {nodes.error}</p>;
  if (!index || !nodes) return <div className={classes.loading} aria-busy="true">Loading results…</div>;
  return <HomeV5View index={index} nodes={nodes} places={places} live={feed} sel={sel} />;
}

export function HomeV5View({ index, nodes, places, live, sel }: {
  sel: Selection;
  index: IndexRun[];
  nodes: NodesFile;
  places: SearchIndex | null;
  live: { load: LiveLoad | null; now: number };
}) {
  const m = useMemo(() => buildHome(index, nodes), [index, nodes]);
  const years = yearSpan(index);
  const onPick = (hit: SearchHit) => { window.location.hash = siteHash(hit.lat, hit.lon); window.scrollTo({ top: 0 }); };

  return (
    <div className={classes.page}>
      {/* ------------------------------------------------ hero: one search box */}
      <section className={classes.heroSolo} aria-labelledby="home-title">
        <div className={classes.heroText} data-tour="hero">
          <p className={classes.eyebrow} data-testid="hero-eyebrow">
            Real ERCOT prices · {m.nNodes + m.hubs.length} locations{years && <> · {years[0]}–{years[1]}</>}
          </p>
          <h1 id="home-title" className={classes.h1}>Where should a battery go in Texas?</h1>
          <p className={classes.lede} data-testid="hero-sub">
            Search a county, a city, or a point. Chargeline replays real ERCOT prices through a grid battery there and shows what it would have earned.
            It is a backtest of past prices, not a forecast.
          </p>
          <div className={classes.heroSearch} data-testid="hero-search">
            <SiteSearch index={places} onPick={onPick} onClear={() => {}} label="Screen a site" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ three figures */}
      <Headlines m={m} />

      {/* ------------------------------------------------ hubs and live prices */}
      <section className={classes.section} aria-labelledby="hubs-title">
        <p className={classes.eyebrow}>By hub</p>
        <h2 id="hubs-title" className={classes.h3}>The trading hubs</h2>
        <HubTable m={m} />
        <p className={classes.small} data-testid="hub-links">
          What a real schedule keeps, and why battery length matters, are in{' '}
          <a href={buildHash('realism', sel)}>Reality check</a> and in the <a href="#/learn/research?f=3">research findings</a>.
        </p>
      </section>
      <section className={classes.section} aria-labelledby="today-title">
        <p className={classes.eyebrow}>Today in ERCOT</p>
        <h2 id="today-title" className={classes.h3} tabIndex={-1}>Hub prices right now</h2>
        <Today live={live} />
      </section>

      {/* ------------------------------------------------ three ways in */}
      <section className={classes.section} aria-labelledby="ways-title">
        <h2 id="ways-title" className={classes.eyebrow}>Three ways in</h2>
        <ul className={`${classes.ways} ${classes.waysThree}`}>
          {[
            { n: '01', title: 'Atlas', href: '#/atlas', cta: 'Open Atlas', text: `Every node on the map. Revenue across ${m.nNodes} ERCOT resource nodes, and a site card for any place you pick.` },
            { n: '02', title: 'Studio', href: '#/studio', cta: 'Open Studio', text: 'Run your own battery. Choose a location, duration and efficiency, and the model solves it in your browser.' },
            { n: '03', title: 'Learn', href: '#/learn', cta: 'Open Learn', text: 'New here? What each number means, the research behind it, and where the model stops being realistic.' },
          ].map((w) => (
            <li key={w.title} className={classes.way}>
              <span className={classes.wayNum} aria-hidden="true">{w.n}</span>
              <h3 className={classes.wayTitle}>{w.title}</h3>
              <p>{w.text}</p>
              <a className={classes.textLink} href={w.href}>{w.cta} <span aria-hidden="true">→</span></a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * The three figures a developer acts on, the same ones the old Home computes: what the best hub earns, how much of that a real
 * schedule keeps, and how far a single node can sit above its hub. Each carries the caveat that qualifies it.
 */
function Headlines({ m }: { m: HomeModel }) {
  const durH = `${m.durationH}-hour`;
  return (
    <section className={classes.band} aria-label="Key numbers">
      <div className={classes.keys}>
        {m.west && m.houston && (
          <div className={classes.key}>
            <p className={classes.big} data-tone="amber" data-testid="key-west">{usd(m.west.pf, 1)}</p>
            <p className={classes.keyText}>{PER_KW_PER_YEAR} at the West hub, against {usd(m.houston.pf, 1)} at Houston</p>
            <p className={classes.meta}>{m.year} · {durH} battery · perfect foresight</p>
          </div>
        )}
        {m.houston?.kept != null && (
          <div className={classes.key}>
            <p className={classes.big} data-testid="key-kept">{pct(m.houston.kept)}</p>
            <p className={classes.keyText}>of perfect-foresight revenue kept by the day-ahead plan at Houston</p>
            <p className={classes.meta}>{m.year} · {durH} battery</p>
          </div>
        )}
        {m.best?.ratio != null && (
          <div className={classes.key}>
            <p className={classes.big} data-testid="key-ratio">{m.best.ratio.toFixed(1)}x</p>
            <p className={classes.keyText}>what the best of {m.nNodes} nodes earned compared with its hub</p>
            <p className={classes.meta}>{m.best.node.code} · one node, a ceiling not an average · all-node run</p>
          </div>
        )}
      </div>
      <div className={classes.keyFoot}>
        <p>{TERMS.perfectForesight.definition} It is an upper bound. {TERMS.dayAheadPlan.definition}</p>
        <a className={classes.textLink} href="#/learn">What each number means <span aria-hidden="true">→</span></a>
      </div>
    </section>
  );
}
