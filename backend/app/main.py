"""Solar Society Lead Platform API.

Run (from the backend folder):  uvicorn app.main:app --reload --port 8000
"""

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .scoring import FARM_SITES, ScenarioParams, run_scenario

app = FastAPI(title="Solar Society Lead Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
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
