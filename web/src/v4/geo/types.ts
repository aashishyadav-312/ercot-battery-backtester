// Shapes of the files in data/v4/geo/ (written by scripts/build-v4-geo.mjs).
export interface Place { name: string; kind: 'city'; county: string | null; pop: number; lat: number; lon: number }
export interface IndexedNode {
  lat: number; lon: number;
  county: string | null;
  nearestCity: string; cityKm: number;
  /** "node" or "hub". A hub is a price average, drawn at a representative city. */
  kind: 'node' | 'hub';
  /** plant: EIA-860 plant location. county: centre of the queue county (about 10 to 50 km off). hub: representative city. */
  precision: 'plant' | 'county' | 'hub';
  /** Trading hub of the node's load zone. */
  hub: string | null;
}
export type NodeIndex = Record<string, IndexedNode>;
export interface CountyProps { fips: string; name: string }
