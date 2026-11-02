import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { loadLocations, loadNodes, loadTexas } from '../data/loader';
import { num, pct, usd } from '../data/format';
import { locName } from '../data/site';
import {
  METRICS, TIER_LABEL, buildHome, durationStory, headlinePct, hubPoint, mapDots, metricValue, outlinePath, project,
  type HomeModel, type HubRow, type Metric, type Tier,
} from '../data/home';
import type { LocationsFile, NodesFile, TexasGeo } from '../data/types';
import { HomeMap, type Marker } from '../components/home/HomeMap';
import { HubTiles } from '../components/live/HubTiles';
import { ErrorDetails } from '../components/live/ErrorDetails';
import { useLiveFeed } from '../live/useLiveFeed';
import { ago, ctTime, pricesThrough, type LiveLoad } from '../live/live';
import classes from './Home.module.css';

const zoneName = (lz: string | null) => (lz ? lz.replace(/^LZ_/, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : null);

/** Value of a metric for display: dollars for revenue, a percentage for the two shares. */
const fmtMetric = (m: Metric, v: number | null | undefined) => (m === 'rev' ? usd(v, 1) : pct(v));

interface Chip {
  n: number;
  name: string;
  value: string;
  sub: string;
}

/** The three numbered places: the West and Houston hubs (detailed runs) and the rank-1 node (all-node run). */
function chipsFor(m: HomeModel, metric: Metric): Chip[] {
  const hub = (n: number, h: HubRow | null, name: string): Chip | null => h && ({
    n, name,
    value: metric === 'rev' ? usd(h.pf, 1) : pct(metric === 'capture' ? h.kept : h.top10),
    sub: metric === 'rev' ? 'perfect foresight' : metric === 'capture' ? 'kept by day-ahead' : 'from the 10 best days',
  });
  const b = m.best;
  const node: Chip | null = b && {
    n: 3,
    name: `${b.node.code}${zoneName(b.node.lz) ? `, ${zoneName(b.node.lz)}` : ''}`,
    value: fmtMetric(metric, metricValue(b.node, metric)),
    sub: metric === 'rev' && b.ratio != null ? `${b.ratio.toFixed(1)}x its hub` : b.underReview ? 'location under review' : 'resource node',
  };
  return [hub(1, m.west, 'West hub'), hub(2, m.houston, 'Houston hub'), node].filter((c): c is Chip => !!c);
}

function markersFor(m: HomeModel, locs: LocationsFile, chips: Chip[]): Marker[] {
  const out: Marker[] = [];
  for (const [n, code] of [[1, 'HB_WEST'], [2, 'HB_HOUSTON']] as const) {
    const p = hubPoint(locs, code);
    const c = chips.find((x) => x.n === n);
    if (p && c) {
      out.push({
        n, x: p.x, y: p.y, callout: `${c.name} · ${c.value}`, note: 'hub, schematic',
        tip: `${locName(code)} (${code}), hub, schematic: drawn at ${p.city}. A hub is a price average over many buses, so it has no single location.`,
      });
    }
  }
  const b = m.best;
  const c = chips.find((x) => x.n === 3);
  if (b && c && b.node.lat != null && b.node.lon != null) {
    const [x, y] = project(b.node.lon, b.node.lat);
    out.push({
      n: 3, x, y, callout: `${c.name} · ${c.value}`, note: b.underReview ? 'location under review' : null,
      tip: `${b.node.code}, rank 1 of ${m.nNodes} nodes${b.underReview ? '. Location under review: geocoded by hand, not yet confirmed' : ''}.`,
    });
  }
  return out;
}

/** What the page needs beyond the results index, which the app already holds. */
function useHomeData() {
  const [data, setData] = useState<{ nodes: NodesFile; locs: LocationsFile; geo: TexasGeo } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadNodes(), loadLocations(), loadTexas()])
      .then(([nodes, locs, geo]) => live && setData({ nodes, locs, geo }))
      .catch((e) => live && setData({ error: String(e) }));
    return () => { live = false; };
  }, []);
  return data;
}

export default function Home() {
  const { index } = useApp();
  const data = useHomeData();
  const feed = useLiveFeed();
  if (data && 'error' in data) return <p className={classes.lede}>Could not load the results for this page: {data.error}</p>;
  if (!index || !data) return <div className={classes.loading} aria-busy="true">Loading results…</div>;
  return <HomeView index={index} nodes={data.nodes} locs={data.locs} geo={data.geo} live={feed} />;
}

export function HomeView({ index, nodes, locs, geo, live }: {
  index: Parameters<typeof buildHome>[0];
  nodes: NodesFile;
  locs: LocationsFile;
  geo: TexasGeo;
  live: { load: LiveLoad | null; now: number };
}) {
  const m = useMemo(() => buildHome(index, nodes), [index, nodes]);
  const outline = useMemo(() => outlinePath(geo), [geo]);
  const [metric, setMetric] = useState<Metric>('rev');
  const [marker, setMarker] = useState(3);
  const dots = useMemo(() => mapDots(nodes.nodes, metric), [nodes, metric]);
  const chips = chipsFor(m, metric);
  const markers = markersFor(m, locs, chips);
  const head = headlinePct(m);
  const mInfo = METRICS.find((x) => x.id === metric)!;
  const durH = `${m.durationH}-hour`;
  const top10 = [...dots].reverse().slice(0, 10);
  const tiers = (['low', 'mid', 'top'] as Tier[]);

  return (
    <div className={classes.page}>
      {/* ------------------------------------------------ hero */}
      <section className={classes.hero} aria-labelledby="home-title">
        <div className={classes.heroText}>
          <p className={classes.eyebrow}>The finding · {m.year} backtest · {m.nNodes} nodes</p>
          <h1 id="home-title" className={classes.h1} data-testid="headline">
            {head != null && m.west && m.houston
              ? <>West hub batteries would have out-earned Houston by {head}% in {m.year}.</>
              : <>Where a Texas battery sits changes what it earns.</>}
          </h1>
          <p className={classes.lede}>
            We replayed ERCOT's {m.year} prices through a {durH} battery at the five trading hubs and at every one of {m.nNodes} resource
            nodes with complete prices. The spread between places is wide, and so is the gap between a perfect trade and a scheduled one.
          </p>
          <div className={classes.ctas}>
            <a className={classes.primary} href="#/atlas">Explore the Atlas</a>
            <a className={classes.secondary} href="#/studio/custom">Run your own battery</a>
          </div>
        </div>

        <div className={classes.mapCol}>
          <HomeMap
            outline={outline} dots={dots} metric={metric} markers={markers} selected={marker} onSelect={setMarker}
            label={`Map of Texas with ${m.nPlaced} of ${m.nNodes} resource nodes placed, sized and shaded by ${mInfo.label.toLowerCase()}. The list under the map gives the same nodes as text.`}
          />
          <div className={classes.glass}>
            <div className={classes.glassHead}>
              <h2 className={classes.glassTitle}>{mInfo.label} by node</h2>
              <span className={classes.meta}>{m.year} · {durH} battery · {metric === 'rev' ? '$/kW-year' : 'share'}</span>
            </div>
            <div className={classes.metrics} role="group" aria-label="Map metric">
              {METRICS.map((x) => (
                <button key={x.id} type="button" className={classes.metricBtn} aria-pressed={metric === x.id} title={x.long} onClick={() => setMetric(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
            <div className={classes.chips} role="group" aria-label="Numbered places on the map">
              {chips.map((c) => (
                <button key={c.n} type="button" className={classes.chip} aria-pressed={marker === c.n} onClick={() => setMarker(c.n)} data-testid={`chip-${c.n}`}>
                  <span className={classes.chipNum} aria-hidden="true">{c.n}</span>
                  <span className={classes.chipBody}>
                    <span className={classes.chipName}>{c.name}</span>
                    <span className={classes.chipValue}>{c.value}</span>
                    <span className={classes.chipSub}>{c.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            <ul className={classes.legend} aria-label="Dot colour">
              {tiers.map((t) => <li key={t}><span className={classes.swatch} data-tier={t} data-metric={metric} aria-hidden="true" />{TIER_LABEL[t]}</li>)}
              {dots.some((d) => d.county) && <li><span className={classes.ringSwatch} aria-hidden="true" />County-level placement</li>}
            </ul>
            <p className={classes.small}>
              {m.nPlaced} of {m.nNodes} nodes have coordinates and are drawn; the other {m.nUnplaced} are counted in the <a href="#/atlas">Atlas</a>,
              not dropped. Hub markers are schematic, at a representative city. Hub chips use the detailed hub runs; the dots and node 3 use
              the all-node run.
            </p>
            <details className={classes.listAlt}>
              <summary>Top 10 placed nodes by {mInfo.label.toLowerCase()}, as a list</summary>
              <ol>
                {top10.map((d) => <li key={d.code}><span className={classes.mono}>{d.code}</span> {fmtMetric(metric, d.value)}</li>)}
              </ol>
            </details>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ key numbers */}
      <section className={classes.band} aria-label="Key numbers">
        <div className={classes.keys}>
          {m.west && m.houston && (
            <div className={classes.key}>
              <p className={classes.big} data-tone="amber" data-testid="key-west">{usd(m.west.pf, 1)}</p>
              <p className={classes.keyText}>per kW-year at the West hub, against {usd(m.houston.pf, 1)} at Houston</p>
              <p className={classes.meta}>{m.year} · {durH} battery · perfect foresight</p>
            </div>
          )}
          {m.houston?.kept != null && (
            <div className={classes.key}>
              <p className={classes.big} data-testid="key-kept">{pct(m.houston.kept)}</p>
              <p className={classes.keyText}>of perfect-foresight revenue kept by a day-ahead schedule at Houston</p>
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
          <p>
            Perfect foresight times every charge and discharge with hindsight, so it is an upper bound. A day-ahead schedule commits the
            plan the day before and settles at real-time prices.
          </p>
          <a className={classes.textLink} href="#/guide">What each number means <span aria-hidden="true">→</span></a>
        </div>
      </section>

      {/* ------------------------------------------------ what a schedule keeps */}
      <section className={classes.section} aria-labelledby="keeps-title">
        <p className={classes.eyebrow}>What a schedule keeps</p>
        <h2 id="keeps-title" className={classes.h2} data-testid="keeps-title">
          {m.keptRange ? <>A real schedule keeps {pct(m.keptRange[0])} to {pct(m.keptRange[1])} of perfect hindsight.</> : <>What a real schedule keeps.</>}
        </h2>
        <p className={classes.sub}>Houston and duration first, then all five hubs. Perfect foresight is an upper bound no operator can reach.</p>

        <div className={classes.pair}>
          {m.houston && <GapCard h={m.houston} m={m} />}
          {m.durations.length > 0 && <DurationCard m={m} />}
        </div>
        <HubTable m={m} />
      </section>

      {/* ------------------------------------------------ today */}
      <section className={classes.section} aria-labelledby="today-title">
        <p className={classes.eyebrow}>Today in ERCOT</p>
        <h2 id="today-title" className={classes.h3}>Hub prices right now</h2>
        <Today live={live} />
      </section>

      {/* ------------------------------------------------ four ways in */}
      <section className={classes.section} aria-labelledby="ways-title">
        <h2 id="ways-title" className={classes.eyebrow}>Four ways in</h2>
        <ul className={classes.ways}>
          {[
            { n: '01', title: 'Atlas', href: '#/atlas', cta: 'Open Atlas', text: `Every node on the map. Revenue, capture rate and spike dependence across ${m.nNodes} ERCOT resource nodes.` },
            { n: '02', title: 'Studio', href: '#/studio/custom', cta: 'Open Studio', text: 'Run your own battery. Choose a location, duration and efficiency, and the model solves it in your browser.' },
            { n: '03', title: 'Research', href: '#/research', cta: 'Read Research', text: 'Findings and method: perfect foresight vs day-ahead, ancillary services, and the real-time co-optimization change.' },
            { n: '04', title: 'Guide', href: '#/guide', cta: 'Start with Guide', text: 'New here? Start here. What each number means, how to read it, and where the model stops being realistic.' },
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

function Bar({ label, value, share, tone }: { label: string; value: string; share: number; tone: 'mint' | 'amber' }) {
  return (
    <div className={classes.hbar}>
      <div className={classes.hbarHead}><span>{label}</span><span className={classes.mono} data-tone={tone}>{value}</span></div>
      <div className={classes.track}><div className={classes.fill} data-tone={tone} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} /></div>
    </div>
  );
}

function GapCard({ h, m }: { h: HubRow; m: HomeModel }) {
  return (
    <article className={classes.card}>
      <h3 className={classes.cardTitle}>The gap that matters</h3>
      <p className={classes.meta}>Houston hub · {m.year} · {m.durationH}-hour battery · $/kW-year</p>
      <Bar label="Perfect foresight (upper bound)" value={num(h.pf, 1)} share={1} tone="mint" />
      {h.da != null && <Bar label="Day-ahead schedule, real-time settled" value={num(h.da, 1)} share={h.da / h.pf} tone="amber" />}
      {h.gap != null && <p className={classes.meta} data-testid="gap">{num(h.gap, 1)} $/kW-year left on the table</p>}
      <p className={classes.cardText}>
        {h.kept != null && <>A day-ahead schedule keeps {pct(h.kept)} of what perfect hindsight would earn. </>}
        {h.top10 != null && <>The 10 best days alone made {pct(h.top10)} of the perfect-foresight total.</>}
      </p>
    </article>
  );
}

function DurationCard({ m }: { m: HomeModel }) {
  const story = durationStory(m);
  const max = Math.max(...m.durations.map((d) => d.pf));
  return (
    <article className={classes.card}>
      <h3 className={classes.cardTitle}>Longer earns more per kW</h3>
      <p className={classes.meta}>Houston hub · {m.year} · $/kW-year</p>
      <ol className={classes.vbars} aria-label="Perfect-foresight revenue by battery duration">
        {m.durations.map((d) => (
          <li key={d.h} className={classes.vbar}>
            <span className={classes.mono}>{num(d.pf, 1)}</span>
            <span className={classes.vfill} data-on={d.h === m.durationH || undefined} style={{ height: `${(d.pf / max) * 100}%` }} />
            <span className={classes.vlabel}>{d.h}h</span>
          </li>
        ))}
      </ol>
      <p className={classes.cardText} data-testid="duration-story">
        Per kWh of storage {story.flips ? 'the order flips' : 'it reads'}: {story.perKwh.map((d) => usd(d.v, 1)).join(', ')} a year.
        {story.step && <> Doubling from {story.step.from}h to {story.step.to}h adds {pct(story.step.revenue)} revenue for {pct(story.step.energy)} more energy capacity.</>}
      </p>
    </article>
  );
}

function HubTable({ m }: { m: HomeModel }) {
  const max = Math.max(...m.hubs.map((h) => h.pf));
  return (
    <article className={classes.card}>
      <h3 className={classes.cardTitle}>Hub revenue, ranked</h3>
      <p className={classes.meta}>{m.year} · {m.durationH}-hour battery · {usd(m.deg, 0)}/MWh degradation · $/kW-year</p>
      <div className={classes.tableBox} tabIndex={0} role="region" aria-label="Hub revenue table, scrolls sideways when it does not fit">
        <table className={classes.table}>
          <thead>
            <tr><th scope="col">Hub</th><th scope="col" className={classes.num}>Perfect foresight</th><th scope="col" className={classes.num}>Day-ahead</th><th scope="col" className={classes.num}>Kept</th></tr>
          </thead>
          <tbody>
            {m.hubs.map((h, i) => (
              <tr key={h.code} data-first={i === 0 || undefined} data-testid={`hub-${h.code}`}>
                <th scope="row" className={classes.mono}>{h.code}</th>
                <td className={classes.num}>
                  <span className={classes.pfCell}>
                    <span className={classes.miniTrack} aria-hidden="true"><span className={classes.miniFill} style={{ width: `${(h.pf / max) * 100}%` }} /></span>
                    {num(h.pf, 1)}
                  </span>
                </td>
                <td className={classes.num}>{num(h.da, 1)}</td>
                <td className={classes.num} data-kept>{pct(h.kept)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={classes.small}>Ranked by perfect-foresight revenue. Kept is day-ahead revenue as a share of perfect foresight. Detailed hub runs.</p>
    </article>
  );
}

function Today({ live }: { live: { load: LiveLoad | null; now: number } }) {
  const { load, now } = live;
  if (!load) return <p className={classes.sub}>Loading live prices…</p>;
  if (load.source === 'none') {
    return (
      <div className={classes.notice} role="status">
        <p>Live prices unavailable right now. The backtest above does not depend on them.</p>
        <ErrorDetails items={[load.reason]} />
      </div>
    );
  }
  const s = load.state;
  const through = pricesThrough(s);
  return (
    <>
      <HubTiles s={s} />
      <div className={classes.todayFoot}>
        <p className={classes.small}>
          {load.source === 'cache'
            ? <>New prices could not be loaded. Showing the copy saved in this browser {ago(Date.parse(s.checkedAt), now)}.</>
            : through === null ? <>No real-time prices posted yet today.</> : <>Real-time prices through {ctTime(through)} CT, {ago(through, now)}.</>}
          {load.source === 'worker' && s.errors.length > 0 && <> The last update could not fetch everything from ERCOT, so some figures carry over from earlier.</>}
        </p>
        <a className={classes.textLink} href="#/home/live">Today's charts and tomorrow's plan <span aria-hidden="true">→</span></a>
      </div>
      <ErrorDetails items={load.source === 'cache' ? [load.reason] : s.errors} />
    </>
  );
}
