// Pure map helpers for the V4 Atlas: zoom and pan on the existing spec projection (src/data/home.ts), county outline
// paths, and turning a click back into a latitude and longitude. No React, so the tests can drive all of it.
import type { FeatureCollection, Geometry } from 'geojson';
import { VIEW_H, VIEW_W, project } from '../../data/home';
import type { CountyProps } from '../geo/types';

/** [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number];

/** The visible part of the drawing: top-left corner and width, in viewBox units. Height follows the fixed aspect. */
export interface View { x: number; y: number; w: number }

export const FULL_VIEW: View = { x: 0, y: 0, w: VIEW_W };
export const MAX_ZOOM = 8;
/** Narrowest view a place search zooms to (about 4.6x). */
export const PLACE_W = 120;

export const viewHeight = (w: number) => (w * VIEW_H) / VIEW_W;
export const zoomOf = (v: View) => VIEW_W / v.w;
export const viewBox = (v: View) => `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${viewHeight(v.w).toFixed(2)}`;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keep the view inside the drawing and within the zoom limits. */
export function clampView(v: View): View {
  const w = clamp(v.w, VIEW_W / MAX_ZOOM, VIEW_W);
  return { w, x: clamp(v.x, 0, VIEW_W - w), y: clamp(v.y, 0, VIEW_H - viewHeight(w)) };
}

/** Inverse of project(). */
export function unproject(x: number, y: number): { lat: number; lon: number } {
  return { lon: (x - 14) / 40.99 - 106.6, lat: 36.5 - (y - 15) / 47.5 };
}

/** A view of width `w` centred on a point. */
export function viewAround(lat: number, lon: number, w = PLACE_W): View {
  const [x, y] = project(lon, lat);
  return clampView({ w, x: x - w / 2, y: y - viewHeight(w) / 2 });
}

/** A view that holds a county with room around it, never tighter than PLACE_W. */
export function viewForBounds([west, south, east, north]: Bounds): View {
  const [x0, y0] = project(west, north);
  const [x1, y1] = project(east, south);
  const w = Math.min(VIEW_W, Math.max(PLACE_W, (x1 - x0) * 2.2, ((y1 - y0) * 2.2 * VIEW_W) / VIEW_H));
  return clampView({ w, x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - viewHeight(w) / 2 });
}

/** Zoom by a factor (above 1 zooms in) about the middle of the view. */
export function zoomBy(v: View, factor: number): View {
  const w = clamp(v.w / factor, VIEW_W / MAX_ZOOM, VIEW_W);
  const cx = v.x + v.w / 2;
  const cy = v.y + viewHeight(v.w) / 2;
  return clampView({ w, x: cx - w / 2, y: cy - viewHeight(w) / 2 });
}

export const panBy = (v: View, dx: number, dy: number): View => clampView({ ...v, x: v.x + dx, y: v.y + dy });

/** A click inside the drawn svg box to a latitude and longitude. The svg keeps the viewBox aspect, so the mapping is linear. */
export function clientToLonLat(v: View, rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = v.x + ((clientX - rect.left) / rect.width) * v.w;
  const y = v.y + ((clientY - rect.top) / rect.height) * viewHeight(v.w);
  return unproject(x, y);
}

/** County opacity by zoom: none on the full view, fading in to full by `FULL_AT`. */
export const COUNTY_FROM = 1.3;
export const COUNTY_FULL_AT = 2.1;
export const countyOpacity = (zoom: number) => clamp((zoom - COUNTY_FROM) / (COUNTY_FULL_AT - COUNTY_FROM), 0, 1);

export interface CountyPaths { all: string; byName: Map<string, string> }

/** County outlines as SVG paths in the map projection. Points closer than `minStep` units are dropped to keep the path small. */
export function countyPaths(fc: FeatureCollection<Geometry, CountyProps>, minStep = 0.5): CountyPaths {
  const byName = new Map<string, string>();
  for (const f of fc.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const parts: string[] = [];
    for (const poly of polys) {
      for (const ring of poly) {
        const pts: [number, number][] = [];
        for (const [lon, lat] of ring) {
          const p = project(lon, lat);
          const last = pts.at(-1);
          if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) pts.push(p);
        }
        if (pts.length >= 3) parts.push(`M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`);
      }
    }
    byName.set(f.properties.name, parts.join(''));
  }
  return { all: [...byName.values()].join(''), byName };
}

/** Dot radius scale: dots shrink a little as the map zooms in, so they stay apart. 1 at the full view. */
export const dotScale = (zoom: number) => 1 / Math.sqrt(zoom);
/** Outline weight in viewBox units; the live site's 1.2 at the full view, thinner as the drawing grows. */
export const landStroke = (zoom: number) => (zoom > 1 ? 1.2 / zoom : undefined);
