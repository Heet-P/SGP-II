"""Live classification stream: dataset rows flow through the model one at a time.

Nothing here is scripted. Each tick takes the next row from the dataset,
runs the trained model on it (timed), and, for held-out test rows, compares
the prediction with the real recorded outcome. Pending rows have no outcome
yet, so they are scored as new leads. All metrics come from these predictions.
"""

import random
import time
from collections import deque

from sklearn.metrics import roc_auc_score

from .dataset import approx_coords
from .model import explain, load_dataset, predict, trained

TICK_SECONDS = 1.5  # real time between rows at 1× speed
SOURCES = {"mixed", "test", "pending"}


class LiveClassifier:
    def __init__(self, source: str = "mixed", seed: int = 7, paused: bool = False):
        self.seed = seed
        self.speed = 1
        self.paused = paused
        self.reset(source)

    def reset(self, source: str | None = None):
        source = source or self.source
        if source not in SOURCES:
            raise ValueError(f"source must be one of {sorted(SOURCES)}")
        self.source = source
        df = load_dataset()
        test_ids = list(trained()["test_index"])
        pending_ids = list(df.index[df["pitch_outcome"] == "Pending"])
        rng = random.Random(self.seed)
        rng.shuffle(test_ids)
        rng.shuffle(pending_ids)
        if source == "test":
            queue = test_ids
        elif source == "pending":
            queue = pending_ids
        else:
            # Alternate scored-against-truth rows with new leads, then drain whichever is left.
            queue = [i for pair in zip(test_ids, pending_ids) for i in pair]
            n = min(len(test_ids), len(pending_ids))
            queue += test_ids[n:] + pending_ids[n:]
        self.queue = deque(queue)
        self.total = len(queue)
        self.seq = 0
        self.y_true: list[int] = []
        self.y_prob: list[float] = []
        self.recent: deque[bool] = deque(maxlen=100)
        self.cm = {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
        self.latencies: deque[float] = deque(maxlen=200)
        self.hot: list[dict] = []
        self.predicted_converts = 0
        self.tick_times: deque[float] = deque(maxlen=30)

    def handle(self, msg: dict):
        kind = msg.get("type")
        if kind == "control":
            self.speed = max(1, min(int(msg.get("speed", self.speed)), 16))
            self.paused = bool(msg.get("paused", self.paused))
        elif kind == "reset":
            self.reset(msg.get("source"))

    @property
    def interval(self) -> float:
        return TICK_SECONDS / self.speed

    def tick(self) -> dict:
        if not self.queue:
            return {"type": "done", "metrics": self._metrics()}

        df = load_dataset()
        row = df.loc[self.queue.popleft()]
        started = time.perf_counter()
        prob = float(predict(row.to_frame().T)[0])
        contrib = explain(row)
        latency_ms = (time.perf_counter() - started) * 1000
        self.latencies.append(latency_ms)
        self.tick_times.append(time.time())

        self.seq += 1
        predicted = prob >= 0.5
        actual = row["pitch_outcome"]
        labelled = actual in ("Converted", "Rejected")
        correct = None
        if labelled:
            truth = actual == "Converted"
            correct = predicted == truth
            self.y_true.append(int(truth))
            self.y_prob.append(prob)
            self.recent.append(correct)
            self.cm[("t" if correct else "f") + ("p" if predicted else "n")] += 1
        else:
            self.predicted_converts += int(predicted)

        lat, lon = approx_coords(row["society_id"], row["city"])
        society = {
            "id": row["society_id"],
            "name": row["society_name"],
            "city": row["city"],
            "district": row["district"],
            "provider": row["current_provider"],
            "lat": lat,
            "lon": lon,
            "num_flats": int(row["num_flats"]),
            "consumption_kwh": int(row["avg_monthly_consumption_kwh"]),
            "tariff": float(row["current_tariff_rs_per_unit"]),
            "solar_tariff": float(row["estimated_solar_tariff_rs_per_unit"]),
            "distance_km": float(row["distance_to_solar_farm_km"]),
            "age": int(row["building_age_years"]),
            "savings": int(row["estimated_monthly_savings_rs"]),
        }
        if not labelled:
            self.hot = sorted(self.hot + [{"prob": round(prob, 3), **society}],
                              key=lambda h: h["prob"], reverse=True)[:8]

        return {
            "type": "tick",
            "event": {
                "seq": self.seq,
                "society": society,
                "source": "test" if labelled else "pending",
                "prob": round(prob, 4),
                "predicted": "Converted" if predicted else "Rejected",
                "actual": actual if labelled else None,
                "correct": correct,
                "latency_ms": round(latency_ms, 2),
                "contributions": [{"feature": k, "value": round(v, 3)} for k, v in contrib.items()],
            },
            "metrics": self._metrics(),
            "hot_leads": self.hot,
        }

    def _metrics(self) -> dict:
        n = len(self.y_true)
        correct = self.cm["tp"] + self.cm["tn"]
        has_both = 0 < sum(self.y_true) < n
        tp, fp, fn = self.cm["tp"], self.cm["fp"], self.cm["fn"]
        times = self.tick_times
        span = times[-1] - times[0] if len(times) > 1 else 0
        return {
            "classified": self.seq,
            "remaining": len(self.queue),
            "total": self.total,
            "labelled": n,
            "pending_scored": self.seq - n,
            "predicted_converts": self.predicted_converts,
            "accuracy": correct / n if n else None,
            "rolling_accuracy": sum(self.recent) / len(self.recent) if self.recent else None,
            "auc": float(roc_auc_score(self.y_true, self.y_prob)) if has_both and n >= 10 else None,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "confusion": self.cm,
            "avg_latency_ms": sum(self.latencies) / len(self.latencies) if self.latencies else None,
            "rows_per_min": (len(times) - 1) / span * 60 if span else None,
            "speed": self.speed,
            "paused": self.paused,
            "source": self.source,
        }
