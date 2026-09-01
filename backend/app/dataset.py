"""Societies for the scenario views: the dataset's Pending rows, scored by the model.

The dataset has city and district but no coordinates, so each society is
placed near its city's centre with a small deterministic offset. Map
positions are therefore approximate (city level), not exact addresses.
The dataset also has no active/inactive flat split, so every flat counts as active.
"""

import zlib
from functools import lru_cache

import numpy as np
import pandas as pd

from .model import explain, load_dataset, predict

CITY_COORDS = {
    "Ahmednagar": (19.0952, 74.7496), "Akola": (20.7002, 77.0082), "Amravati": (20.9374, 77.7796),
    "Aurangabad": (19.8762, 75.3433), "Chandrapur": (19.9615, 79.2961), "Dhule": (20.9042, 74.7749),
    "Jalgaon": (21.0077, 75.5626), "Kalyan": (19.2437, 73.1355), "Kolhapur": (16.7050, 74.2433),
    "Latur": (18.4088, 76.5604), "Mumbai": (19.0760, 72.8777), "Nagpur": (21.1458, 79.0882),
    "Nanded": (19.1383, 77.3210), "Nashik": (19.9975, 73.7898), "Navi Mumbai": (19.0330, 73.0297),
    "Panvel": (18.9894, 73.1175), "Pune": (18.5204, 73.8567), "Sangli": (16.8524, 74.5815),
    "Solapur": (17.6599, 75.9064), "Thane": (19.2183, 72.9781),
}


def approx_coords(society_id: str, city: str) -> tuple[float, float]:
    """City centre plus a stable offset of up to ~6 km derived from the society id."""
    lat, lon = CITY_COORDS[city]
    h = zlib.crc32(society_id.encode())
    angle = (h % 3600) / 3600 * 2 * np.pi
    radius = ((h >> 12) % 1000) / 1000 * 0.055
    return round(lat + radius * np.sin(angle), 5), round(lon + radius * np.cos(angle), 5)


@lru_cache
def load_societies() -> pd.DataFrame:
    df = load_dataset()
    pending = df[df["pitch_outcome"] == "Pending"].copy()
    coords = [approx_coords(sid, city) for sid, city in zip(pending["society_id"], pending["city"])]
    pending["latitude"] = [c[0] for c in coords]
    pending["longitude"] = [c[1] for c in coords]
    pending["active_flats"] = pending["num_flats"]
    pending["conversion_probability"] = predict(pending).round(3)
    return pending.reset_index(drop=True)


__all__ = ["load_societies", "explain", "approx_coords"]
