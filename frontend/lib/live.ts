"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { API_URL } from "./api";

// Mirrors the messages sent by backend/app/stream.py over /ws/live.

export type Outcome = "Converted" | "Rejected";
export type Source = "mixed" | "test" | "pending";

export interface Contribution {
  feature: string;
  value: number;
}

export interface StreamSociety {
  id: string;
  name: string;
  city: string;
  district: string;
  provider: string;
  lat: number;
  lon: number;
  num_flats: number;
  consumption_kwh: number;
  tariff: number;
  solar_tariff: number;
  distance_km: number;
  age: number;
  savings: number;
}

export interface StreamEvent {
  seq: number;
  society: StreamSociety;
  source: "test" | "pending";
  prob: number;
  predicted: Outcome;
  actual: Outcome | null;
  correct: boolean | null;
  latency_ms: number;
  contributions: Contribution[];
}

export interface StreamMetrics {
  classified: number;
  remaining: number;
  total: number;
  labelled: number;
  pending_scored: number;
  predicted_converts: number;
  accuracy: number | null;
  rolling_accuracy: number | null;
  auc: number | null;
  precision: number | null;
  recall: number | null;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  avg_latency_ms: number | null;
  rows_per_min: number | null;
  speed: number;
  paused: boolean;
  source: Source;
}

export type HotLead = StreamSociety & { prob: number };

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  predicted: Outcome;
}

export interface LiveState {
  latest: StreamEvent | null;
  metrics: StreamMetrics | null;
  hot: HotLead[];
  feed: StreamEvent[];
  history: { n: number; accuracy: number; rolling: number }[];
  points: MapPoint[];
  done: boolean;
}

type Message =
  | { type: "tick"; event: StreamEvent; metrics: StreamMetrics; hot_leads: HotLead[] }
  | { type: "done"; metrics: StreamMetrics }
  | { type: "error"; detail: string };

const FEED_ITEMS = 60;
const MAP_POINTS = 2500;
const HISTORY_POINTS = 600;

const EMPTY: LiveState = { latest: null, metrics: null, hot: [], feed: [], history: [], points: [], done: false };

function reduce(s: LiveState, msg: Message): LiveState {
  if (msg.type === "done") return { ...s, metrics: msg.metrics, done: true };
  if (msg.type !== "tick") return s;
  const { event: e, metrics: m } = msg;
  const scored = e.source === "test" && m.accuracy != null && m.rolling_accuracy != null;
  return {
    latest: e,
    metrics: m,
    hot: msg.hot_leads,
    feed: [e, ...s.feed].slice(0, FEED_ITEMS),
    history: scored
      ? [...s.history, { n: m.labelled, accuracy: m.accuracy!, rolling: m.rolling_accuracy! }].slice(-HISTORY_POINTS)
      : s.history,
    points: [...s.points, { id: e.society.id, lat: e.society.lat, lon: e.society.lon, predicted: e.predicted }]
      .slice(-MAP_POINTS),
    done: false,
  };
}

export function useLiveModel() {
  const [state, setState] = useState<LiveState>(EMPTY);
  const [connected, setConnected] = useState(false);
  // The stream waits on the dataset review screen until Start is pressed.
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeedState] = useState(1);
  const [source, setSource] = useState<Source>("mixed");
  const ws = useRef<WebSocket | null>(null);

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  // Connect once and reconnect automatically if the backend restarts.
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    const connect = () => {
      const sock = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws/live`);
      ws.current = sock;
      sock.onopen = () => {
        setConnected(true);
        // The server starts every new connection paused; resume if the demo was already running.
        setPaused(!startedRef.current);
        if (startedRef.current) sock.send(JSON.stringify({ type: "control", paused: false }));
        setSpeedState(1);
        setSource("mixed");
        setState(EMPTY);
      };
      sock.onmessage = (m) => setState((s) => reduce(s, JSON.parse(m.data) as Message));
      sock.onclose = () => {
        setConnected(false);
        if (!disposed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      const sock = ws.current;
      // Closing a socket that is still connecting logs a browser warning; close it once open instead.
      if (sock?.readyState === WebSocket.CONNECTING) sock.onopen = () => sock.close();
      else sock?.close();
    };
  }, []);

  const restart = (next: Source) => {
    send({ type: "reset", source: next });
    send({ type: "control", paused: false });
    setSource(next);
    setPaused(false);
    setState(EMPTY);
  };

  return {
    state,
    connected,
    started,
    start: () => {
      startedRef.current = true;
      setStarted(true);
      setPaused(false);
      send({ type: "control", paused: false });
    },
    paused: paused || state.done,
    speed,
    source,
    setSpeed: (v: number) => {
      setSpeedState(v);
      send({ type: "control", speed: v });
    },
    togglePause: () => {
      send({ type: "control", paused: !paused });
      setPaused(!paused);
    },
    restart,
  };
}
