"use client";

import { useState } from "react";

import Contributions from "@/components/Contributions";
import { inr, inrShort, num, pct } from "@/lib/format";
import { quadrantColor } from "@/lib/quadrants";
import type { Lead, ScenarioResult, Society } from "@/lib/types";

interface Props {
  result: ScenarioResult;
  byId: Map<string, Society>;
  onLocate: (id: string) => void;
}

export default function LeadCards({ result, byId, onLocate }: Props) {
  const [count, setCount] = useState(8);
  const leads = result.top_leads.slice(0, count);

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-muted">
        No society fits this scenario. Try lowering the markup or widening the distance limit.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        Showing top
        {[5, 8, 12, 20].map((n) => (
          <button key={n} onClick={() => setCount(n)}
            className={`rounded-md px-2.5 py-1 font-medium ${count === n ? "bg-ink text-white" : "bg-surface border border-line hover:text-ink"}`}>
            {n}
          </button>
        ))}
        <span>of {result.kpis.selected_count} allocated</span>
      </div>
      <div className="space-y-3">
        {leads.map((lead, i) => {
          const s = byId.get(lead.id);
          return s ? <Card key={lead.id} rank={i + 1} s={s} lead={lead} onLocate={onLocate} /> : null;
        })}
      </div>
    </div>
  );
}

function Card({ rank, s, lead, onLocate }: { rank: number; s: Society; lead: Lead; onLocate: (id: string) => void }) {
  return (
    <article className="grid gap-5 rounded-xl border border-line bg-surface p-5 lg:grid-cols-[1.1fr_1.2fr_1.3fr]">
      <div>
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sun-soft text-sm font-semibold text-[#8a6400]">
            {rank}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold tracking-tight">{s.name}</h3>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: quadrantColor(s.quadrant) }}>
                {s.quadrant}
              </span>
              {s.city} · {s.provider}
            </div>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Converts" value={pct(s.prob)} />
          <Stat label="Saves / month" value={inrShort(s.monthly_savings)} />
          <Stat label="Flats" value={num(s.num_flats)} />
          <Stat label="Distance" value={`${Math.round(s.distance_km)} km`} />
        </dl>
        <button onClick={() => onLocate(s.id)} className="mt-4 text-xs font-medium text-[#8a6400] hover:underline">
          Show on map →
        </button>
      </div>

      <Contributions items={lead.contributions} />

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Suggested pitch</h4>
        <blockquote className="rounded-lg border-l-4 border-sun bg-sun-soft/60 px-4 py-3 text-sm leading-relaxed">
          “Your {s.active_flats} households could save about <b>{inr(s.savings_per_flat)} per flat every month</b>,
          roughly <b>{inrShort(s.monthly_savings * 12)} a year</b> for the society. You pay ₹{s.tariff.toFixed(2)}/unit
          to {s.provider} today; our solar rate is ₹{s.offer.toFixed(2)}/unit.”
        </blockquote>
        <div className="mt-3 space-y-1 text-[13px]">
          <div><span className="text-muted">Main strength:</span> <b>{lead.strength.toLowerCase()}</b></div>
          <div><span className="text-muted">Watch out for:</span> <b>{lead.weakness?.toLowerCase() ?? "nothing major"}</b></div>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
