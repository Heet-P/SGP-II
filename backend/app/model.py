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


def predict(rows: pd.DataFrame) -> np.ndarray:
    return trained()["pipe"].predict_proba(rows[FEATURES])[:, 1]


def explain(row: pd.Series | dict) -> pd.Series:
    """Per-feature contribution to the log-odds (coefficient × transformed value), sorted ascending.

    Numeric contributions are relative to the training mean; categorical ones are
    relative to the dropped reference category, summed over each one-hot group.
    """
    pipe = trained()["pipe"]
    frame = pd.DataFrame([dict(row)])[FEATURES]
    x = pipe.named_steps["preprocess"].transform(frame)
    x = x.toarray()[0] if hasattr(x, "toarray") else np.asarray(x)[0]
    coef = pipe.named_steps["clf"].coef_[0]
    totals: dict[str, float] = {}
    for name, value in zip(_feature_names(pipe), x * coef):
        source = name.split("__", 1)[1]
        feature = next(f for f in FEATURES if source == f or source.startswith(f + "_"))
        totals[LABELS[feature]] = totals.get(LABELS[feature], 0.0) + float(value)
    return pd.Series(totals).sort_values()


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
