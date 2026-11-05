// City label placement. Biggest city first; a label is kept only if it does not touch a label already kept or any
// city marker. Fewer labels at low zoom. Sizes are in viewBox units and shrink with zoom so the text stays one size on screen.
import { project } from '../../data/home';
import type { Place } from '../geo/types';
import { viewHeight, type View, zoomOf } from './view';

export const LABEL_PX = 11; // font size in viewBox units at zoom 1
export const MARKER = 4.4; // city marker side at zoom 1
const CHAR_W = 0.6; // average glyph width as a share of the font size (slight over-estimate on purpose)

/** How many labels a zoom level may show. Markers are always drawn; this only limits text. */
export const maxLabels = (zoom: number) => (zoom < 1.5 ? 8 : zoom < 2.5 ? 12 : 20);

export interface CityMark { name: string; x: number; y: number; size: number }
export interface CityLabel extends CityMark { tx: number; ty: number; anchor: 'start' | 'end'; fontSize: number; w: number; h: number }
interface Rect { x0: number; y0: number; x1: number; y1: number }
const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Places inside the view, as markers, plus the labels that fit. */
export function layoutCities(places: Place[], view: View): { marks: CityMark[]; labels: CityLabel[] } {
  const zoom = zoomOf(view);
  const fs = LABEL_PX / zoom;
  const size = MARKER / Math.sqrt(zoom);
  const h = viewHeight(view.w);
  const pad = size;
  const inView = ({ x, y }: { x: number; y: number }) => x >= view.x - pad && x <= view.x + view.w + pad && y >= view.y - pad && y <= view.y + h + pad;
  const marks = [...places]
    .sort((a, b) => b.pop - a.pop || (a.name < b.name ? -1 : 1))
    .map((p) => { const [x, y] = project(p.lon, p.lat); return { name: p.name, x, y, size }; })
    .filter(inView);
  const taken: Rect[] = marks.map((m) => ({ x0: m.x - size / 2, y0: m.y - size / 2, x1: m.x + size / 2, y1: m.y + size / 2 }));
  const labels: CityLabel[] = [];
  const gap = size / 2 + fs * 0.25;
  for (const m of marks) {
    if (labels.length >= maxLabels(zoom)) break;
    const w = m.name.length * fs * CHAR_W;
    for (const anchor of ['start', 'end'] as const) {
      const x0 = anchor === 'start' ? m.x + gap : m.x - gap - w;
      const r: Rect = { x0, y0: m.y - fs * 0.6, x1: x0 + w, y1: m.y + fs * 0.4 };
      const inside = r.x0 >= view.x && r.x1 <= view.x + view.w && r.y0 >= view.y && r.y1 <= view.y + h;
      if (inside && !taken.some((t) => hit(t, r))) {
        taken.push(r);
        labels.push({ ...m, tx: anchor === 'start' ? m.x + gap : m.x - gap, ty: m.y + fs * 0.32, anchor, fontSize: fs, w, h: fs });
        break;
      }
    }
  }
  return { marks, labels };
}

/** The rectangle a label covers, for tests. */
export const labelRect = (l: CityLabel): Rect => {
  const x0 = l.anchor === 'start' ? l.tx : l.tx - l.w;
  return { x0, y0: l.ty - l.fontSize * 0.92, x1: x0 + l.w, y1: l.ty + l.fontSize * 0.08 };
};
