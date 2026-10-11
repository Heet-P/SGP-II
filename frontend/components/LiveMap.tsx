"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { setWorkerUrl } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";

import type { MapPoint, StreamEvent } from "@/lib/live";

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const CONVERT = "#16a34a";
const REJECT = "#ef4444";

// Served from public/ by scripts/copy-maplibre-worker.mjs.
setWorkerUrl("/maplibre-gl-worker.mjs");

/** Every classified society lands on the map, coloured by the model's prediction. */
export default function LiveMap({ points, latest, focus }: {
  points: MapPoint[];
  latest: StreamEvent | null;
  focus: { lat: number; lon: number } | null;
}) {
  const mapRef = useRef<MapRef>(null);

  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { color: p.predicted === "Converted" ? CONVERT : REJECT },
    })),
  }), [points]);

  useEffect(() => {
    if (focus) mapRef.current?.flyTo({ center: [focus.lon, focus.lat], zoom: 10, duration: 1200 });
  }, [focus]);

  const color = latest?.predicted === "Converted" ? CONVERT : REJECT;

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-line bg-surface">
      <Map ref={mapRef} initialViewState={{ longitude: 76.2, latitude: 19.2, zoom: 5.6 }} mapStyle={BASEMAP}>
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="classified" type="geojson" data={data}>
          <Layer
            id="classified"
            type="circle"
            paint={{
              "circle-color": ["get", "color"],
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.6, 11, 6],
              "circle-opacity": 0.6,
            }}
          />
        </Source>
        {latest && (
          <Marker key={latest.seq} longitude={latest.society.lon} latitude={latest.society.lat} anchor="center">
            <span className="map-pulse" style={{ "--c": color } as React.CSSProperties} />
          </Marker>
        )}
      </Map>
      <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-surface/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CONVERT }} />Predicted convert</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: REJECT }} />Predicted reject</span>
        </div>
        <div className="mt-0.5 text-muted">{points.length.toLocaleString("en-IN")} societies classified · city-level positions</div>
      </div>
    </div>
  );
}
