"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

import AppShell, { type Page } from "@/components/app/AppShell";
import CommandMenu from "@/components/app/CommandMenu";
import LeadsPage from "@/components/app/LeadsPage";
import LivePage from "@/components/app/LivePage";
import OverviewPage from "@/components/app/OverviewPage";
import ScenarioSheet from "@/components/app/ScenarioSheet";
import SocietySheet from "@/components/app/SocietySheet";
import DatasetReview from "@/components/DatasetReview";
import { API_URL, getFarmSites, runScenario } from "@/lib/api";
import { num } from "@/lib/format";
import { useLiveModel } from "@/lib/live";
import type { FarmSite, ScenarioParams, ScenarioResult, Society } from "@/lib/types";

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

const TITLES: Record<Page, string> = {
  overview: "Overview",
  leads: "Leads",
  live: "Live model",
  dataset: "Dataset",
};

export default function Dashboard() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [sites, setSites] = useState<FarmSite[]>([]);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("live");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Society | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  // The live stream runs for the whole session, so switching pages doesn't reset it.
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

  const patch = (p: Partial<ScenarioParams>) => setParams((cur) => ({ ...cur, ...p }));

  const start = () => {
    if (!live.started) {
      live.start();
      toast("Live classification started", { description: "Rows are streaming through the model." });
    }
    setPage("live");
  };

  const showOnMap = (id: string) => {
    setSelected(null);
    setFocusId(id);
    setPage("overview");
  };

  const subtitle = useMemo(() => {
    if (page === "overview" && result) {
      return <>Ranking {num(result.kpis.total_count)} societies for a <span className="text-ink">{result.params.capacity_mw} MW</span> farm
        at <span className="text-ink">{result.farm.name.replace(" (reference site)", "")}</span>.</>;
    }
    if (page === "leads") return "Every eligible society, ranked by expected value. Open any row for the full picture.";
    if (page === "live") return "Rows from your dataset stream through the trained model and are scored as they arrive.";
    return null;
  }, [page, result]);

  const toaster = (
    <Toaster position="bottom-right" toastOptions={{
      className: "!rounded-xl !border-0 !shadow-[var(--shadow-pop)] !font-sans !text-[13px]",
    }} />
  );

  // Step 1: review the data before anything streams.
  if (!live.started) {
    return (
      <div className="min-h-screen bg-canvas">
        <header className="flex h-14 items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-sun text-[12px]">☀</span>
            SolarLeads
          </Link>
        </header>
        <main className="mx-auto max-w-[1320px] px-5 pb-10 lg:px-8">
          <DatasetReview started={false} onStart={start} />
        </main>
        {toaster}
      </div>
    );
  }

  const scenarioPages = page === "overview" || page === "leads";

  return (
    <>
      <AppShell
        page={page}
        onNavigate={setPage}
        title={TITLES[page]}
        subtitle={subtitle}
        liveConnected={live.connected}
        onOpenCommand={() => setCommandOpen(true)}
        actions={scenarioPages && (
          <ScenarioSheet params={params} sites={sites} onChange={patch}
            onReset={() => { setParams(DEFAULT_PARAMS); toast("Scenario reset to defaults"); }} />
        )}>
        {scenarioPages && loading && (
          <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
            <div className="animate-progress h-full w-1/3 bg-sun" />
          </div>
        )}

        {error && scenarioPages && (
          <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-800">
            Can&apos;t reach the API at <code className="font-mono">{API_URL}</code> ({error}). Start it with{" "}
            <code className="font-mono">uvicorn app.main:app --reload</code> from the <code>backend</code> folder.
          </div>
        )}

        {page === "overview" && result && (
          <OverviewPage result={result} focusId={focusId} onSelect={setSelected} onViewLeads={() => setPage("leads")} />
        )}
        {page === "leads" && result && <LeadsPage result={result} onSelect={setSelected} />}
        {page === "live" && <LivePage live={live} />}
        {page === "dataset" && <DatasetReview started onStart={() => setPage("live")} embedded />}

        {scenarioPages && (
          <p className="mt-8 text-[12px] text-faint">
            Pending societies from the project dataset, scored by the logistic regression model trained when the API starts.
            Map positions are approximate (city level).
          </p>
        )}
      </AppShell>

      <SocietySheet society={selected} total={result?.kpis.eligible_count ?? 0}
        onClose={() => setSelected(null)} onShowOnMap={showOnMap} />
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} societies={result?.societies ?? []} sites={sites}
        onNavigate={setPage} onSite={(id) => patch({ site_id: id })} onSociety={setSelected} />
      {toaster}
    </>
  );
}
