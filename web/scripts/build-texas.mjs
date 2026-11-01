// Cuts Texas (state outline + 254 counties) out of the us-atlas TopoJSON (public-domain US Census
// cartographic boundaries) and writes public/data/texas.json for the Map page.
// topojson-client only decodes the file; the map itself is drawn by ECharts' geo component.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const here = dirname(fileURLToPath(import.meta.url));
const topo = JSON.parse(readFileSync(join(here, '..', 'node_modules', 'us-atlas', 'counties-10m.json'), 'utf8'));

// Round to 3 decimals (about 100 m) so the file stays small.
const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e3) / 1e3, Math.round(c[1] * 1e3) / 1e3] : c.map(round));
const slim = (f) => ({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } });

const counties = feature(topo, topo.objects.counties).features.filter((f) => String(f.id).startsWith('48')).map(slim);
const state = slim(feature(topo, topo.objects.states).features.find((f) => f.id === '48'));
if (counties.length !== 254) throw new Error(`expected 254 Texas counties, got ${counties.length}`);

const dst = join(here, '..', 'public', 'data');
mkdirSync(dst, { recursive: true });
const out = JSON.stringify({ source: 'us-atlas 3 (US Census cartographic boundaries, public domain)', state, counties: { type: 'FeatureCollection', features: counties } });
writeFileSync(join(dst, 'texas.json'), out);
console.log(`wrote public/data/texas.json (${counties.length} counties, ${(out.length / 1024).toFixed(0)} KB)`);
