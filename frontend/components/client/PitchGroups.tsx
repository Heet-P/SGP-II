"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button, Card, cx, Icon, Meter } from "@/components/ui";
import { inrShort, num, pct } from "@/lib/format";
import type { PitchGroup } from "@/lib/types";

const RISK_STYLE: Record<PitchGroup["risk"], string> = {
  "Low risk": "bg-green-50 text-green-800",
  "Medium risk": "bg-amber-50 text-amber-800",
  "High risk": "bg-red-50 text-red-800",
};

/** Recommended groups of nearby societies to pitch together, best first. */
export default function PitchGroups({ groups, loading }: { groups: PitchGroup[] | null; loading: boolean }) {
  if (!groups) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-[480px] animate-pulse rounded-2xl bg-subtle" />)}
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <Card className="px-6 py-14 text-center text-[14px] text-muted">
        No group fits this farm. Try another site or a larger capacity.
      </Card>
    );
  }
  return (
    <div className={cx("grid gap-4 transition-opacity duration-200 md:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
      {groups.map((g) => <GroupCard key={`${g.rank}-${g.area}-${g.size}`} g={g} />)}
    </div>
  );
}

function GroupCard({ g }: { g: PitchGroup }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? g.members : g.members.slice(0, 4);

  const copy = async () => {
    const lines = [
      `Pitch group ${g.rank} · ${g.area} (${g.risk}, ${g.reward})`,
      `${g.size} societies · ${num(g.flats)} flats · fills ${pct(g.fill)} of the farm`,
      `Expected to sign: ${g.expected_signups.toFixed(1)} of ${g.size} · combined savings ${inrShort(g.monthly_savings)}/month`,
      `Simulated (${num(g.simulation.runs)} rounds): ${g.simulation.signups_low}–${g.simulation.signups_high} of ${g.size} sign 9 times out of 10`,
      "",
      ...g.members.map((m) => `- ${m.name}, ${m.city}: ${pct(m.prob)} chance, saves ${inrShort(m.monthly_savings)}/month`),
    ];
    await navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
    toast.success(`Group ${g.rank} brief copied`, { description: `${g.size} societies in ${g.area}` });
  };

  return (
    <Card className="flex flex-col">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-muted">Group {g.rank}</span>
          <span className="flex gap-1.5">
            <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-medium", RISK_STYLE[g.risk])}>{g.risk}</span>
            <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              g.reward === "High reward" ? "bg-sun-soft text-sun-ink" : "bg-subtle text-muted")}>{g.reward}</span>
          </span>
        </div>
        <h3 className="mt-1.5 text-[20px] font-semibold tracking-tight">{g.area}</h3>
        <p className="text-[13px] text-muted">{g.size} societies · {num(g.flats)} flats · {Math.round(g.distance_km)} km from the farm</p>
      </div>

      <dl className="mt-5 grid grid-cols-3 border-y border-line">
        <Figure label="Likely to sign" value={`${g.expected_signups.toFixed(1)}`} sub={`of ${g.size}`} />
        <Figure label="Saves / month" value={inrShort(g.monthly_savings)} sub="combined" border />
        <Figure label="Farm filled" value={pct(g.fill)} border>
          <Meter value={g.fill} color="var(--color-sun)" className="mt-2" />
        </Figure>
      </dl>

      <ol className="px-2 pt-3">
        {shown.map((m) => (
          <li key={m.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{m.name}</span>
              <span className="block truncate text-[12px] text-muted">{num(m.num_flats)} flats · saves {inrShort(m.monthly_savings)}/mo</span>
            </span>
            <span className="flex items-center gap-2">
              <Meter value={m.prob} color={m.prob >= 0.5 ? "var(--color-good)" : "var(--color-bad)"} className="w-10" />
              <span className="w-9 text-right text-[13px] tabular-nums">{pct(m.prob)}</span>
            </span>
          </li>
        ))}
      </ol>
      {g.members.length > 4 && (
        <button onClick={() => setExpanded((v) => !v)}
          className="mx-5 mt-1 self-start text-[12px] font-medium text-muted transition-colors hover:text-ink">
          {expanded ? "Show fewer" : `+ ${g.members.length - 4} more societies`}
        </button>
      )}

      <Simulation g={g} />

      <div className="mt-4 flex-1 px-5">
        <h4 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-faint uppercase">Why pitch them together</h4>
        <ul className="space-y-1.5">
          {g.why.map((w) => (
            <li key={w} className="flex gap-2 text-[13px] leading-snug">
              <span className="mt-0.5 text-good">✓</span><span>{w}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex justify-end border-t border-line px-5 py-3">
        <Button size="sm" onClick={copy}><Icon.copy /> Copy group brief</Button>
      </div>
    </Card>
  );
}

/** Monte Carlo result: how many societies signed across the simulated pitch rounds. */
function Simulation({ g }: { g: PitchGroup }) {
  const s = g.simulation;
  const peak = Math.max(...s.distribution);
  return (
    <div className="mx-5 mt-4 rounded-xl bg-subtle px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[11px] font-semibold tracking-[0.1em] text-faint uppercase">If you pitch them</h4>
        <span className="text-[11px] text-faint">{num(s.runs)} simulated rounds</span>
      </div>
      <div className="mt-2.5 flex h-12 items-end gap-[2px]" aria-hidden>
        {s.distribution.map((share, k) => (
          <div key={k} className={cx("flex-1 rounded-[2px]",
            k >= s.signups_low && k <= s.signups_high ? "bg-sun" : "bg-line-strong")}
            style={{ height: `${Math.max(share / peak, 0.04) * 100}%` }}
            title={`${k} sign: ${pct(share)} of rounds`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint tabular-nums">
        <span>0 sign</span><span>all {g.size}</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug">
        <span className="font-medium tabular-nums">{s.signups_low}–{s.signups_high} of {g.size}</span> sign 9 times out of 10.
        The farm ends up at least half full in <span className="font-medium tabular-nums">{pct(s.chance_half_full)}</span> of rounds.
      </p>
    </div>
  );
}

function Figure({ label, value, sub, border, children }: {
  label: string;
  value: string;
  sub?: string;
  border?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cx("px-5 py-3.5", border && "border-l border-line")}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-1 text-[20px] leading-none font-semibold tracking-tight tabular-nums">{value}</dd>
      {sub && <dd className="mt-1 text-[11px] text-muted">{sub}</dd>}
      {children}
    </div>
  );
}
