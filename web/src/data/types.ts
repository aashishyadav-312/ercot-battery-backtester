export interface IndexRun {
  location: string;
  location_type: 'hub' | 'node';
  year: number;
  duration_h: number;
  rte: number;
  deg_cost_per_mwh: number;
  file: string;
  first_day: string;
  last_day: string;
  revenue_per_kw_year: number;
  annualized: boolean;
  days_covered: number;
  top10_day_share: number | null;
  cycles_per_year: number;
  avg_spread_captured: number;
  /** DA-schedule / RT-settle (Phase 8). Same days as perfect foresight. */
  da_rt_revenue_per_kw_year?: number;
  value_of_perfect_foresight_per_kw_year?: number;
  capture_rate?: number | null;
}

export interface RunMeta {
  location: string;
  year: number;
  market: string;
  power_mw: number;
  duration_h: number;
  energy_mwh: number;
  rte: number;
  deg_cost_per_mwh: number;
  method: string;
  price_series: string;
  efficiency_split: string;
  soc_start_end_frac: number;
  degradation: string;
  excludes: string[];
  first_day: string;
  last_day: string;
  days_solved: number;
  skipped_days: string[];
}

export interface RunMetrics {
  revenue_per_kw_year: number;
  revenue_per_kw_period: number;
  annualized: boolean;
  days_covered: number;
  total_revenue: number;
  top10_day_share: number | null;
  top10_days: string[];
  cycles_per_year: number;
  avg_charge_price: number;
  avg_discharge_price: number;
  avg_spread_captured: number;
  monthly_revenue_per_kw: Record<string, number>;
  heatmap_net_mw: { months: number[]; hours: number[]; values: number[][] };
  da_rt_revenue_per_kw_year?: number;
  da_rt_revenue_per_kw_period?: number;
  da_da_revenue_per_kw_year?: number;
  pf_revenue_per_kw_year_matched?: number;
  value_of_perfect_foresight_per_kw_year?: number;
  capture_rate?: number | null;
  da_days_matched?: number;
  da_losing_days?: number;
  da_cycles_per_year?: number;
}

export interface Run {
  meta: RunMeta;
  metrics: RunMetrics;
  daily: { date: string[]; revenue: number[]; cycles: number[]; da_rt_revenue?: (number | null)[] };
}

export interface NodeInfo {
  location: string;
  group: 'high' | 'typical';
  load_zone: string;
  substation: string;
  nearest_hub: string;
  best_corr_hub: string;
  best_hub_corr: number;
  std: number;
  rank: number;
}

export interface NodeSelection {
  sample_month: string;
  n_nodes_ranked: number;
  median_std: number;
  hub_std: Record<string, number>;
  nodes: NodeInfo[];
}

export interface Selection {
  location: string;
  duration: number;
  year: number;
  deg: number;
}

export interface RtcbWindowRevenue {
  pf_revenue_per_kw: number;
  da_rt_revenue_per_kw: number;
  value_of_perfect_foresight_per_kw: number;
  capture_rate: number | null;
  da_losing_days: number;
}

export interface RtcbRun {
  duration_h: number;
  deg_cost_per_mwh: number;
  days: number;
  before: RtcbWindowRevenue;
  after: RtcbWindowRevenue;
  change: { pf_revenue: number | null; da_rt_revenue: number | null; capture_rate_pts: number };
  monthly: { months: number[]; pf_before: number[]; pf_after: number[]; da_rt_before: number[]; da_rt_after: number[] };
}

export interface RtcbPrices {
  rt_mean: number;
  da_mean: number;
  rt_minus_da_mean: number;
  rt_minus_da_mean_abs: number;
  rt_std: number;
  rt_intraday_std_mean: number;
  rt_intraday_std_median: number;
  rt_intervals_over_1000: number;
  rt_intervals_below_0: number;
}

export interface Rtcb {
  meta: { event: string; before: { start: string; end: string }; after: { start: string; end: string }; caveat: string };
  locations: Record<string, { location_type: 'hub' | 'node'; matched_days: number; prices: { before: RtcbPrices; after: RtcbPrices }; runs: RtcbRun[] }>;
}

/** One featured day for the "Start here" walkthrough (results/walkthrough.json, built by scripts/build_walkthrough.py). */
export interface WalkDay {
  date: string;
  kind: 'top' | 'typical' | 'quiet' | 'negative';
  label: string;
  /** Net revenue for the day in dollars (after degradation cost). */
  revenue: number;
  /** Real-time price, $/MWh, one value per 15-minute interval (96). */
  price: number[];
  /** Battery output in MW per interval: positive = discharging (selling), negative = charging (buying). */
  net_mw: number[];
  /** State of charge in MWh at the end of each interval. */
  soc_mwh: number[];
  /** Day-ahead hourly price, $/MWh (24 values), where available. */
  da_price?: number[];
}

export interface Walkthrough {
  meta: {
    location: string;
    year: number;
    power_mw: number;
    duration_h: number;
    energy_mwh: number;
    rte: number;
    deg_cost_per_mwh: number;
    interval_minutes: number;
    year_revenue_per_kw: number;
  };
  days: WalkDay[];
}

/** One settlement point on the Map page (results/locations.json, built by scripts/build_locations.py). */
export interface LocationRec {
  code: string;
  name: string;
  region: string | null;
  type: 'hub' | 'node';
  load_zone: string;
  substation: string | null;
  nearest_hub: string | null;
  /** False when no coordinates could be found; lat/lon are then null and the node is not drawn. */
  geocoded: boolean;
  lat: number | null;
  lon: number | null;
  /** "representative_city" for hubs, otherwise the data source the coordinates were copied from. */
  coordinate_source: string | null;
  marker_city?: string;
  match: {
    method: string | null;
    confidence: 'high' | 'medium' | 'reviewed' | null;
    plants?: { eia_plant_code: number; eia_plant_name: string; county: string }[];
    evidence: string;
  };
}

export interface LocationsFile {
  meta: { hub_footnote: string; coordinate_policy: string; ercot_doc: string; ercot_publish_date: string | null; eia_year: number; n_nodes: number; n_nodes_geocoded: number };
  locations: LocationRec[];
}

type Ring = [number, number][];
interface GeoFeature { type: 'Feature'; properties: { name: string }; geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] } }
/** Texas outline and counties cut from us-atlas by scripts/build-texas.mjs. */
export interface TexasGeo {
  source: string;
  state: GeoFeature;
  counties: { type: 'FeatureCollection'; features: GeoFeature[] };
}

/** One resource node in the all-node run (Phase 12, results/nodes_{year}_{hours}h.json). Summary metrics only. */
export interface NodeRec {
  code: string;
  rank: number;
  /** Settlement load zone and its trading hub; null when the node is no longer in ERCOT's settlement point list. */
  lz: string | null;
  hub: string | null;
  sub: string | null;
  /** Null when no EIA-860 plant could be matched (never guessed). */
  lat: number | null;
  lon: number | null;
  geo: string | null;
  /** Perfect-foresight and DA-scheduled (RT-settled) revenue, $/kW-yr. */
  rev: number;
  da_rev: number;
  capture: number | null;
  top10: number | null;
  cycles: number;
  spread: number;
  corr_hub: number | null;
  mean_price: number;
  /** Revenue by month, $/kW (Jan..Dec). */
  monthly: number[];
  monthly_da: number[];
}

export type HubRec = Omit<NodeRec, 'rank' | 'lz' | 'hub' | 'sub' | 'lat' | 'lon' | 'geo' | 'corr_hub'> & { corr_hub: null };

export interface NodesFile {
  meta: {
    year: number; duration_h: number; rte: number; deg_cost_per_mwh: number; power_mw: number;
    n_nodes_in_data: number; n_nodes: number; n_nodes_geocoded: number;
    excluded_counts: Record<string, number>;
    quantiles_rev: Record<string, number>;
    runtime_s: { load_prices: number; solve: number; total: number };
    price_source: string; complete_rule: string;
  };
  hubs: HubRec[];
  nodes: NodeRec[];
}
