"""Conversion model trained on the project dataset.

Mirrors "Model A" in notebooks/initial_LR_analysis.ipynb: logistic regression
on the numeric society features plus provider and district, trained on the
resolved (Converted/Rejected) rows with the same stratified 80/20 split.
Training takes well under a second, so the model is fitted when the API starts.

Print the model card with:  python -m app.model
"""

import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "maharashtra_solar_societies_synthetic.csv"
RANDOM_STATE = 42

NUMERIC = ["num_flats", "avg_monthly_consumption_kwh", "current_tariff_rs_per_unit",
           "distance_to_solar_farm_km", "building_age_years",
           "estimated_solar_tariff_rs_per_unit", "estimated_monthly_savings_rs"]
CATEGORICAL = ["current_provider", "district"]
FEATURES = NUMERIC + CATEGORICAL

LABELS = {
    "num_flats": "Number of flats",
    "avg_monthly_consumption_kwh": "Monthly consumption",
    "current_tariff_rs_per_unit": "Current tariff",
    "distance_to_solar_farm_km": "Distance to farm",
    "building_age_years": "Building age",
    "estimated_solar_tariff_rs_per_unit": "Solar tariff offered",
    "estimated_monthly_savings_rs": "Estimated savings",
    "current_provider": "Current provider",
    "district": "District",
}


@lru_cache
def load_dataset() -> pd.DataFrame:
    return pd.read_csv(DATA_PATH)


@lru_cache
def trained() -> dict:
    df = load_dataset()
    resolved = df[df["pitch_outcome"].isin(["Converted", "Rejected"])]
    y = (resolved["pitch_outcome"] == "Converted").astype(int)
    X_train, X_test, y_train, y_test = train_test_split(
        resolved[FEATURES], y, test_size=0.2, stratify=y, random_state=RANDOM_STATE)

    pipe = Pipeline([
        ("preprocess", ColumnTransformer([
            ("num", StandardScaler(), NUMERIC),
            ("cat", OneHotEncoder(handle_unknown="ignore", drop="first"), CATEGORICAL),
        ])),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=RANDOM_STATE)),
    ])
    started = time.perf_counter()
    pipe.fit(X_train, y_train)
    fit_ms = (time.perf_counter() - started) * 1000

    proba = pipe.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    return {
        "pipe": pipe,
        "ranges": (X_train[NUMERIC].min(), X_train[NUMERIC].max()),
        "test_index": X_test.index,
        "card": {
            "model": "Logistic regression (class-balanced)",
            "dataset": DATA_PATH.name,
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "fit_ms": round(fit_ms, 1),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "pending_rows": int((df["pitch_outcome"] == "Pending").sum()),
            "test_metrics": {
                "accuracy": round(float(accuracy_score(y_test, pred)), 4),
                "precision": round(float(precision_score(y_test, pred)), 4),
                "recall": round(float(recall_score(y_test, pred)), 4),
                "auc": round(float(roc_auc_score(y_test, proba)), 4),
                # Accuracy of always predicting the majority class (Rejected).
                "baseline_accuracy": round(float(1 - y_test.mean()), 4),
            },
            "features": [LABELS[f] for f in FEATURES],
            "districts": sorted(df["district"].unique().tolist()),
            "providers": sorted(df["current_provider"].unique().tolist()),
        },
    }


def _feature_names(pipe: Pipeline) -> list[str]:
    return list(pipe.named_steps["preprocess"].get_feature_names_out())


def with_offer(rows: pd.DataFrame, distance_km, solar_tariff) -> pd.DataFrame:
    """Rows with the offer-dependent model inputs set to a given farm distance and solar price,
    replacing the dataset's fixed values so predictions follow the scenario."""
    rows = rows.assign(distance_to_solar_farm_km=distance_km, estimated_solar_tariff_rs_per_unit=solar_tariff)
    rows["estimated_monthly_savings_rs"] = ((rows["current_tariff_rs_per_unit"] - solar_tariff)
                                            * rows["avg_monthly_consumption_kwh"])
    return rows


def _clamped(rows: pd.DataFrame) -> pd.DataFrame:
    """Model inputs with numeric features capped to the training range. A linear model keeps
    extending its trend past the data it saw, which pushes far-off scenarios to 0% or 100%."""
    low, high = trained()["ranges"]
    rows = rows[FEATURES].copy()
    rows[NUMERIC] = rows[NUMERIC].astype(float).clip(low, high, axis=1)
    return rows


def predict(rows: pd.DataFrame) -> np.ndarray:
    return trained()["pipe"].predict_proba(_clamped(rows))[:, 1]


def _contributions(row: pd.Series | dict) -> dict[str, float]:
    """Contribution of each raw feature to the log-odds (coefficient × transformed value).

    Numeric contributions are relative to the training mean; categorical ones are
    relative to the dropped reference category, summed over each one-hot group.
    """
    pipe = trained()["pipe"]
    frame = _clamped(pd.DataFrame([dict(row)]))
    x = pipe.named_steps["preprocess"].transform(frame)
    x = x.toarray()[0] if hasattr(x, "toarray") else np.asarray(x)[0]
    coef = pipe.named_steps["clf"].coef_[0]
    totals: dict[str, float] = {}
    for name, value in zip(_feature_names(pipe), x * coef):
        source = name.split("__", 1)[1]
        feature = next(f for f in FEATURES if source == f or source.startswith(f + "_"))
        totals[feature] = totals.get(feature, 0.0) + float(value)
    return totals


def explain(row: pd.Series | dict) -> pd.Series:
    """Per-feature contribution to the log-odds, keyed by readable label, sorted ascending."""
    return pd.Series({LABELS[f]: v for f, v in _contributions(row).items()}).sort_values()


FORMAT = {
    "num_flats": lambda v: f"{v:,.0f} flats",
    "avg_monthly_consumption_kwh": lambda v: f"{v:,.0f} kWh",
    "current_tariff_rs_per_unit": lambda v: f"₹{v:.2f}/unit",
    "distance_to_solar_farm_km": lambda v: f"{v:,.0f} km",
    "building_age_years": lambda v: f"{v:,.0f} years",
    "estimated_solar_tariff_rs_per_unit": lambda v: f"₹{v:.2f}/unit",
    "estimated_monthly_savings_rs": lambda v: f"₹{v:,.0f} a month",
}


def reasons(row: pd.Series | dict, top: int = 4) -> list[dict]:
    """The strongest drivers of a prediction, as plain-language sentences.

    Numeric features are compared with the typical (mean) society the model trained on;
    categorical ones describe how that provider or district fared in past pitches.
    """
    contrib = _contributions(row)
    scaler = trained()["pipe"].named_steps["preprocess"].named_transformers_["num"]
    means = dict(zip(NUMERIC, scaler.mean_))
    out = []
    for feature, value in sorted(contrib.items(), key=lambda kv: -abs(kv[1]))[:top]:
        up = value >= 0
        effect = "raises" if up else "lowers"
        if feature in NUMERIC:
            x = float(dict(row)[feature])
            side = "above" if x >= means[feature] else "below"
            text = (f"{LABELS[feature]} of {FORMAT[feature](x)} is {side} the typical "
                    f"{FORMAT[feature](means[feature])}, which {effect} the chance.")
        else:
            record = "a better" if up else "a weaker"
            text = f"{dict(row)[feature]} ({LABELS[feature].lower()}) has {record} track record in past pitches."
        out.append({"feature": LABELS[feature], "effect": "up" if up else "down", "weight": round(abs(value), 3), "text": text})
    return out


@lru_cache
def dataset_with_roles() -> pd.DataFrame:
    """The dataset plus each row's role: Train (model learns from it), Held-out (scored live
    against its real outcome) or Pending (no outcome yet, scored as a new lead)."""
    df = load_dataset().copy()
    df["role"] = "Train"
    df.loc[trained()["test_index"], "role"] = "Held-out"
    df.loc[df["pitch_outcome"] == "Pending", "role"] = "Pending"
    return df


def card() -> dict:
    return trained()["card"]


if __name__ == "__main__":
    import json

    print(json.dumps(card(), indent=2))
