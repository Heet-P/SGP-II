"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";

import CheckSocieties from "@/components/client/CheckSocieties";
import PitchGroups from "@/components/client/PitchGroups";
import { Segmented } from "@/components/ui";
import { getFarmSites, getGroups, getModelCard } from "@/lib/api";
import { num } from "@/lib/format";
import type { FarmSite, GroupsResult, ModelCard, ScenarioParams } from "@/lib/types";

// Same defaults as the analyst dashboard; the client only chooses site and size.
const BASE: ScenarioParams = {
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

const CAPACITIES = [2, 5, 10, 20];

/** Client-facing portal: which societies to pitch together, and a live check for their own list. */
export default function ClientPortal() {
  const [sites, setSites] = useState<FarmSite[]>([]);
  const [card, setCard] = useState<ModelCard | null>(null);
  const [siteId, setSiteId] = useState(BASE.site_id);
  const [capacity, setCapacity] = useState(BASE.capacity_mw);
  const [groups, setGroups] = useState<GroupsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFarmSites().then(setSites).catch(() => {});
    getModelCard().then(setCard).catch(() => {});
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    getGroups({ ...BASE, site_id: siteId, capacity_mw: capacity }, ctrl.signal)
      .then((g) => {
        setGroups(g);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [siteId, capacity]);

  const siteName = (s: FarmSite) => s.name.replace(" (reference site)", "");
  // Mark loading when the farm changes; the effect above fetches the new groups.
  const chooseSite = (id: string) => { setLoading(true); setSiteId(id); };
  const chooseCapacity = (mw: number) => { setLoading(true); setCapacity(mw); };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-sun text-[12px]">☀</span>
            SolarLeads
            <span className="ml-1 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted">Client portal</span>
          </Link>
          <Link href="/dashboard" className="text-[13px] text-muted transition-colors hover:text-ink">Analyst dashboard →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 pt-10 pb-16">
        <section>
          <h1 className="max-w-2xl text-[34px] leading-tight font-semibold tracking-tight">Your solar pitch plan</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-muted">
            Groups of nearby housing societies to pitch together, sized to fill your farm, and a live check for any
            society you are considering, with the reasons behind every score.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-muted">Farm site</span>
              {sites.length > 0 && (
                <Segmented size="sm" value={siteId} onChange={chooseSite}
                  options={sites.map((s) => ({ value: s.id, label: siteName(s) }))} />
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-muted">Capacity</span>
              <Segmented size="sm" value={capacity} onChange={chooseCapacity}
                options={CAPACITIES.map((c) => ({ value: c, label: `${c} MW` }))} />
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-800">
            Couldn&apos;t reach the SolarLeads service ({error}). Please try again in a moment.
          </div>
        )}

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[20px] font-semibold tracking-tight">Pitch these together</h2>
            {groups && (
              <p className="text-[13px] text-muted">
                Each group fills your {capacity} MW farm ({num(groups.capacity_kwh / 1000)} MWh a month), ranked by expected savings.
              </p>
            )}
          </div>
          <PitchGroups groups={groups?.groups ?? null} loading={loading} />
        </section>

        <section className="mt-14">
          <div className="mb-4">
            <h2 className="text-[20px] font-semibold tracking-tight">Check your own societies</h2>
            <p className="mt-1 text-[13px] text-muted">
              Enter a society, or upload a list. Each one is scored live by the same model, with the reasons it gave.
            </p>
          </div>
          <CheckSocieties card={card} />
        </section>

        <p className="mt-12 text-[12px] text-faint">
          Scores come from a logistic regression model trained on past pitch outcomes in the SolarLeads dataset.
          They are estimates to help prioritise outreach, not guarantees.
        </p>
      </main>
      <Toaster position="bottom-right" toastOptions={{ className: "!rounded-xl !border-0 !shadow-[var(--shadow-pop)] !text-[13px]" }} />
    </div>
  );
}
