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
}

export interface Run {
  meta: RunMeta;
  metrics: RunMetrics;
  daily: { date: string[]; revenue: number[]; cycles: number[] };
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
