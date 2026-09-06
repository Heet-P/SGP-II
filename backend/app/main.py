"""Solar Society Lead Platform API.

Run (from the backend folder):
    uvicorn app.main:app --reload --port 8000 --timeout-graceful-shutdown 1
(The timeout stops a reload from waiting forever on open live-stream connections.)
"""

import asyncio
import os
import time

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from .dataset import load_societies
from .model import card, dataset_with_roles, explain, predict, reasons
from .scoring import FARM_SITES, ScenarioParams, run_groups, run_scenario
from .stream import LiveClassifier

app = FastAPI(title="Solar Society Lead Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    # Also accept any local dev port, since other projects may already be using 3000.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/farm-sites")
def farm_sites():
    return FARM_SITES


@app.post("/api/scenario")
def scenario(params: ScenarioParams):
    if params.site_id not in {s["id"] for s in FARM_SITES}:
        raise HTTPException(status_code=422, detail=f"Unknown site_id '{params.site_id}'")
    return run_scenario(params)


@app.get("/api/dataset")
def dataset(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
            q: str = "", outcome: str = "", role: str = ""):
    """The raw dataset, paginated and filterable, for the review screen."""
    df = dataset_with_roles()
    view = df
    if q:
        needle = q.lower()
        view = view[view["society_name"].str.lower().str.contains(needle, regex=False)
                    | view["city"].str.lower().str.contains(needle, regex=False)
                    | view["society_id"].str.lower().str.contains(needle, regex=False)]
    if outcome:
        view = view[view["pitch_outcome"] == outcome]
    if role:
        view = view[view["role"] == role]
    start = (page - 1) * page_size
    return {
        "total": int(len(df)),
        "matching": int(len(view)),
        "page": page,
        "page_size": page_size,
        "columns": list(df.columns),
        "counts": {
            "outcome": df["pitch_outcome"].value_counts().to_dict(),
            "role": df["role"].value_counts().to_dict(),
        },
        "rows": view.iloc[start:start + page_size].to_dict(orient="records"),
    }


@app.get("/api/societies/{society_id}/explain")
def explain_society(society_id: str):
    """The model's reasoning for one Pending society: per-feature contributions to its score."""
    df = load_societies()
    match = df[df["society_id"] == society_id]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"Unknown society '{society_id}'")
    contrib = explain(match.iloc[0])
    return {
        "id": society_id,
        "contributions": [{"feature": k, "value": round(v, 3)} for k, v in contrib.items()],
        "strength": contrib.idxmax(),
        "weakness": contrib.idxmin() if contrib.min() < 0 else None,
    }


@app.get("/api/model")
def model_card():
    return card()


class SocietyInput(BaseModel):
    name: str | None = None
    district: str
    current_provider: str
    num_flats: int = Field(gt=0)
    avg_monthly_consumption_kwh: float = Field(gt=0)
    current_tariff_rs_per_unit: float = Field(gt=0)
    estimated_solar_tariff_rs_per_unit: float = Field(gt=0)
    distance_to_solar_farm_km: float = Field(ge=0)
    building_age_years: int = Field(ge=0)


def _classify(society: SocietyInput) -> dict:
    row = society.model_dump()
    # Same definition the dataset uses for its estimated savings column.
    row["estimated_monthly_savings_rs"] = ((row["current_tariff_rs_per_unit"] - row["estimated_solar_tariff_rs_per_unit"])
                                           * row["avg_monthly_consumption_kwh"])
    started = time.perf_counter()
    prob = float(predict(pd.DataFrame([row]))[0])
    contrib = explain(row)
    return {
        "name": society.name,
        "prob": round(prob, 4),
        "predicted": "Converted" if prob >= 0.5 else "Rejected",
        "estimated_monthly_savings_rs": round(row["estimated_monthly_savings_rs"]),
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "contributions": [{"feature": k, "value": round(v, 3)} for k, v in contrib.items()],
        "reasons": reasons(row),
    }


@app.post("/api/classify")
def classify(society: SocietyInput):
    """Classify a society that isn't in the dataset, e.g. one typed into the UI."""
    return _classify(society)


class SocietyBatch(BaseModel):
    societies: list[SocietyInput] = Field(max_length=1000)


@app.post("/api/classify/batch")
def classify_batch(batch: SocietyBatch):
    """Classify many societies at once, e.g. from a client's uploaded CSV."""
    return {"results": [_classify(s) for s in batch.societies]}


@app.post("/api/groups")
def groups(params: ScenarioParams, max_groups: int = Query(6, ge=1, le=12)):
    """Groups of nearby societies to pitch together, each sized to fill the farm."""
    if params.site_id not in {s["id"] for s in FARM_SITES}:
        raise HTTPException(status_code=422, detail=f"Unknown site_id '{params.site_id}'")
    return run_groups(params, max_groups)


@app.websocket("/ws/live")
async def live(ws: WebSocket):
    """Streams one classified dataset row per message; accepts control/reset messages."""
    await ws.accept()
    # Wait for the client to press Start before streaming.
    sim = LiveClassifier(paused=True)

    async def receive():
        while True:
            msg = await ws.receive_json()
            try:
                sim.handle(msg)
            except (ValidationError, KeyError, ValueError) as e:
                await ws.send_json({"type": "error", "detail": str(e)})

    receiver = asyncio.create_task(receive())
    try:
        while not receiver.done():
            if not sim.paused:
                msg = sim.tick()
                await ws.send_json(msg)
                if msg["type"] == "done":
                    sim.paused = True
            await asyncio.sleep(sim.interval)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        receiver.cancel()
