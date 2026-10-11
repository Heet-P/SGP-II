"""Placeholder data for the frontend.

Everything here is fake and exists only so the UI can be built before the
model pipeline is wired in. To connect real data, replace `load_societies()`
with the scored model output and `explain()` with SHAP values — keep the
column names the same and scoring.py needs no changes.
"""

import numpy as np
import pandas as pd

CITIES = {
    "Mumbai": (19.0760, 72.8777, "Mumbai Suburban"),
    "Thane": (19.2183, 72.9781, "Thane"),
    "Navi Mumbai": (19.0330, 73.0297, "Thane"),
    "Pune": (18.5204, 73.8567, "Pune"),
    "Pimpri-Chinchwad": (18.6298, 73.7997, "Pune"),
    "Nashik": (19.9975, 73.7898, "Nashik"),
    "Aurangabad": (19.8762, 75.3433, "Aurangabad"),
    "Nagpur": (21.1458, 79.0882, "Nagpur"),
    "Kolhapur": (16.7050, 74.2433, "Kolhapur"),
    "Solapur": (17.6599, 75.9064, "Solapur"),
}

PROVIDERS = ["MSEDCL", "Adani Electricity", "Tata Power", "BEST"]

_PREFIXES = ["Shanti", "Sai Krupa", "Green Valley", "Sunrise", "Gokul", "Shivneri",
             "Lake View", "Om Sai", "Ganga", "Kalpataru", "Silver Oak", "Mangalam",
             "Vrindavan", "Royal Palms", "Anand", "Sahyadri", "Nisarg", "Parijat",
             "Akshay", "Tulsi", "Hill Crest", "Shree Ganesh", "Panchsheel", "Navratna"]
_SUFFIXES = ["CHS", "Co-op Housing Society", "Residency CHS", "Heights CHS", "Park CHS"]

# Placeholder logistic-regression weights (on standardised features).
# Replace with real coefficients / SHAP output from the model.
FEATURE_WEIGHTS = {
    "savings_per_flat": 0.9,
    "active_ratio": 0.7,
    "current_tariff": 0.5,
    "consumption": 0.3,
    "building_age": -0.4,
    "base_distance": -0.6,
}

FEATURE_LABELS = {
    "savings_per_flat": "Savings per flat",
    "active_ratio": "Active-flat ratio",
    "current_tariff": "Current tariff",
    "consumption": "Monthly consumption",
    "building_age": "Building age",
    "base_distance": "Distance to farm",
}

_STATS: dict = {}


def load_societies(n: int = 450, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    city_names = list(CITIES)
    city_weights = np.array([18, 12, 8, 16, 8, 8, 7, 9, 7, 7], dtype=float)
    city = rng.choice(city_names, size=n, p=city_weights / city_weights.sum())

    lat = np.array([CITIES[c][0] for c in city]) + rng.normal(0, 0.06, n)
    lon = np.array([CITIES[c][1] for c in city]) + rng.normal(0, 0.06, n)

    num_flats = rng.integers(24, 420, n)
    active_ratio = np.clip(rng.beta(8, 2, n), 0.35, 1.0)
    active_flats = np.maximum(1, (num_flats * active_ratio).round()).astype(int)
    consumption = (active_flats * rng.normal(210, 45, n)).clip(2000).round()
    tariff = rng.uniform(7.5, 12.5, n).round(2)
    age = rng.integers(1, 45, n)

    names = [f"{rng.choice(_PREFIXES)} {rng.choice(_SUFFIXES)}" for _ in range(n)]

    df = pd.DataFrame({
        "society_id": [f"MH-SOC-{i:05d}" for i in range(1, n + 1)],
        "society_name": names,
        "city": city,
        "district": [CITIES[c][2] for c in city],
        "latitude": lat.round(5),
        "longitude": lon.round(5),
        "current_provider": rng.choice(PROVIDERS, n),
        "num_flats": num_flats,
        "active_flats": active_flats,
        "avg_monthly_consumption_kwh": consumption,
        "current_tariff_rs_per_unit": tariff,
        "building_age_years": age,
    })

    # Fake "model 1" probability built from the same weights explain() uses,
    # so the explanation cards stay consistent with the score.
    feats = _feature_frame(df, ref=(18.5204, 73.8567))
    _STATS.update({c: (feats[c].mean(), feats[c].std()) for c in feats})
    logit = sum(w * _z(feats, c) for c, w in FEATURE_WEIGHTS.items()) - 0.3
    df["conversion_probability"] = (1 / (1 + np.exp(-(logit + rng.normal(0, 0.5, n))))).round(3)
    return df


def _feature_frame(df: pd.DataFrame, ref) -> pd.DataFrame:
    dist = haversine_km(df["latitude"], df["longitude"], *ref)
    return pd.DataFrame({
        "savings_per_flat": (df["current_tariff_rs_per_unit"] - 6.0)
        * df["avg_monthly_consumption_kwh"] / df["active_flats"],
        "active_ratio": df["active_flats"] / df["num_flats"],
        "current_tariff": df["current_tariff_rs_per_unit"],
        "consumption": df["avg_monthly_consumption_kwh"],
        "building_age": df["building_age_years"],
        "base_distance": dist,
    }, index=df.index)


def _z(feats: pd.DataFrame, col: str):
    mean, std = _STATS.get(col, (feats[col].mean(), feats[col].std()))
    return (feats[col] - mean) / (std or 1)


def explain(row: pd.Series) -> pd.Series:
    """Per-feature contribution to the conversion score (placeholder for SHAP)."""
    feats = _feature_frame(row.to_frame().T.astype({"latitude": float, "longitude": float}),
                           ref=(18.5204, 73.8567))
    contrib = {FEATURE_LABELS[c]: float(w * _z(feats, c).iloc[0])
               for c, w in FEATURE_WEIGHTS.items()}
    return pd.Series(contrib).sort_values()


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(a))
