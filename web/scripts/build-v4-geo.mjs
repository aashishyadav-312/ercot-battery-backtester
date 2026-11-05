// Builds the V4 geo data under results/v4/geo/ (copied to public/data/v4/geo/ by copy-data.mjs):
//   tx_counties.topo.json  Texas counties, simplified (Census cartographic boundary file, 1:500k)
//   county_index.json      per county: name, FIPS, a point inside it and its bounds (for search and zoom)
//   places.json            largest Texas cities plus regional anchors (Census population estimates + gazetteer)
//   node_index.json        per node: lat, lon, county, nearest place, distance in km
//   SOURCES.json           source URLs, vintages, counts and the list of nodes without coordinates
//
// Everything is derived from the Census files. No population or coordinate is typed in this script.
// Re-run:  node web/scripts/build-v4-geo.mjs            (uses cached downloads in data/raw/geo/)
//          node web/scripts/build-v4-geo.mjs --refresh  (download again)
// mapshaper is a build-time tool only. It is fetched with npx at a pinned version and is not a dependency of the site.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const RAW = join(root, 'data', 'raw', 'geo'); // data/raw/ is git-ignored
const OUT = join(root, 'results', 'v4', 'geo');
const refresh = process.argv.includes('--refresh');

const VINTAGE = { counties: 2025, population: 2025, gazetteer: 2025 };
const SRC = {
  counties: `https://www2.census.gov/geo/tiger/GENZ${VINTAGE.counties}/shp/cb_${VINTAGE.counties}_us_county_500k.zip`,
  population: `https://www2.census.gov/programs-surveys/popest/datasets/2020-${VINTAGE.population}/cities/totals/sub-est${VINTAGE.population}.csv`,
  gazetteer: `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${VINTAGE.gazetteer}_Gazetteer/${VINTAGE.gazetteer}_gaz_place_48.txt`,
};
const MAPSHAPER = 'mapshaper@0.7.101';
const SIMPLIFY = '12%';
const TOP_CITIES = 10;
const MAX_PLACES = 20;

// Regional anchors: the largest city not already chosen inside each box. Boxes are [south, north, west, east].
// Only the boxes are chosen here; which city wins comes from the Census population column.
const REGIONS = [
  { region: 'West Texas', box: [30.8, 32.8, -103.6, -101.0] },
  { region: 'Big Country', box: [31.0, 33.0, -101.0, -99.0] },
  { region: 'Panhandle', box: [34.0, 36.6, -103.1, -100.0] },
  { region: 'North Texas Red River', box: [33.4, 34.3, -99.5, -96.0] },
  { region: 'East Texas', box: [31.0, 33.6, -95.6, -94.0] },
  { region: 'Southeast coast', box: [29.4, 30.5, -94.7, -93.7] },
  { region: 'The Valley', box: [25.7, 26.8, -98.8, -97.0] },
  { region: 'Rio Grande border', box: [27.0, 28.8, -100.8, -99.0] },
];

async function download(url, file) {
  if (existsSync(file) && !refresh) return;
  mkdirSync(dirname(file), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log(`downloaded ${url}`);
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const out = [];
    let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

const rad = (d) => (d * Math.PI) / 180;
export function haversineKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(a));
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(lon, lat, rings) {
  if (!inRing(lon, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(lon, lat, rings[k])) return false;
  return true;
}
function countyAt(counties, lon, lat) {
  for (const f of counties) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (polys.some((p) => inPolygon(lon, lat, p))) return f.properties.name;
  }
  return null;
}


// Area-weighted centroid of the largest outer ring; if that falls outside the county, the nearest inside point on a fine grid.
function countyPoint(f) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const area = (r) => Math.abs(r.reduce((a, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + (x * y2 - x2 * y); }, 0)) / 2;
  const big = polys.reduce((b, p) => (area(p[0]) > area(b[0]) ? p : b));
  const ring = big[0];
  let a = 0, cx = 0, cy = 0;
  ring.forEach(([x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; const k = x * y2 - x2 * y; a += k; cx += (x + x2) * k; cy += (y + y2) * k; });
  let pt = [cx / (3 * a), cy / (3 * a)];
  if (!polys.some((p) => inPolygon(pt[0], pt[1], p))) {
    let best = null;
    const [w, s, e, n] = bounds(polys);
    for (let i = 1; i < 60; i++) for (let j = 1; j < 60; j++) {
      const x = w + ((e - w) * i) / 60, y = s + ((n - s) * j) / 60;
      if (!polys.some((p) => inPolygon(x, y, p))) continue;
      const d = (x - pt[0]) ** 2 + (y - pt[1]) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
    pt = [best.x, best.y];
  }
  return pt;
}
function bounds(polys) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}

const mapshaper = (...args) => execFileSync('npx', ['--yes', MAPSHAPER, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });

async function main() {
  mkdirSync(OUT, { recursive: true });
  const zip = join(RAW, `cb_${VINTAGE.counties}_us_county_500k.zip`);
  const popCsv = join(RAW, `sub-est${VINTAGE.population}.csv`);
  const gaz = join(RAW, `${VINTAGE.gazetteer}_gaz_place_48.txt`);
  await download(SRC.counties, zip);
  await download(SRC.population, popCsv);
  await download(SRC.gazetteer, gaz);

  // 1. Counties: Texas only, simplified TopoJSON, plus a full-resolution GeoJSON in the cache for point-in-polygon.
  const shpDir = join(RAW, 'counties');
  mkdirSync(shpDir, { recursive: true });
  execFileSync('unzip', ['-oq', zip, '-d', shpDir]);
  const shp = join(shpDir, `cb_${VINTAGE.counties}_us_county_500k.shp`);
  const common = [shp, '-filter', "STATEFP=='48'", '-each', 'fips=GEOID, name=NAME', '-filter-fields', 'fips,name'];
  mapshaper(...common, '-o', join(RAW, 'tx_full.geojson'), 'format=geojson', 'precision=0.00001', 'force');
  mapshaper(...common, '-simplify', SIMPLIFY, 'keep-shapes', '-o', join(OUT, 'tx_counties.topo.json'), 'format=topojson', 'precision=0.0001', 'force');
  const counties = JSON.parse(readFileSync(join(RAW, 'tx_full.geojson'), 'utf8')).features;

  const countyIndex = counties.map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const [lon, lat] = countyPoint(f);
    return { name: f.properties.name, fips: f.properties.fips, lat: +lat.toFixed(4), lon: +lon.toFixed(4), bounds: bounds(polys).map((v) => +v.toFixed(3)) };
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
  writeFileSync(join(OUT, 'county_index.json'), JSON.stringify(countyIndex) + '\n');

  // 2. Places: Texas incorporated places (SUMLEV 162), latest estimate, internal point from the gazetteer.
  const popRows = parseCsv(readFileSync(popCsv, 'utf8'));
  const head = popRows[0];
  const col = (n) => head.indexOf(n);
  const popCol = `POPESTIMATE${VINTAGE.population}`;
  const pops = new Map();
  for (const r of popRows.slice(1)) {
    if (r[col('SUMLEV')] !== '162' || r[col('STATE')] !== '48') continue;
    pops.set(`48${r[col('PLACE')]}`, Number(r[col(popCol)]));
  }
  const gazLines = readFileSync(gaz, 'utf8').split(/\r?\n/).filter(Boolean);
  const gh = gazLines[0].split('|').map((s) => s.trim());
  const gi = (n) => gh.indexOf(n);
  const all = [];
  for (const line of gazLines.slice(1)) {
    const c = line.split('|').map((s) => s.trim());
    const pop = pops.get(c[gi('GEOID')]);
    if (!pop) continue;
    const lat = Number(c[gi('INTPTLAT')]), lon = Number(c[gi('INTPTLONG')]);
    all.push({ name: c[gi('NAME')].replace(/ (city|town|village)$/, ''), pop, lat, lon });
  }
  all.sort((a, b) => b.pop - a.pop);
  const chosen = all.slice(0, TOP_CITIES).map((p) => ({ ...p, why: 'largest' }));
  for (const { region, box } of REGIONS) {
    if (chosen.length >= MAX_PLACES) break;
    const [s, n, w, e] = box;
    const pick = all.find((p) => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e && !chosen.includes(p) && !chosen.some((c) => c.name === p.name));
    if (pick) chosen.push({ ...pick, why: region });
    else console.warn(`no city found for region ${region}`);
  }
  const places = chosen
    .map((p) => ({ name: p.name, kind: 'city', county: countyAt(counties, p.lon, p.lat), pop: p.pop, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) }))
    .sort((a, b) => b.pop - a.pop);
  const whyByName = Object.fromEntries(chosen.map((p) => [p.name, p.why]));
  writeFileSync(join(OUT, 'places.json'), JSON.stringify(places) + '\n');

  // 3. Node index: every settlement point with coordinates in the repo (resource nodes + the five hubs).
  const nodeLoc = JSON.parse(readFileSync(join(root, 'results', 'node_locations.json'), 'utf8'));
  const hubLoc = JSON.parse(readFileSync(join(root, 'results', 'locations.json'), 'utf8'));
  const ZONE_HUB = { // mirrors scripts/rank_nodes.py ZONE_HUB
    LZ_HOUSTON: 'HB_HOUSTON', LZ_NORTH: 'HB_NORTH', LZ_SOUTH: 'HB_SOUTH', LZ_WEST: 'HB_WEST',
    LZ_AEN: 'HB_SOUTH', LZ_CPS: 'HB_SOUTH', LZ_LCRA: 'HB_SOUTH', LZ_RAYBN: 'HB_NORTH',
  };
  const nearestCity = (lat, lon) => {
    let best = null;
    for (const p of places) {
      const km = haversineKm(lat, lon, p.lat, p.lon);
      if (!best || km < best.km) best = { name: p.name, km };
    }
    return best;
  };
  const index = {};
  const missing = [];
  const countyMismatch = [];
  const add = (code, lat, lon, extra) => {
    const county = countyAt(counties, lon, lat);
    const c = nearestCity(lat, lon);
    index[code] = { lat, lon, county, nearestCity: c.name, cityKm: +c.km.toFixed(1), ...extra };
    return county;
  };
  for (const h of hubLoc.locations.filter((l) => l.type === 'hub')) {
    add(h.code, h.lat, h.lon, { kind: 'hub', precision: 'hub', hub: h.code });
  }
  for (const n of nodeLoc.nodes) {
    if (n.lat == null || n.lon == null) { missing.push(n.code); continue; }
    const county = add(n.code, n.lat, n.lon, { kind: 'node', precision: n.precision, hub: ZONE_HUB[n.load_zone] ?? null });
    if (n.precision === 'county' && n.county && county && n.county.toLowerCase() !== county.toLowerCase()) countyMismatch.push({ code: n.code, stated: n.county, found: county });
  }
  const sortedIndex = Object.fromEntries(Object.entries(index).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(join(OUT, 'node_index.json'), JSON.stringify(sortedIndex) + '\n');

  const outside = Object.entries(index).filter(([, v]) => !v.county).map(([k]) => k);
  const meta = {
    generated_by: 'web/scripts/build-v4-geo.mjs',
    counties: { source: SRC.counties, vintage: VINTAGE.counties, simplify: SIMPLIFY, tool: MAPSHAPER, n: counties.length },
    places: {
      population_source: SRC.population,
      coordinate_source: SRC.gazetteer,
      population_column: popCol,
      selection: `the ${TOP_CITIES} largest incorporated places, then the largest not-yet-chosen place in each regional box (max ${MAX_PLACES})`,
      regions: REGIONS,
      why: whyByName,
    },
    nodes: {
      sources: ['results/node_locations.json', 'results/locations.json'],
      n_indexed: Object.keys(sortedIndex).length,
      n_without_coordinates: missing.length,
      precision_note: 'precision "plant" = EIA-860 plant location; "county" = centre of the interconnection-queue county (about 10 to 50 km off); "hub" = representative city, a hub is a price average and not a place',
      without_coordinates: missing.sort(),
      outside_texas_polygons: outside,
      county_mismatch: countyMismatch,
    },
  };
  writeFileSync(join(OUT, 'SOURCES.json'), JSON.stringify(meta, null, 1) + '\n');
  console.log(`counties ${counties.length}, places ${places.length}, nodes indexed ${Object.keys(sortedIndex).length}, without coordinates ${missing.length}, outside polygons ${outside.length}, county mismatches ${countyMismatch.length}`);
  console.log(places.map((p) => `${p.name} (${p.county}, ${p.pop}) ${whyByName[p.name]}`).join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
