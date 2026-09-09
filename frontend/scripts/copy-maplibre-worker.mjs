// MapLibre 6 loads its web worker from a separate file, which the bundler
// doesn't emit. Serve it from public/ and point setWorkerUrl() at it.
import { copyFileSync } from "node:fs";

copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
