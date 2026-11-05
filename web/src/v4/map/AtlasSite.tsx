import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Topology } from 'topojson-specification';
import { AtlasMap } from '../../components/atlas/AtlasMap';
import { project } from '../../data/home';
import { loadCountiesTopo, loadCountyIndex, loadNodeIndex, loadPlaces, countiesGeoJson } from '../geo/load';
import { nearestNodes } from '../geo/nearest';
import { buildSearchIndex, inTexas, type CountyInput, type SearchHit } from '../geo/search';
import type { NodeIndex, Place } from '../geo/types';
import { layoutCities } from './labels';
import { SiteSearch } from './SiteSearch';
import {
  COUNTY_FROM, FULL_VIEW, clientToLonLat, countyOpacity, countyPaths, dotScale, landStroke, panBy, viewAround, viewBox, viewForBounds, zoomBy, zoomOf,
  type CountyPaths, type View,
} from './view';
import classes from './AtlasSite.module.css';

/** Where the geo files come from. The default fetches them (lazily); tests pass the files read from disk. */
export interface GeoSource {
  places: () => Promise<Place[]>;
  counties: () => Promise<(CountyInput & { fips: string })[]>;
  topo: () => Promise<Topology>;
  nodeIndex: () => Promise<NodeIndex>;
}
export const REAL_SOURCE: GeoSource = { places: loadPlaces, counties: loadCountyIndex, topo: loadCountiesTopo, nodeIndex: loadNodeIndex };

/** A pinned site. `county` is set when it came from a county search, so that county's outline can be drawn heavier. */
export interface Pin { lat: number; lon: number; label: string; sub: string; county?: string }

type MapProps = Parameters<typeof AtlasMap>[0];
const NEAR_K = 3;
const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

/** Load once, when `enabled` first becomes true. A failed load leaves the value empty; the rest of the map still works. */
function useLazy<T>(load: () => Promise<T>, enabled: boolean): T | null {
  const [value, setValue] = useState<T | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    let live = true;
    load().then((v) => live && setValue(v)).catch(() => { started.current = false; });
    return () => { live = false; };
  }, [enabled, load]);
  return value;
}

/**
 * V4 wrapper for the Atlas map (behind the V4 flag, loaded lazily): county outlines at mid zoom, city markers and labels,
 * a search box, zoom and drag, a "Pick a site" mode that drops a pin on a click, and the nearest nodes to the pin.
 * `children` (the legend) sit between the map and the nearest-node list.
 */
export default function AtlasSite({ source = REAL_SOURCE, children, ...map }: Omit<MapProps, 'v4'> & { source?: GeoSource; children?: ReactNode }) {
  const [view, setView] = useState<View>(FULL_VIEW);
  const [pin, setPin] = useState<Pin | null>(null);
  const [picking, setPicking] = useState(false);
  const zoom = zoomOf(view);
  const svg = useRef<SVGSVGElement>(null);

  const load = useMemo(() => source, [source]);
  const places = useLazy(load.places, true);
  const counties = useLazy(load.counties, true);
  const needCounties = zoom > COUNTY_FROM || !!pin?.county;
  const topo = useLazy(load.topo, needCounties);
  const nodeIndex = useLazy(load.nodeIndex, !!pin);

  const searchIndex = useMemo(() => (places && counties ? buildSearchIndex(counties, places) : null), [places, counties]);
  const paths: CountyPaths | null = useMemo(() => (topo ? countyPaths(countiesGeoJson(topo)) : null), [topo]);
  const { marks, labels } = useMemo(() => (places ? layoutCities(places, view) : { marks: [], labels: [] }), [places, view]);

  const near = useMemo(() => {
    if (!pin || !nodeIndex) return null;
    // Only nodes with prices in this run, so every row can be opened on the page.
    const inRun: NodeIndex = Object.fromEntries(Object.entries(nodeIndex).filter(([code, n]) => n.kind === 'hub' || map.zoneOf.has(code)));
    return nearestNodes(inRun, pin.lat, pin.lon, NEAR_K);
  }, [pin, nodeIndex, map.zoneOf]);

  const onPick = useCallback((hit: SearchHit) => {
    setPin({ lat: hit.lat, lon: hit.lon, label: hit.label, sub: hit.sub, county: hit.kind === 'county' ? hit.label.replace(/ County$/, '') : undefined });
    setView(hit.bounds ? viewForBounds(hit.bounds) : viewAround(hit.lat, hit.lon));
  }, []);
  const clear = useCallback(() => { setPin(null); setView(FULL_VIEW); }, []);

  // ---- drag to pan (only when zoomed in) and click to drop a pin
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const svgProps = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      if (picking || zoom <= 1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      const el = svg.current;
      if (!d || !el) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      if (!d.moved) { d.moved = true; el.setPointerCapture?.(e.pointerId); }
      const rect = el.getBoundingClientRect();
      setView(panBy(d.view, (-dx * d.view.w) / rect.width, (-dy * d.view.w) / rect.width));
    },
    onPointerUp: () => { if (drag.current?.moved) suppress.current = true; drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
    onClickCapture: (e: React.MouseEvent<SVGSVGElement>) => {
      if (suppress.current) { suppress.current = false; e.stopPropagation(); e.preventDefault(); }
    },
    onClick: (e: React.MouseEvent<SVGSVGElement>) => {
      if (!picking || !svg.current) return;
      const p = clientToLonLat(view, svg.current.getBoundingClientRect(), e.clientX, e.clientY);
      if (!p || !inTexas(p.lat, p.lon)) return;
      setPin({ lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), label: `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`, sub: 'Picked on the map' });
    },
  };

  const selectedPath = pin?.county && paths ? paths.byName.get(pin.county) : undefined;
  const op = countyOpacity(zoom);
  const k = dotScale(zoom);
  const under = (
    <g aria-hidden="true" className={classes.counties}>
      {paths && op > 0 && <path d={paths.all} className={classes.countyLine} style={{ opacity: op }} />}
      {selectedPath && <path d={selectedPath} className={classes.countyOn} />}
    </g>
  );
  const over = (
    <g aria-hidden="true" className={classes.cities}>
      {labels.map((l) => <text key={l.name} x={l.tx} y={l.ty} textAnchor={l.anchor} className={classes.cityLabel} style={{ fontSize: l.fontSize, strokeWidth: l.fontSize * 0.27 }}>{l.name}</text>)}
      {marks.map((m) => <rect key={m.name} x={m.x - m.size / 2} y={m.y - m.size / 2} width={m.size} height={m.size} className={classes.cityMark} style={{ strokeWidth: 1.2 / Math.sqrt(zoom) }} />)}
      {pin && (() => {
        const [x, y] = project(pin.lon, pin.lat);
        return (
          <g transform={`translate(${x} ${y}) scale(${k})`} className={classes.pin} data-testid="pin">
            <path d="M0 0C-4.5-7-7.5-10.5-7.5-15a7.5 7.5 0 1 1 15 0C7.5-10.5 4.5-7 0 0Z" />
            <circle cx="0" cy="-15" r="2.6" />
          </g>
        );
      })()}
    </g>
  );

  const atMin = zoom <= 1.001;
  const atMax = zoom >= 7.99;
  return (
    <div className={classes.wrap}>
      <div className={classes.tools}>
        <SiteSearch index={searchIndex} onPick={onPick} onClear={clear} />
        <button type="button" className={classes.pick} aria-pressed={picking} onClick={() => setPicking((v) => !v)}>Pick a site</button>
      </div>
      <p className={classes.pickNote} role="status">{picking ? 'Click the map to drop a pin. Node clicks are paused while this is on.' : ''}</p>
      <div className={classes.stage}>
        <AtlasMap
          {...map}
          v4={{ viewBox: viewBox(view), zoom, dotScale: k, landStroke: landStroke(zoom), under, over, picking, svgProps, svgRef: svg }}
        />
        <div className={classes.zoomBar} role="group" aria-label="Map zoom">
          <button type="button" className={classes.zoomBtn} aria-label="Zoom in" disabled={atMax} onClick={() => setView((v) => zoomBy(v, 1.6))}>+</button>
          <button type="button" className={classes.zoomBtn} aria-label="Zoom out" disabled={atMin} onClick={() => setView((v) => zoomBy(v, 1 / 1.6))}>−</button>
          <button type="button" className={classes.zoomReset} disabled={atMin} onClick={() => setView(FULL_VIEW)}>Reset</button>
        </div>
      </div>
      <p className={classes.mapNote}>Squares are the largest Texas cities. Faint lines are county borders; zoom in to see them.</p>
      {children}
      {pin && <SitePanel pin={pin} near={near} onSelect={map.onSelect} onClear={clear} />}
    </div>
  );
}

type Near = ReturnType<typeof nearestNodes>;

/** Nearest nodes to the pinned site. The Site Value card (Step 5) takes this slot. */
function SitePanel({ pin, near, onSelect, onClear }: { pin: Pin; near: Near | null; onSelect: (code: string) => void; onClear: () => void }) {
  return (
    <section className={classes.panel} aria-labelledby="site-title" data-testid="site-panel">
      <div className={classes.panelHead}>
        <div>
          <p className={classes.panelEyebrow}>Pinned site</p>
          <h3 id="site-title" className={classes.panelTitle}>{pin.label}</h3>
          <p className={classes.panelSub}>{pin.sub} · {pin.lat.toFixed(3)}, {pin.lon.toFixed(3)}</p>
        </div>
        <button type="button" className={classes.clear} onClick={onClear}>Clear site</button>
      </div>
      {!near ? <p className={classes.panelSub}>Finding nearby nodes…</p> : (
        <>
          <h4 className={classes.listTitle}>Nearest nodes</h4>
          <ol className={classes.nearList} data-testid="near-list">
            {near.nodes.map((n, i) => (
              <li key={n.code}>
                <button type="button" className={classes.nearBtn} onClick={() => onSelect(n.code)}>
                  <span className={classes.nearNum}>{i + 1}</span>
                  <span className={classes.nearName}>
                    <span className={classes.mono}>{n.code}</span>
                    <span className={classes.nearSub}>{n.county ? `${n.county} County` : 'County unknown'}{n.precision === 'county' ? ' · county-level location' : ''}</span>
                  </span>
                  <span className={classes.nearKm}>{fmtKm(n.km)} km</span>
                </button>
              </li>
            ))}
          </ol>
          {near.nodes.length === 0 && <p className={classes.panelSub}>No placed node with prices in this run.</p>}
          {near.nearestHub && (
            <p className={classes.panelSub} data-testid="near-hub">
              Nearest hub marker: <span className={classes.mono}>{near.nearestHub.code}</span>, {fmtKm(near.nearestHub.km)} km.
              {near.zoneHub && near.zoneHub !== near.nearestHub.code && <> Load-zone hub of the nearest node: <span className={classes.mono}>{near.zoneHub}</span>.</>}
            </p>
          )}
          <p className={classes.caveat}>
            Straight-line distance, not an interconnection point. Hub markers sit at a representative city. A county-level location is the centre of the county, about 10 to 50 km from the site.
          </p>
        </>
      )}
      <p className={classes.srOnly} role="status">{near?.nodes[0] ? `${pin.label} pinned. Nearest node ${near.nodes[0].code}, ${fmtKm(near.nodes[0].km)} kilometres.` : ''}</p>
    </section>
  );
}
