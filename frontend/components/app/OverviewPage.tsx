"use client";

import dynamic from "next/dynamic";

import { Button, Card, CardHeader, Icon, Meter, Stat, StatGroup } from "@/components/ui";
import { inrShort, num, pct } from "@/lib/format";
import { quadrantColor } from "@/lib/quadrants";
import type { ScenarioResult, Society } from "@/lib/types";

// MapLibre needs `window`, so the map only renders in the browser.
const LeadMap = dynamic(() => import("@/components/LeadMap"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-subtle" />,
});

interface Props {
  result: ScenarioResult;
  focusId: string | null;
  onSelect: (s: Society) => void;
  onViewLeads: () => void;
}

/** The one-glance view: four numbers, where the leads are, and who to call first. */
export default function OverviewPage({ result, focusId, onSelect, onViewLeads }: Props) {
  const { kpis, allocation } = result;
  const used = kpis.capacity_kwh ? kpis.used_kwh / kpis.capacity_kwh : 0;
  const greedyUsed = kpis.capacity_kwh ? allocation.greedy_used_kwh / kpis.capacity_kwh : 0;
  const gain = allocation.greedy_expected_value ? allocation.expected_value / allocation.greedy_expected_value - 1 : 0;
  // Allocated societies first, then the best ones left out (the optimiser can skip a
  // high-ranked society that does not fit well, so this is not simply the top of the ranking).
  const eligible = result.societies.filter((s) => s.eligible).sort((a, b) => a.rank - b.rank);
  const chosen = eligible.filter((s) => s.selected);
  const top = [...chosen, ...eligible.filter((s) => !s.selected)].slice(0, 8);
  const firstWaiting = chosen.length < top.length ? chosen.length : -1;
  const byId = new Map(result.societies.map((s) => [s.id, s]));
  const excluded = Object.entries(result.exclusions).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <StatGroup>
        <Stat label="Societies to pitch" value={kpis.selected_count} format={(v) => num(Math.round(v))}
          hint={`of ${num(kpis.eligible_count)} eligible`} />
        <Stat label="Savings for societies" value={kpis.monthly_savings_rs} format={inrShort}
          hint={`per month · ${inrShort(kpis.monthly_savings_rs * 12)} a year`} />
        <Stat label="Farm capacity used" value={used} format={pct}>
          <Meter value={used} color="var(--color-sun)" className="mt-3" />
        </Stat>
        <Stat label="Average chance to convert" value={kpis.avg_conversion} format={pct}
          hint={`${num(kpis.flats_reached)} households reached`} />
      </StatGroup>

      {excluded.length > 0 && (
        <p className="px-1 text-[13px] text-muted">
          {num(kpis.total_count - kpis.eligible_count)} societies excluded:{" "}
          {excluded.map(([reason, n], i) => (
            <span key={reason}>{i > 0 && ", "}<span className="text-ink tabular-nums">{num(n)}</span> {reason.toLowerCase()}</span>
          ))}.
        </p>
      )}
      {allocation.method.startsWith("ILP") && kpis.selected_count > 0 && (
        <p className="-mt-2 px-1 text-[13px] text-muted">
          Farm filled by integer linear programming (0/1 knapsack):{" "}
          <span className="text-ink tabular-nums">{inrShort(allocation.expected_value)}</span> expected value a month
          {allocation.greedy_count === 0
            ? <>. A simple greedy fill would pick none: the top society alone is larger than the farm.</>
            : gain >= 0.005
              ? <>, <span className="font-medium text-good tabular-nums">+{pct(gain)}</span> over a simple greedy fill
                  (which uses {pct(greedyUsed)} of the farm).</>
              : <>, the same as a simple greedy fill.</>}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="h-[560px]">
            <LeadMap result={result} focusId={focusId}
              onFocus={(id) => { const s = id ? byId.get(id) : undefined; if (s) onSelect(s); }} />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Pitch these first" hint="Best total expected value for the farm"
            action={<Button variant="ghost" size="sm" onClick={onViewLeads}>All leads <Icon.arrow /></Button>} />
          <ol className="flex-1 px-2 pb-2">
            {top.length === 0 && (
              <li className="px-3 py-10 text-center text-[13px] text-muted">
                No society fits this scenario. Try a lower markup or a wider distance limit.
              </li>
            )}
            {top.map((s, i) => (
              <li key={s.id}>
                {i === firstWaiting && (
                  <div className="mx-3 mt-2 mb-1 border-t border-line pt-3 text-[11px] font-medium tracking-wide text-faint uppercase">
                    Next in line · not in the best mix for this farm
                  </div>
                )}
                <button onClick={() => onSelect(s)}
                  className={`group grid w-full grid-cols-[20px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-subtle ${s.selected ? "" : "opacity-60 hover:opacity-100"}`}>
                  <span className="text-[12px] text-faint tabular-nums">{s.rank}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: quadrantColor(s.quadrant) }} />
                      {s.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">
                      {s.city} · saves {inrShort(s.monthly_savings)}/mo
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-medium tabular-nums">{pct(s.prob)}</span>
                    <Meter value={s.prob} className="mt-1 w-12" />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
