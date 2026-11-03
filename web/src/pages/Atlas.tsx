import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from '@mantine/core';
import { useApp } from '../state';
import { buildHash } from '../shell/route';
import { loadNodes, loadTexas } from '../data/loader';
import { MONTHS, downloadCsv, num, pct, usd } from '../data/format';
import { SITE, isDetailed } from '../data/site';
import {
  BUCKETS, METRICS, TAIL_RATIO, TOP_N, geoNote, hubRevenue, mapDots, metricValue, outlinePath, percentileRows, placed, placement,
  ratioBuckets, ratioOf, strayStory, topNodes, zoneShort, zonesOf, type Metric,
} from '../data/atlas';
import type { NodeRec, NodesFile, Selection, TexasGeo } from '../data/types';
import { AtlasMap } from '../components/atlas/AtlasMap';
import { Info } from '../components/Info';
import classes from './Atlas.module.css';
import { PER_KW_PER_YEAR, TERMS } from '../copy/terms';

/** Value of a metric for display: dollars for revenue, a percentage for the two shares. */
const fmtMetric = (m: Metric, v: number | null | undefined) => (m === 'rev' ? usd(v, 1) : pct(v));
const fmtRatio = (r: number | null) => (r == null ? '–' : `${r.toFixed(2)}x`);
const UNIT: Record<Metric, string> = { rev: `${TERMS.revenueUnit.label}, ${TERMS.perfectForesight.label.toLowerCase()}`, capture: `of ${TERMS.perfectForesight.label.toLowerCase()} kept by the ${TERMS.dayAheadPlan.label.toLowerCase()}`, top10: 'of revenue from the 10 best days' };

/** The all-node file and the Texas outline. The all-node file is fetched only by Home and the Atlas, and cached by the loader. */
function useAtlasData() {
  const [data, setData] = useState<{ nodes: NodesFile; geo: TexasGeo } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadNodes(), loadTexas()])
      .then(([nodes, geo]) => live && setData({ nodes, geo }))
      .catch((e) => live && setData({ error: String(e) }));
    return () => { live = false; };
  }, []);
  return data;
}

export default function Atlas() {
  const { sel } = useApp();
  const data = useAtlasData();
  if (data && 'error' in data) return <p className={classes.lede}>Could not load the node results for this page: {data.error}</p>;
  if (!data) return <div className={classes.loading} aria-busy="true">Loading every node…</div>;
  return <AtlasView nodes={data.nodes} geo={data.geo} sel={sel} />;
}

export function AtlasView({ nodes: file, geo, sel }: { nodes: NodesFile; geo: TexasGeo; sel: Selection }) {
  const { year, duration_h: durH } = file.meta;
  const all = file.nodes;
  const hubs = useMemo(() => hubRevenue(file), [file]);
  const zones = useMemo(() => zonesOf(all), [all]);
  const zoneOf = useMemo(() => new Map(all.map((n) => [n.code, n.lz])), [all]);
  const outline = useMemo(() => outlinePath(geo), [geo]);
  const where = useMemo(() => placement(file), [file]);

  const [metric, setMetric] = useState<Metric>('rev');
  const [zone, setZone] = useState<string | null>(null);
  // An old #/map?loc=<node> link opens on that node; otherwise the rank-1 node.
  const [code, setCode] = useState(() => (all.some((n) => n.code === sel.location) ? sel.location : [...all].sort((a, b) => a.rank - b.rank)[0]?.code));
  const node = all.find((n) => n.code === code) ?? null;
  const mapRef = useRef<HTMLDivElement>(null);

  const dots = useMemo(() => mapDots(all, metric), [all, metric]);
  const top = useMemo(() => topNodes(all, metric, zone), [all, metric, zone]);
  const mInfo = METRICS.find((x) => x.id === metric)!;

  const choose = (c: string, reveal = false) => {
    setCode(c);
    const lz = zoneOf.get(c);
    if (zone && lz !== zone) setZone(null); // a node outside the filter clears it, so the node is never hidden
    if (reveal) mapRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <div className={classes.page}>
      <header className={classes.intro}>
        <p className={classes.eyebrow}>Atlas · {year} · {durH}-hour battery · {TERMS.revenueUnit.label} ({PER_KW_PER_YEAR})</p>
        <h1 className={classes.h1}>Every node, one map.</h1>
        <p className={classes.lede} data-testid="atlas-lede">
          {num(where.nNodes)} ERCOT resource nodes have complete {year} prices. {num(where.nPlaced)} of them are placed on the map from public plant
          records and ERCOT's interconnection queue. The other {num(where.nUnplaced)} are listed and counted below; no location is guessed.
        </p>
      </header>

      <div className={classes.grid} ref={mapRef}>
        <section className={classes.panel} aria-labelledby="atlas-map-title">
          <h2 id="atlas-map-title" className={classes.srOnly}>Map of every placed node</h2>
          <div className={classes.controls}>
            <div className={classes.pills} role="group" aria-label="Map metric">
              {METRICS.map((x) => (
                <button key={x.id} type="button" className={classes.pill} aria-pressed={metric === x.id} title={x.long} onClick={() => setMetric(x.id)}>{x.label}</button>
              ))}
            </div>
            <div className={classes.zones} role="group" aria-label="Load zone">
              {[null, ...zones].map((z) => (
                <button key={z ?? 'all'} type="button" className={classes.zone} aria-pressed={zone === z} onClick={() => setZone(z)}>{z ? zoneShort(z) : 'All'}</button>
              ))}
            </div>
          </div>
          <p className={classes.meta}>{mInfo.long}, {year}{zone ? ` · ${zoneShort(zone)} load zone` : ''}</p>
          <AtlasMap
            outline={outline} dots={dots} metric={metric} zoneOf={zoneOf} zone={zone} selected={code} onSelect={(c) => choose(c)}
            label={`Map of Texas with ${where.nPlaced} of ${where.nNodes} resource nodes placed, sized and shaded by ${mInfo.label.toLowerCase()}${zone ? `, ${zoneShort(zone)} load zone highlighted` : ''}. The ranked list, the search box and the table below give the same nodes as text.`}
          />
          <div className={classes.legendRow}>
            <ul className={classes.legend} aria-label="Dot colour and size">
              <li><span className={classes.swatch} data-tier="low" aria-hidden="true" />Lower {mInfo.label.toLowerCase()}</li>
              <li><span className={classes.swatch} data-tier="top" data-metric={metric} aria-hidden="true" />Higher {mInfo.label.toLowerCase()}</li>
              {where.nCounty > 0 && <li><span className={classes.ringSwatch} aria-hidden="true" />County-level placement ({where.nCounty})</li>}
            </ul>
            <p className={classes.small}>{num(where.nUnplaced)} nodes are not on the map yet. Click a dot, pick from the list, or search.</p>
          </div>
          <Select
            className={classes.search} label="Find any node" placeholder="Type a node, substation or zone" searchable clearable={false} limit={50}
            data={all.map((n) => ({ value: n.code, label: `${n.code}${n.sub ? ` · ${n.sub}` : ''} · ${zoneShort(n.lz)}${placed(n) ? '' : ' · not on map'}` }))}
            value={null} onChange={(c) => c && choose(c)} nothingFoundMessage="No match" comboboxProps={{ withinPortal: true }}
          />
        </section>

        <div className={classes.side}>
          {node && <NodeCard node={node} file={file} hubs={hubs} metric={metric} sel={sel} />}
          <TopList nodes={top} metric={metric} zone={zone} hubs={hubs} selected={code} onSelect={(c) => choose(c)} />
        </div>
      </div>

      <Stray file={file} />
      <Unplaced file={file} where={where} />
      <NodeTable file={file} hubs={hubs} zone={zone} selected={code} onSelect={(c) => choose(c, true)} />
    </div>
  );
}

// ------------------------------------------------------------ selected node

function NodeCard({ node, file, hubs, metric, sel }: { node: NodeRec; file: NodesFile; hubs: Map<string, number>; metric: Metric; sel: Selection }) {
  const ratio = ratioOf(node, hubs);
  const max = Math.max(...node.monthly, 0);
  const stats: { id: string; label: string; value: string; term?: string }[] = [
    { id: 'rev', label: 'Revenue', value: usd(node.rev, 1), term: 'usd_per_kw_yr' },
    { id: 'ratio', label: node.hub ? `vs ${node.hub}` : 'vs own hub', value: fmtRatio(ratio) },
    { id: 'da', label: TERMS.dayAheadPlan.label, value: usd(node.da_rev, 1), term: 'da' },
    { id: 'capture', label: TERMS.captureRate.label, value: pct(node.capture), term: 'capture_rate' },
    { id: 'top10', label: TERMS.top10DayShare.label, value: pct(node.top10), term: 'top10_day_share' },
    { id: 'cycles', label: 'Cycles a year', value: num(node.cycles), term: 'cycles' },
  ];
  return (
    <section className={classes.panel} aria-labelledby="node-title" data-testid="node-card">
      <p className={classes.meta}>Selected node · rank {node.rank} of {file.meta.n_nodes}</p>
      <h2 id="node-title" className={classes.nodeCode}>{node.code}</h2>
      <p className={classes.nodeSub}>{node.lz ?? 'No load zone'}{node.sub ? ` · substation ${node.sub}` : ''}{node.prec === 'county' && node.county ? ` · ${node.county} County` : ''}</p>
      <p className={classes.bigValue} data-metric={metric} data-testid="node-value">{fmtMetric(metric, metricValue(node, metric))}</p>
      <p className={classes.meta}>{UNIT[metric]}</p>
      <dl className={classes.stats}>
        {stats.map((s) => (
          <div key={s.id}>
            <dt>{s.label}{s.term && <Info terms={s.term} size={12} />}</dt>
            <dd data-testid={`stat-${s.id}`}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className={classes.meta}>Revenue by month · $/kW</p>
      <ol className={classes.months} aria-label={`Perfect-foresight revenue by month for ${node.code}, dollars per kW`}>
        {node.monthly.map((v, i) => (
          <li key={MONTHS[i]}>
            <span className={classes.monthBar} style={{ height: `${max > 0 ? (Math.max(v, 0) / max) * 100 : 0}%` }} aria-hidden="true" />
            <span className={classes.monthLabel} aria-hidden="true">{MONTHS[i][0]}</span>
            <span className={classes.srOnly}>{MONTHS[i]}: {usd(v, 2)}</span>
          </li>
        ))}
      </ol>
      <p className={classes.small} data-testid="geo-note">{geoNote(node)}</p>
      <p className={classes.small}>
        The ratio divides by {node.hub ?? 'the hub'} in the same all-node run ({usd(node.hub ? hubs.get(node.hub) : null, 1)}), so node and hub are on identical prices.
      </p>
      <div className={classes.links}>
        {isDetailed(node.code) && <a className={classes.textLink} href={buildHash('overview', { ...sel, location: node.code })}>Full results for every year and size <span aria-hidden="true">→</span></a>}
        {node.hub && <a className={classes.textLink} href={buildHash('map', { ...sel, location: node.hub })}>{node.hub} in Study sites <span aria-hidden="true">→</span></a>}
      </div>
      <p className={classes.srOnly} aria-live="polite">Selected {node.code}, rank {node.rank} of {file.meta.n_nodes}.</p>
    </section>
  );
}

function TopList({ nodes, metric, zone, hubs, selected, onSelect }: {
  nodes: NodeRec[]; metric: Metric; zone: string | null; hubs: Map<string, number>; selected: string | null; onSelect: (code: string) => void;
}) {
  const mInfo = METRICS.find((x) => x.id === metric)!;
  return (
    <section className={classes.panel} aria-labelledby="top-title">
      <h2 id="top-title" className={classes.cardTitle}>Top {TOP_N} nodes by {mInfo.label.toLowerCase()}{zone ? `, ${zoneShort(zone)}` : ''}</h2>
      <ol className={classes.top} data-testid="top-list">
        {nodes.map((n, i) => (
          <li key={n.code}>
            <button type="button" className={classes.topBtn} aria-pressed={n.code === selected} onClick={() => onSelect(n.code)}>
              <span className={classes.topNum}>{i + 1}</span>
              <span className={classes.topName}>
                <span className={classes.mono}>{n.code}</span>
                <span className={classes.topSub}>{n.lz ?? 'No zone'}{placed(n) ? '' : ' · not on map'}</span>
              </span>
              <span className={classes.topVal}>
                <span className={classes.mono}>{fmtMetric(metric, metricValue(n, metric))}</span>
                <span className={classes.topSub}>{metric === 'rev' ? `${fmtRatio(ratioOf(n, hubs))} hub` : usd(n.rev, 1)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------ node vs hub distribution

function Stray({ file }: { file: NodesFile }) {
  const { buckets, total, noHub } = ratioBuckets(file);
  const rows = percentileRows(file);
  const story = strayStory(file);
  const band = Math.round((BUCKETS[1].hi - 1) * 100);
  const maxN = Math.max(...buckets.map((b) => b.n), 1);
  return (
    <section className={classes.section} aria-labelledby="stray-title">
      <p className={classes.eyebrow}>How far nodes stray from their hub</p>
      <h2 id="stray-title" className={classes.h2} data-testid="stray-title">
        {story.withinShare != null && <>{pct(story.withinShare)} of nodes earn within {band}% of their hub. </>}
        {story.tailCount > 0 && story.maxRatio != null && <>{story.tailCount} earn {TAIL_RATIO} to {story.maxRatio.toFixed(1)} times as much.</>}
      </h2>
      <div className={classes.pair}>
        <article className={classes.card}>
          <h3 className={classes.cardTitle}>Nodes by revenue relative to own hub</h3>
          <p className={classes.meta}>{total} nodes · {file.meta.year} · {file.meta.duration_h}-hour battery{noHub ? ` · ${noHub} without a load zone left out` : ''}</p>
          <ul className={classes.buckets} data-testid="buckets">
            {buckets.map((b) => (
              <li key={b.label}>
                <span className={classes.bucketLabel}>{b.label}</span>
                <span className={classes.bucketTrack} aria-hidden="true"><span className={classes.bucketFill} data-tone={b.tone} style={{ width: `${(b.n / maxN) * 100}%` }} /></span>
                <span className={classes.bucketCount}>{b.n} · {pct(b.share)}</span>
              </li>
            ))}
          </ul>
          <p className={classes.small}>Each class includes its lower edge. Mint is a premium over the hub; amber is the tail at {BUCKETS[3].lo} times and above.</p>
        </article>
        <article className={classes.card}>
          <h3 className={classes.cardTitle}>Revenue percentiles</h3>
          <p className={classes.meta}>{TERMS.revenueUnit.label}, and as a multiple of own hub</p>
          <div className={classes.tableBox} tabIndex={0} role="region" aria-label="Revenue percentiles table, scrolls sideways when it does not fit">
            <table className={classes.table} data-testid="percentiles">
              <thead><tr><th scope="col">Percentile</th><th scope="col" className={classes.num}>{TERMS.revenueUnit.label}</th><th scope="col" className={classes.num}>vs hub</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className={classes.mono}>{r.label}</th>
                    <td className={classes.num}>{usd(r.rev, 1)}</td>
                    <td className={classes.num} data-tail={r.ratio >= TAIL_RATIO || undefined}>{fmtRatio(r.ratio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={classes.small}>
            Each column is its own percentile, so a row is not one node. Ratios divide by hub revenue from the same bulk price files, so node and hub are on identical data.
          </p>
        </article>
      </div>
    </section>
  );
}

function Unplaced({ file, where }: { file: NodesFile; where: ReturnType<typeof placement> }) {
  return (
    <section className={classes.note} aria-labelledby="unplaced-title">
      <div>
        <h2 id="unplaced-title" className={classes.cardTitle} data-testid="unplaced-title">{num(where.nUnplaced)} nodes are waiting for a location</h2>
        <p>
          ERCOT publishes prices by node name, not by coordinates. Locations come from EIA plant records and ERCOT's interconnection queue,
          matched node by node ({where.nCounty} of the {where.nPlaced} only to a county).
          {where.topUnplaced > 0 && <> {where.topUnplaced} of the top {where.topK} earners are not placed yet, so the map understates the tail.</>}
          {' '}Every node is in the table below, placed or not. Nodes that started, retired or had data gaps in {file.meta.year} ({num(file.meta.n_nodes_in_data - file.meta.n_nodes)} of {num(file.meta.n_nodes_in_data)}) are left out of the run.
        </p>
      </div>
      <a className={classes.ghost} href={`${SITE.repo}/blob/main/results/geocoding_log_all_nodes.md`} target="_blank" rel="noreferrer">How nodes are located <span aria-hidden="true">→</span></a>
    </section>
  );
}

// ------------------------------------------------------------ every node, as a table

type Key = 'rank' | 'code' | 'lz' | 'rev' | 'vs_hub' | 'da_rev' | 'capture' | 'top10' | 'cycles' | 'spread' | 'corr_hub';
const COLS: { key: Key; label: string; term?: string; num?: boolean }[] = [
  { key: 'rank', label: '#', num: true },
  { key: 'code', label: 'Node' },
  { key: 'lz', label: 'Load zone' },
  { key: 'rev', label: TERMS.revenueUnit.label, term: 'usd_per_kw_yr', num: true },
  { key: 'vs_hub', label: 'vs hub', num: true },
  { key: 'da_rev', label: TERMS.dayAheadPlan.label, term: 'da', num: true },
  { key: 'capture', label: TERMS.captureRate.label, term: 'capture_rate', num: true },
  { key: 'top10', label: TERMS.top10DayShare.label, term: 'top10_day_share', num: true },
  { key: 'cycles', label: 'Cycles', term: 'cycles', num: true },
  { key: 'spread', label: 'Spread', term: 'spread_captured', num: true },
  { key: 'corr_hub', label: 'Corr. hub', term: 'corr_hub', num: true },
];
const PAGE = 25;

function NodeTable({ file, hubs, zone, selected, onSelect }: {
  file: NodesFile; hubs: Map<string, number>; zone: string | null; selected: string | null; onSelect: (code: string) => void;
}) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: 'rev', desc: true });
  const [unplacedOnly, setUnplacedOnly] = useState(false);
  const [n, setN] = useState(PAGE);
  const rows = useMemo(() => {
    const val = (r: NodeRec): number | string | null => (sort.key === 'vs_hub' ? ratioOf(r, hubs) : r[sort.key]);
    return file.nodes
      .filter((r) => (!zone || r.lz === zone) && (!unplacedOnly || !placed(r)))
      .sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null) return 1;
        if (y == null) return -1;
        const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
        return sort.desc ? -c : c;
      });
  }, [file, hubs, sort, zone, unplacedOnly]);

  const click = (key: Key) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: !['code', 'lz', 'rank'].includes(key) }));
  const csv = () => downloadCsv(
    `ercot_nodes_${file.meta.year}_${file.meta.duration_h}h.csv`,
    ['rank', 'node', 'load_zone', 'hub', 'usd_per_kw_yr', 'vs_hub', 'da_scheduled_usd_per_kw_yr', 'capture_rate', 'top10_share', 'cycles', 'spread_usd_mwh', 'corr_hub', 'lat', 'lon', 'position_precision', 'county'],
    rows.map((r) => [r.rank, r.code, r.lz, r.hub, r.rev, ratioOf(r, hubs)?.toFixed(3) ?? null, r.da_rev, r.capture, r.top10, r.cycles, r.spread, r.corr_hub, r.lat, r.lon, r.prec, r.county]),
  );

  return (
    <section className={classes.section} aria-labelledby="table-title">
      <div className={classes.tableHead}>
        <div>
          <h2 id="table-title" className={classes.h3}>Every node</h2>
          <p className={classes.sub}>
            All {file.meta.n_nodes} resource nodes{zone ? ` in the ${zoneShort(zone)} load zone (set by the zone filter above)` : ''}, placed or not.
            Sort by any column; select a node to show it on the map.
          </p>
        </div>
        <div className={classes.tableTools}>
          <label className={classes.check}>
            <input type="checkbox" checked={unplacedOnly} onChange={(e) => { setUnplacedOnly(e.currentTarget.checked); setN(PAGE); }} />
            Only nodes not on the map
          </label>
          <button type="button" className={classes.ghost} onClick={csv}>Download CSV</button>
        </div>
      </div>
      <div className={classes.tableBox} tabIndex={0} role="region" aria-label="All located nodes table, scrolls sideways when it does not fit">
        <table className={`${classes.table} ${classes.wide}`} data-testid="node-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className={c.num ? classes.num : undefined} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  <span className={classes.thInner}>
                    <button type="button" className={classes.sortBtn} onClick={() => click(c.key)}>
                      {c.label}{sort.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                    </button>
                    {c.term && <Info terms={c.term} size={12} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, n).map((r) => (
              <tr key={r.code} data-on={r.code === selected || undefined}>
                <td className={classes.num}>{r.rank}</td>
                <th scope="row">
                  <button type="button" className={classes.rowBtn} aria-pressed={r.code === selected} onClick={() => onSelect(r.code)}>
                    <span className={classes.mono}>{r.code}</span>
                    {!placed(r) ? <span className={classes.topSub}>not on map</span> : r.prec === 'county' && <span className={classes.topSub}>county-level ({r.county})</span>}
                  </button>
                </th>
                <td>{r.lz ?? '–'}</td>
                <td className={classes.num}>{usd(r.rev, 1)}</td>
                <td className={classes.num}>{fmtRatio(ratioOf(r, hubs))}</td>
                <td className={classes.num}>{usd(r.da_rev, 1)}</td>
                <td className={classes.num}>{pct(r.capture)}</td>
                <td className={classes.num}>{pct(r.top10)}</td>
                <td className={classes.num}>{num(r.cycles)}</td>
                <td className={classes.num}>{usd(r.spread, 0)}</td>
                <td className={classes.num}>{r.corr_hub == null ? '–' : num(r.corr_hub, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={classes.tableFoot}>
        <p className={classes.small}>
          Showing {Math.min(n, rows.length)} of {rows.length}. Hubs on the same run: {file.hubs.map((h) => `${h.code} ${usd(h.rev, 1)}`).join(' · ')}.
        </p>
        {n < rows.length && (
          <div className={classes.tableTools}>
            <button type="button" className={classes.ghost} onClick={() => setN((v) => v + 100)}>Show 100 more</button>
            <button type="button" className={classes.ghost} onClick={() => setN(rows.length)}>Show all</button>
          </div>
        )}
      </div>
    </section>
  );
}
