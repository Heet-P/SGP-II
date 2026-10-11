"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import KpiCards from "@/components/KpiCards";
import LeadCards from "@/components/LeadCards";
import LiveModel from "@/components/LiveModel";
import RiskReward from "@/components/RiskReward";
import Sidebar from "@/components/Sidebar";
import DatasetReview from "@/components/DatasetReview";
import { API_URL, getFarmSites, runScenario } from "@/lib/api";
import { useLiveModel } from "@/lib/live";
import type { FarmSite, ScenarioParams, ScenarioResult } from "@/lib/types";

// MapLibre needs `window`, so the map only renders in the browser.
const LeadMap = dynamic(() => import("@/components/LeadMap"), {
  ssr: false,
  loading: () => <div className="h-[600px] animate-pulse rounded-xl bg-line/60" />,
});

const DEFAULT_PARAMS: ScenarioParams = {
  site_id: "pune",
  capacity_mw: 5,
  gen_cost: 3.5,
  use_distance: true,
  transfer_cost: 0.03,
  markup_pct: 25,
  max_distance_km: 200,
  max_age_years: 35,
  min_active_pct: 50,
  top_n: 20,
};

const TABS = [
  { id: "data", label: "Dataset" },
  { id: "live", label: "Live model" },
  { id: "map", label: "Lead map" },
  { id: "quad", label: "Risk vs reward" },
  { id: "leads", label: "Top leads" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Dashboard() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [sites, setSites] = useState<FarmSite[]>([]);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The demo opens on the dataset review; Start begins the live stream.
  const [tab, setTab] = useState<Tab>("data");
  const [focusId, setFocusId] = useState<string | null>(null);
  // The live stream runs for the whole session, so switching tabs doesn't reset it.
  const live = useLiveModel();

  useEffect(() => {
    getFarmSites().then(setSites).catch(() => {});
  }, []);

  // Debounce slider drags, and cancel requests that a newer change has superseded.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      runScenario(params, ctrl.signal)
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [params]);

  const byId = useMemo(() => new Map(result?.societies.map((s) => [s.id, s]) ?? []), [result]);

  const locate = (id: string) => {
    setFocusId(id);
    setTab("map");
  };

  const startDemo = () => {
    if (!live.started) live.start();
    setTab("live");
  };

  const nav = (
    <nav className="mb-4 inline-flex rounded-lg border border-line bg-surface p-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"
          }`}
        >
          {t.id === "live" && (
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${live.connected ? "bg-green-500" : "bg-muted/50"}`} />
          )}
          {t.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {tab !== "data" && (
        <Sidebar params={params} sites={sites} onChange={(patch) => setParams((p) => ({ ...p, ...patch }))} />
      )}

      <main className="relative min-w-0 flex-1 px-5 py-6 lg:px-9 lg:py-8">
        {tab === "data" ? (
          <>
            {live.started && nav}
            <DatasetReview started={live.started} onStart={startDemo} />
          </>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
                <div className="animate-progress h-full w-1/3 bg-sun" />
              </div>
            )}

            <header className="mb-6">
              <h1 className="text-[28px] font-semibold tracking-tight">
                {tab === "live" ? "Live classification" : "Who should we pitch first?"}
              </h1>
              <p className="mt-1 text-[15px] text-muted">
                {result
                  ? tab === "live"
                    ? "Societies from your dataset stream through the trained model one at a time and are classified as they arrive."
                    : <>Ranking housing societies for a <b className="text-ink">{result.params.capacity_mw} MW</b> farm
                        at <b className="text-ink">{result.farm.name}</b>.</>
                  : "Loading scenario…"}
              </p>
            </header>

            {error && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Can&apos;t reach the API at <code className="font-mono">{API_URL}</code> ({error}). Start it with{" "}
                <code className="font-mono">uvicorn app.main:app --reload</code> from the <code>backend</code> folder.
              </div>
            )}

            {result && (
              <>
                {tab !== "live" && <KpiCards kpis={result.kpis} />}

                <div className={tab === "live" ? "" : "mt-7"}>{nav}</div>

                <div key={tab} className="animate-fade-up">
                  {tab === "live" && <LiveModel live={live} />}
                  {tab === "map" && <LeadMap result={result} focusId={focusId} onFocus={setFocusId} />}
                  {tab === "quad" && <RiskReward result={result} />}
                  {tab === "leads" && <LeadCards result={result} byId={byId} onLocate={locate} />}
                </div>
            </>
        )}
        </>
        )}

        <p className="mt-8 text-xs text-muted">
          Data: <code>data/raw/maharashtra_solar_societies_synthetic.csv</code>. The ranking tabs show its Pending
          societies, scored by the logistic regression model trained when the API starts. Map positions are city-level.
        </p>
      </main>
    </div>
  );
}
