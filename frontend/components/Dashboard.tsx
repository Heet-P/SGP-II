"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import KpiCards from "@/components/KpiCards";
import LeadCards from "@/components/LeadCards";
import RiskReward from "@/components/RiskReward";
import Sidebar from "@/components/Sidebar";
import { API_URL, getFarmSites, runScenario } from "@/lib/api";
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
  const [tab, setTab] = useState<Tab>("map");
  const [focusId, setFocusId] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar params={params} sites={sites} onChange={(patch) => setParams((p) => ({ ...p, ...patch }))} />

      <main className="relative min-w-0 flex-1 px-5 py-6 lg:px-9 lg:py-8">
        {loading && (
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
            <div className="animate-progress h-full w-1/3 bg-sun" />
          </div>
        )}

        <header className="mb-6">
          <h1 className="text-[28px] font-semibold tracking-tight">Who should we pitch first?</h1>
          <p className="mt-1 text-[15px] text-muted">
            {result
              ? <>Ranking housing societies for a <b className="text-ink">{result.params.capacity_mw} MW</b> farm
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
            <KpiCards kpis={result.kpis} />

            <nav className="mt-7 mb-4 inline-flex rounded-lg border border-line bg-surface p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === "map" && <LeadMap result={result} focusId={focusId} onFocus={setFocusId} />}
            {tab === "quad" && <RiskReward result={result} />}
            {tab === "leads" && <LeadCards result={result} byId={byId} onLocate={locate} />}
          </>
        )}

        <p className="mt-8 text-xs text-muted">
          Showing placeholder data. Connect the model output in <code>backend/app/mock_data.py</code>.
        </p>
      </main>
    </div>
  );
}
