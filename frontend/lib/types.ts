// Mirrors the response of POST /api/scenario in backend/app/scoring.py.

export type Quadrant = "Prime" | "Nurture" | "Easy win" | "Deprioritise" | "Ineligible";

export interface FarmSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface ScenarioParams {
  site_id: string;
  capacity_mw: number;
  gen_cost: number;
  use_distance: boolean;
  transfer_cost: number;
  markup_pct: number;
  max_distance_km: number;
  max_age_years: number;
  min_active_pct: number;
  top_n: number;
}

export interface Society {
  id: string;
  name: string;
  city: string;
  district: string;
  provider: string;
  lat: number;
  lon: number;
  num_flats: number;
  active_flats: number;
  consumption_kwh: number;
  tariff: number;
  age: number;
  prob: number;
  distance_km: number;
  offer: number;
  monthly_savings: number;
  savings_per_flat: number;
  eligible: boolean;
  reason: string;
  quadrant: Quadrant;
  selected: boolean;
  priority_score: number;
  rank: number;
}

export interface Lead {
  id: string;
  contributions: { feature: string; value: number }[];
  strength: string;
  weakness: string | null;
}

export interface ScenarioResult {
  farm: FarmSite;
  params: ScenarioParams;
  kpis: {
    selected_count: number;
    eligible_count: number;
    total_count: number;
    capacity_kwh: number;
    used_kwh: number;
    monthly_savings_rs: number;
    avg_conversion: number | null;
    flats_reached: number;
  };
  /** How the farm was filled: exact ILP knapsack, with the simple greedy fill for comparison. */
  allocation: {
    method: string;
    expected_value: number;
    greedy_expected_value: number;
    greedy_used_kwh: number;
    greedy_count: number;
  };
  reward_cut: number;
  quadrant_counts: Partial<Record<Quadrant, number>>;
  exclusions: Record<string, number>;
  societies: Society[];
  top_leads: Lead[];
}

// GET /api/model and POST /api/classify in backend/app/main.py.

export interface ModelCard {
  model: string;
  dataset: string;
  trained_at: string;
  fit_ms: number;
  train_rows: number;
  test_rows: number;
  pending_rows: number;
  test_metrics: { accuracy: number; precision: number; recall: number; auc: number; baseline_accuracy: number };
  features: string[];
  districts: string[];
  providers: string[];
}

export interface SocietyInput {
  name?: string;
  district: string;
  current_provider: string;
  num_flats: number;
  avg_monthly_consumption_kwh: number;
  current_tariff_rs_per_unit: number;
  estimated_solar_tariff_rs_per_unit: number;
  distance_to_solar_farm_km: number;
  building_age_years: number;
}

export interface Reason {
  feature: string;
  effect: "up" | "down";
  weight: number;
  text: string;
}

export interface ClassifyResult {
  name?: string | null;
  reasons: Reason[];
  prob: number;
  predicted: "Converted" | "Rejected";
  estimated_monthly_savings_rs: number;
  latency_ms: number;
  contributions: { feature: string; value: number }[];
}

// GET /api/dataset in backend/app/main.py: raw dataset rows plus each row's role in the demo.

export type DatasetRow = Record<string, string | number> & { role: "Train" | "Held-out" | "Pending" };

export interface DatasetPage {
  total: number;
  matching: number;
  page: number;
  page_size: number;
  columns: string[];
  counts: { outcome: Record<string, number>; role: Record<string, number> };
  rows: DatasetRow[];
}

// POST /api/groups: nearby societies to pitch together, each group sized to fill the farm.

export interface GroupMember {
  id: string;
  name: string;
  city: string;
  num_flats: number;
  prob: number;
  monthly_savings: number;
  distance_km: number;
}

export interface PitchGroup {
  rank: number;
  area: string;
  size: number;
  flats: number;
  demand_kwh: number;
  fill: number;
  avg_prob: number;
  expected_signups: number;
  chance_any: number;
  monthly_savings: number;
  expected_value: number;
  distance_km: number;
  /** Monte Carlo: the group pitched `runs` times, each society signing with its own probability. */
  simulation: {
    runs: number;
    signups_low: number;
    signups_high: number;
    /** Share of runs with 0, 1, 2 … sign-ups. */
    distribution: number[];
    fill_low: number;
    fill_high: number;
    chance_half_full: number;
    chance_none: number;
  };
  risk: "Low risk" | "Medium risk" | "High risk";
  reward: "High reward" | "Steady reward";
  why: string[];
  members: GroupMember[];
}

export interface GroupsResult {
  farm: FarmSite;
  capacity_kwh: number;
  groups: PitchGroup[];
}
