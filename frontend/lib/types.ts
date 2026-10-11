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
  reward_cut: number;
  quadrant_counts: Partial<Record<Quadrant, number>>;
  exclusions: Record<string, number>;
  societies: Society[];
  top_leads: Lead[];
}
