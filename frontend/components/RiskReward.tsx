"use client";

import {
  CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { inr, inrShort, pct } from "@/lib/format";
import { QUADRANTS } from "@/lib/quadrants";
import type { ScenarioResult, Society } from "@/lib/types";

export default function RiskReward({ result }: { result: ScenarioResult }) {
  const eligible = result.societies.filter((s) => s.eligible);
  const cut = result.reward_cut;
  const ymax = Math.max(cut, ...eligible.map((s) => s.monthly_savings), 1) * 1.08;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_250px]">
      <div className="h-[600px] rounded-xl border border-line bg-surface p-4 pt-6">
        {eligible.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 16 }}>
              <ReferenceArea x1={0.5} x2={1} y1={cut} y2={ymax} fill={QUADRANTS.Prime.color} fillOpacity={0.05}
                label={{ value: "PRIME", position: "insideTopRight", fill: QUADRANTS.Prime.color, fontSize: 12, fontWeight: 600 }} />
              <ReferenceArea x1={0} x2={0.5} y1={cut} y2={ymax} fill={QUADRANTS.Nurture.color} fillOpacity={0.05}
                label={{ value: "NURTURE", position: "insideTopLeft", fill: QUADRANTS.Nurture.color, fontSize: 12, fontWeight: 600 }} />
              <ReferenceArea x1={0.5} x2={1} y1={0} y2={cut} fill={QUADRANTS["Easy win"].color} fillOpacity={0.04}
                label={{ value: "EASY WIN", position: "insideBottomRight", fill: QUADRANTS["Easy win"].color, fontSize: 12, fontWeight: 600 }} />
              <ReferenceArea x1={0} x2={0.5} y1={0} y2={cut} fill="#94a3b8" fillOpacity={0.05}
                label={{ value: "DEPRIORITISE", position: "insideBottomLeft", fill: "#64748b", fontSize: 12, fontWeight: 600 }} />
              <CartesianGrid stroke="#eeece6" />
              <XAxis type="number" dataKey="prob" domain={[0, 1]} tickFormatter={pct} tick={{ fontSize: 12 }}
                label={{ value: "Conversion probability  (lower risk →)", position: "bottom", offset: 10, fontSize: 13, fill: "#6b6f7b" }} />
              <YAxis type="number" dataKey="monthly_savings" domain={[0, ymax]} tickFormatter={inrShort}
                tick={{ fontSize: 12 }} width={64}
                label={{ value: "Society savings / month (reward)", angle: -90, position: "insideLeft", offset: -6, fontSize: 13, fill: "#6b6f7b", style: { textAnchor: "middle" } }} />
              <ReferenceLine x={0.5} stroke="#9aa0ac" strokeDasharray="4 4" />
              <ReferenceLine y={cut} stroke="#9aa0ac" strokeDasharray="4 4" />
              <Tooltip content={PointTooltip} cursor={{ strokeDasharray: "3 3" }} />
              {Object.entries(QUADRANTS).map(([name, q]) => (
                <Scatter
                  key={name}
                  name={name}
                  isAnimationActive={false}
                  data={eligible.filter((s) => s.quadrant === name)}
                  shape={(p: { cx?: number; cy?: number; payload?: Society }) => (
                    <circle cx={p.cx} cy={p.cy} r={p.payload?.selected ? 6.5 : 4} fill={q.color}
                      fillOpacity={p.payload?.selected ? 0.95 : 0.55}
                      stroke={p.payload?.selected ? "#14161c" : "none"} strokeWidth={1.5} />
                  )}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      <aside className="space-y-4 rounded-xl border border-line bg-surface p-5 text-sm">
        <h3 className="font-semibold">How to read this</h3>
        {Object.entries(QUADRANTS).map(([name, q]) => (
          <div key={name}>
            <div className="flex items-center gap-2 font-medium">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: q.color }} />
              {name}
            </div>
            <p className="mt-0.5 pl-4.5 text-xs text-muted">{q.desc}</p>
          </div>
        ))}
        <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
          Outlined dots are in the allocation. Reward split is the median saving of eligible societies
          ({inrShort(cut)}); risk split is a 50% conversion chance.
        </p>
      </aside>
    </div>
  );
}

function PointTooltip({ active, payload }: TooltipContentProps) {
  const s = payload?.[0]?.payload as Society | undefined;
  if (!active || !s) return null;
  return (
    <div className="rounded-lg bg-panel px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-[13px] font-semibold">{s.name}</div>
      <div className="text-panel-muted">{s.city} · {s.distance_km} km</div>
      <div className="mt-1">Converts {pct(s.prob)} · saves {inr(s.monthly_savings)}/mo</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted">
      No eligible societies in this scenario. Try relaxing the filters.
    </div>
  );
}
