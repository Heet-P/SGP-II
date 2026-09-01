"""Scenario scoring: eligibility, quadrants and capacity allocation."""

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from .dataset import explain, load_societies

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

    # Expected value of pitching = P(convert) × monthly savings. Allocate farm
    # output greedily to the highest expected-value societies until it is full.
    df["priority_score"] = (df["conversion_probability"] * df["monthly_savings_rs"]).where(df["eligible"], 0)
    monthly_capacity_kwh = p.capacity_mw * 1000 * 24 * 30 * CUF
    ranked = df[df["eligible"]].sort_values("priority_score", ascending=False)
    within = ranked["avg_monthly_consumption_kwh"].cumsum() <= monthly_capacity_kwh
    df["selected"] = False
    df.loc[ranked.index[within], "selected"] = True
    df["rank"] = df["priority_score"].rank(ascending=False, method="first").astype(int)

    sel = df[df["selected"]]
    used_kwh = float(sel["avg_monthly_consumption_kwh"].sum())

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


def run_groups(p: ScenarioParams, max_groups: int = 6) -> dict:
    """Groups of nearby eligible societies to pitch together, each sized to fill the farm.

    Greedy: take the best unassigned society as a seed, add the best unassigned neighbours
    within GROUP_RADIUS_KM until the farm's monthly output is used up, repeat. Groups are
    then ranked by expected value (sum of chance × savings) and rated for risk and reward.
    """
    result = run_scenario(p)
    capacity = result["kpis"]["capacity_kwh"]
    pool = sorted((s for s in result["societies"] if s["eligible"]), key=lambda s: -s["priority_score"])
    assigned: set[str] = set()
    groups = []
    for seed in pool:
        if seed["id"] in assigned:
            continue
        near = [s for s in pool if s["id"] not in assigned
                and haversine_km(seed["lat"], seed["lon"], s["lat"], s["lon"]) <= GROUP_RADIUS_KM]
        members, load = [], 0.0
        for s in near:
            if load + s["consumption_kwh"] <= capacity:
                members.append(s)
                load += s["consumption_kwh"]
        if not members:
            continue
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
        "why": why,
        "members": [
            {k: m[k] for k in ("id", "name", "city", "num_flats", "prob", "monthly_savings", "distance_km")}
            for m in sorted(members, key=lambda m: -m["prob"])
        ],
    }
