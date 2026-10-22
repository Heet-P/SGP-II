"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { setWorkerUrl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Popup, Source } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";

import { inr, pct } from "@/lib/format";
import { INELIGIBLE_COLOR, QUADRANTS, quadrantColor } from "@/lib/quadrants";
import type { ScenarioResult } from "@/lib/types";

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Served from public/ by scripts/copy-maplibre-worker.mjs.
setWorkerUrl("/maplibre-gl-worker.mjs");

interface Props {
  result: ScenarioResult;
  focusId: string | null;
  onFocus: (id: string | null) => void;
}

export default function LeadMap({ result, focusId, onFocus }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const { farm, societies, params } = result;

  const points = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: societies.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { id: s.id, color: quadrantColor(s.quadrant), selected: s.selected, eligible: s.eligible },
    })),
  }), [societies]);

  const ring = useMemo(() => circlePolygon(farm.lon, farm.lat, params.max_distance_km),
    [farm.lon, farm.lat, params.max_distance_km]);

  // The map remounts on every tab switch, so the first view comes from
  // initialViewState and the effects below only animate later changes.
  const [initialView] = useState(() => {
    const s = societies.find((x) => x.id === focusId);
    return s
      ? { longitude: s.lon, latitude: s.lat, zoom: 10 }
      : { longitude: farm.lon + 1.2, latitude: farm.lat + 0.6, zoom: 5.9 };
  });
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) mapRef.current?.easeTo({ center: [farm.lon, farm.lat], duration: 800 });
  }, [farm.lon, farm.lat]);

  useEffect(() => {
    const s = societies.find((x) => x.id === focusId);
    if (s && mounted.current) mapRef.current?.flyTo({ center: [s.lon, s.lat], zoom: 10, duration: 1200 });
    // Only re-fly when the focused society changes, not on every scenario update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  const popupId = hoverId ?? focusId;
  const popup = societies.find((s) => s.id === popupId);

  const onMove = (e: MapLayerMouseEvent) => setHoverId((e.features?.[0]?.properties?.id as string) ?? null);

  return (
    <div className="relative h-full overflow-hidden">
        <Map
          ref={mapRef}
          initialViewState={initialView}
          mapStyle={BASEMAP}
          interactiveLayerIds={["societies"]}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverId(null)}
          onClick={(e) => onFocus((e.features?.[0]?.properties?.id as string) ?? null)}
          cursor={hoverId ? "pointer" : "grab"}
        >
          <NavigationControl position="top-right" showCompass={false} />

          <Source id="ring" type="geojson" data={ring}>
            <Layer id="ring-fill" type="fill" paint={{ "fill-color": "#f5b301", "fill-opacity": 0.08 }} />
            <Layer id="ring-line" type="line"
              paint={{ "line-color": "#d49b00", "line-width": 1.5, "line-dasharray": [3, 2] }} />
          </Source>

          <Source id="societies" type="geojson" data={points}>
            <Layer
              id="societies"
              type="circle"
              layout={{ "circle-sort-key": ["case", ["get", "selected"], 2, ["get", "eligible"], 1, 0] }}
              paint={{
                "circle-color": ["get", "color"],
                "circle-radius": ["interpolate", ["linear"], ["zoom"],
                  5, ["case", ["get", "selected"], 5, ["get", "eligible"], 3.2, 2.2],
                  11, ["case", ["get", "selected"], 11, ["get", "eligible"], 7, 5]],
                "circle-opacity": ["case", ["get", "selected"], 0.95, ["get", "eligible"], 0.5, 0.3],
                "circle-stroke-width": ["case", ["get", "selected"], 1.5, 0],
                "circle-stroke-color": "#ffffff",
              }}
            />
          </Source>

          <Marker longitude={farm.lon} latitude={farm.lat} anchor="center">
            <div title={`Solar farm · ${farm.name}`}
              className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-sun text-sm shadow-lg">
              ☀
            </div>
          </Marker>

          {popup && (
            <Popup longitude={popup.lon} latitude={popup.lat} closeButton={false} closeOnClick={false}
              offset={10} maxWidth="260px">
              <div className="text-[12px] leading-relaxed">
                <div className="text-[13px] font-semibold">{popup.name}</div>
                <div className="text-panel-muted">
                  {popup.city} · {popup.num_flats} flats
                </div>
                <div className="mt-1">
                  Saves <b>{inr(popup.monthly_savings)}</b>/mo · converts <b>{pct(popup.prob)}</b>
                </div>
                <div>{popup.distance_km} km from farm</div>
                <div className="mt-1 font-medium" style={{ color: popup.selected ? "#4ade80" : popup.eligible ? "#fbbf24" : "#f87171" }}>
                  {popup.selected ? "In allocation" : popup.eligible ? "Eligible · not in the best mix" : popup.reason}
                </div>
              </div>
            </Popup>
          )}
        </Map>

      {/* Compact legend over the map; counts live in the page's stats. */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface/95 px-3 py-2 text-[11px] shadow-card">
        {Object.entries(QUADRANTS).map(([name, q]) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: q.color }} />{name}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-2 w-2 rounded-full opacity-40" style={{ background: INELIGIBLE_COLOR }} />Ineligible
        </span>
      </div>
    </div>
  );
}

/** A geodesic-ish circle polygon (good enough at this scale) for the distance ring. */
function circlePolygon(lon: number, lat: number, radiusKm: number, steps = 96): GeoJSON.Feature {
  const coords: [number, number][] = [];
  const dLat = radiusKm / 110.574;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}
