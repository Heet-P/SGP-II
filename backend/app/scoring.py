"""Scenario scoring: eligibility, quadrants and capacity allocation."""

from functools import lru_cache

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field
from scipy.optimize import Bounds, LinearConstraint, milp

from .dataset import explain, load_societies
from .model import predict, with_offer

FARM_SITES = [
    {"id": "pune", "name": "Pune (reference site)", "lat": 18.5204, "lon": 73.8567},
    {"id": "nashik", "name": "Nashik", "lat": 20.0110, "lon": 73.7900},
    {"id": "aurangabad", "name": "Aurangabad", "lat": 19.8762, "lon": 75.3433},
    {"id": "nagpur", "name": "Nagpur", "lat": 21.1458, "lon": 79.0882},
    {"id": "thane", "name": "Thane / MMR", "lat": 19.2183, "lon": 72.9781},
]
_SITES_BY_ID = {s["id"]: s for s in FARM_SITES}

# Average capacity utilisation factor for rooftop/ground solar in Maharashtra.
CUF = 0.19


class ScenarioParams(BaseModel):
    site_id: str = "pune"
    capacity_mw: float = Field(5.0, gt=0, le=100)
    gen_cost: float = Field(3.5, ge=0)
    use_distance: bool = True
    transfer_cost: float = Field(0.03, ge=0)
    markup_pct: float = Field(25, ge=0)
    max_distance_km: float = Field(200, gt=0)
    max_age_years: int = Field(35, ge=0)
    min_active_pct: float = Field(50, ge=0, le=100)
    top_n: int = Field(20, ge=1, le=100)


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(a))


def _base() -> pd.DataFrame:
    return load_societies()


def knapsack(values, weights, capacity: float, must: int | None = None) -> np.ndarray | None:
    """0/1 knapsack by integer linear programming (HiGHS via scipy).

    Maximise sum(values · x) subject to sum(weights · x) <= capacity, x in {0, 1}.
    `must` forces one item into the solution. Returns a boolean mask, or None if nothing fits.
    """
    values, weights = np.asarray(values, float), np.asarray(weights, float)
    if len(values) == 0:
        return None
    lower = np.zeros(len(values))
    if must is not None:
        lower[must] = 1
    res = milp(-values, constraints=LinearConstraint(weights[None, :], 0, capacity),
               integrality=np.ones(len(values)), bounds=Bounds(lower, 1), options={"time_limit": 5})
    return None if res.x is None else res.x > 0.5


def run_scenario(p: ScenarioParams) -> dict:
    site = _SITES_BY_ID[p.site_id]
    df = _base().copy()
    df["distance_km"] = haversine_km(df["latitude"], df["longitude"], site["lat"], site["lon"]).round(1)

    transmission = (p.transfer_cost if p.use_distance else 0.0) * df["distance_km"]
    df["solar_offer_rs_per_unit"] = ((p.gen_cost + transmission) * (1 + p.markup_pct / 100)).round(2)
    df["active_ratio"] = df["active_flats"] / df["num_flats"]
    df["monthly_savings_rs"] = ((df["current_tariff_rs_per_unit"] - df["solar_offer_rs_per_unit"])
                                * df["avg_monthly_consumption_kwh"]).round(0)
    df["savings_per_flat_rs"] = (df["monthly_savings_rs"] / df["active_flats"]).round(0)

    # Re-score with this scenario's distance and price, not the dataset's fixed ones.
    df = with_offer(df, df["distance_km"], df["solar_offer_rs_per_unit"])
    df["conversion_probability"] = predict(df).round(3)

    df["ineligible_reason"] = np.select(
        [df["distance_km"] > p.max_distance_km,
         df["building_age_years"] > p.max_age_years,
         df["active_ratio"] * 100 < p.min_active_pct,
         df["monthly_savings_rs"] <= 0],
        ["Too far from farm", "Building too old", "Too few active flats", "No savings at this price"],
        default="",
    )
    df["eligible"] = df["ineligible_reason"] == ""

    elig = df[df["eligible"]]
    reward_cut = float(elig["monthly_savings_rs"].median()) if len(elig) else 0.0
    high_reward = df["monthly_savings_rs"] >= reward_cut
    low_risk = df["conversion_probability"] >= 0.5
    df["quadrant"] = np.select(
        [low_risk & high_reward, ~low_risk & high_reward, low_risk & ~high_reward],
        ["Prime", "Nurture", "Easy win"], default="Deprioritise")
    df.loc[~df["eligible"], "quadrant"] = "Ineligible"

    # Expected value of pitching = P(convert) × monthly savings. Choose the set of
    # societies with the highest total expected value that fits the farm's monthly
    # output (0/1 knapsack, solved exactly by ILP). The greedy fill, highest expected
    # value first until the next one does not fit, is kept for comparison.
    df["priority_score"] = (df["conversion_probability"] * df["monthly_savings_rs"]).where(df["eligible"], 0)
    monthly_capacity_kwh = p.capacity_mw * 1000 * 24 * 30 * CUF
    ranked = df[df["eligible"]].sort_values("priority_score", ascending=False)
    greedy = ranked["avg_monthly_consumption_kwh"].cumsum() <= monthly_capacity_kwh
    chosen = knapsack(ranked["priority_score"], ranked["avg_monthly_consumption_kwh"], monthly_capacity_kwh)
    df["selected"] = False
    df.loc[ranked.index[greedy if chosen is None else chosen], "selected"] = True
    df["rank"] = df["priority_score"].rank(ascending=False, method="first").astype(int)

    sel = df[df["selected"]]
    used_kwh = float(sel["avg_monthly_consumption_kwh"].sum())
    allocation = {
        "method": "ILP (0/1 knapsack)" if chosen is not None else "Greedy",
        "expected_value": float(sel["priority_score"].sum()),
        "greedy_expected_value": float(ranked.loc[greedy, "priority_score"].sum()),
        "greedy_used_kwh": float(ranked.loc[greedy, "avg_monthly_consumption_kwh"].sum()),
        "greedy_count": int(greedy.sum()),
    }

    top = sel.sort_values("priority_score", ascending=False).head(p.top_n)
    leads = []
    for _, row in top.iterrows():
        contrib = explain(row)
        leads.append({
            "id": row["society_id"],
            "contributions": [{"feature": k, "value": round(v, 3)} for k, v in contrib.items()],
            "strength": contrib.idxmax(),
            "weakness": contrib.idxmin() if contrib.min() < 0 else None,
        })

    return {
        "farm": site,
        "params": p.model_dump(),
        "kpis": {
            "selected_count": int(len(sel)),
            "eligible_count": int(df["eligible"].sum()),
            "total_count": int(len(df)),
            "capacity_kwh": monthly_capacity_kwh,
            "used_kwh": used_kwh,
            "monthly_savings_rs": float(sel["monthly_savings_rs"].sum()),
            "avg_conversion": float(sel["conversion_probability"].mean()) if len(sel) else None,
            "flats_reached": int(sel["active_flats"].sum()),
        },
        "allocation": allocation,
        "reward_cut": reward_cut,
        "quadrant_counts": df["quadrant"].value_counts().to_dict(),
        "exclusions": df.loc[~df["eligible"], "ineligible_reason"].value_counts().to_dict(),
        "societies": _societies_payload(df),
        "top_leads": leads,
    }


def _societies_payload(df: pd.DataFrame) -> list[dict]:
    out = df.rename(columns={
        "society_id": "id",
        "society_name": "name",
        "current_provider": "provider",
        "latitude": "lat",
        "longitude": "lon",
        "avg_monthly_consumption_kwh": "consumption_kwh",
        "current_tariff_rs_per_unit": "tariff",
        "building_age_years": "age",
        "conversion_probability": "prob",
        "solar_offer_rs_per_unit": "offer",
        "monthly_savings_rs": "monthly_savings",
        "savings_per_flat_rs": "savings_per_flat",
        "ineligible_reason": "reason",
    })[["id", "name", "city", "district", "provider", "lat", "lon", "num_flats", "active_flats",
        "consumption_kwh", "tariff", "age", "prob", "distance_km", "offer", "monthly_savings",
        "savings_per_flat", "eligible", "reason", "quadrant", "selected", "priority_score", "rank"]]
    return out.to_dict(orient="records")


# ------------------------------------------------------------------ pitch groups

GROUP_RADIUS_KM = 15
# Each group is chosen from the seed's best neighbours only; this keeps every ILP small
# and changes the groups' expected value by under 1% against using all neighbours.
GROUP_CANDIDATES = 40
SIMULATION_RUNS = 10_000


def run_groups(p: ScenarioParams, max_groups: int = 6) -> dict:
    # Building groups solves dozens of small ILPs (about 1–2 s), so results are cached per scenario.
    return _groups(p.model_dump_json(), max_groups)


@lru_cache(maxsize=64)
def _groups(params_json: str, max_groups: int) -> dict:
    """Groups of nearby eligible societies to pitch together, each sized to fill the farm.

    Take the best unassigned society as a seed. Among the unassigned societies within
    GROUP_RADIUS_KM, choose the set with the highest expected value that fits the farm
    (ILP knapsack, seed included), repeat. Groups are then ranked by expected value
    (sum of chance × savings), rated for risk and reward, and simulated (Monte Carlo).
    """
    result = run_scenario(ScenarioParams.model_validate_json(params_json))
    capacity = result["kpis"]["capacity_kwh"]
    pool = sorted((s for s in result["societies"] if s["eligible"]), key=lambda s: -s["priority_score"])
    lats = np.array([s["lat"] for s in pool])
    lons = np.array([s["lon"] for s in pool])
    assigned: set[str] = set()
    groups = []
    for seed in pool:
        if seed["id"] in assigned or seed["consumption_kwh"] > capacity:
            continue
        # The seed is the best unassigned society, so it comes first in `near`.
        within = haversine_km(seed["lat"], seed["lon"], lats, lons) <= GROUP_RADIUS_KM
        near = [s for s, w in zip(pool, within) if w and s["id"] not in assigned][:GROUP_CANDIDATES]
        chosen = knapsack([s["priority_score"] for s in near], [s["consumption_kwh"] for s in near], capacity, must=0)
        if chosen is None:
            continue
        members = [s for s, keep in zip(near, chosen) if keep]
        load = float(sum(s["consumption_kwh"] for s in members))
        assigned.update(m["id"] for m in members)
        groups.append(_describe_group(members, load, capacity))
        if len(groups) >= max_groups * 6:
            break

    # Best first, but at most two groups per area so the client sees options across cities.
    groups.sort(key=lambda g: -g["expected_value"])
    picked, per_area = [], {}
    for g in groups:
        if per_area.get(g["area"], 0) < 2:
            picked.append(g)
            per_area[g["area"]] = per_area.get(g["area"], 0) + 1
    groups = (picked + [g for g in groups if g not in picked])[:max_groups]
    median_savings = float(np.median([g["monthly_savings"] for g in groups])) if groups else 0
    for i, g in enumerate(groups):
        g["rank"] = i + 1
        g["risk"] = "Low risk" if g["avg_prob"] >= 0.6 else "Medium risk" if g["avg_prob"] >= 0.45 else "High risk"
        g["reward"] = "High reward" if g["monthly_savings"] >= median_savings else "Steady reward"
    return {"farm": result["farm"], "capacity_kwh": capacity, "groups": groups}


def _describe_group(members: list[dict], load: float, capacity: float) -> dict:
    probs = np.array([m["prob"] for m in members])
    lat = float(np.mean([m["lat"] for m in members]))
    lon = float(np.mean([m["lon"] for m in members]))
    spread = max(haversine_km(lat, lon, m["lat"], m["lon"]) for m in members) * 2
    cities = pd.Series([m["city"] for m in members]).value_counts()
    savings = float(sum(m["monthly_savings"] for m in members))
    expected = float(probs.sum())
    n = len(members)
    fill = load / capacity if capacity else 0
    why = []
    if spread <= 20:
        why.append(f"All {n} societies are within about {max(spread, 1):.0f} km of each other, so one field team can cover them.")
    why.append(f"Together they would use {fill:.0%} of the farm's monthly output.")
    why.append(f"Average chance to sign is {probs.mean():.0%}, so expect about {expected:.1f} of {n} to sign.")
    why.append(f"Combined, they would save ₹{savings / 1e5:,.1f} lakh a month on electricity.")
    return {
        "area": cities.index[0],
        "lat": lat,
        "lon": lon,
        "size": n,
        "flats": int(sum(m["num_flats"] for m in members)),
        "demand_kwh": load,
        "fill": fill,
        "avg_prob": float(probs.mean()),
        "expected_signups": expected,
        "chance_any": float(1 - np.prod(1 - probs)),
        "monthly_savings": savings,
        "expected_value": float((probs * np.array([m["monthly_savings"] for m in members])).sum()),
        "distance_km": float(np.mean([m["distance_km"] for m in members])),
        "simulation": _simulate(probs, np.array([m["consumption_kwh"] for m in members]), capacity),
        "why": why,
        "members": [
            {k: m[k] for k in ("id", "name", "city", "num_flats", "prob", "monthly_savings", "distance_km")}
            for m in sorted(members, key=lambda m: -m["prob"])
        ],
    }


def _simulate(probs: np.ndarray, kwh: np.ndarray, capacity: float, runs: int = SIMULATION_RUNS) -> dict:
    """Monte Carlo: pitch the group `runs` times; each society signs with its own probability.

    Gives the spread around the expected sign-ups: the range that holds 9 times out of 10,
    the full distribution, and how often the signed societies fill the farm.
    """
    rng = np.random.default_rng(0)
    signed = rng.random((runs, len(probs))) < probs
    signups = signed.sum(axis=1)
    fill = signed @ kwh / capacity if capacity else np.zeros(runs)
    low, high = np.quantile(signups, [0.05, 0.95], method="inverted_cdf")
    return {
        "runs": runs,
        "signups_low": int(low),
        "signups_high": int(high),
        "distribution": (np.bincount(signups, minlength=len(probs) + 1) / runs).round(4).tolist(),
        "fill_low": float(np.quantile(fill, 0.05)),
        "fill_high": float(np.quantile(fill, 0.95)),
        "chance_half_full": float((fill >= 0.5).mean()),
        "chance_none": float((signups == 0).mean()),
    }
