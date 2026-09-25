"use client";

import { useMemo, useState } from "react";

import RiskReward from "@/components/RiskReward";
import { Button, Card, cx, Icon, Meter, Segmented, Tag } from "@/components/ui";
import { inrShort, num, pct } from "@/lib/format";
import { QUADRANTS, quadrantColor } from "@/lib/quadrants";
import type { Quadrant, ScenarioResult, Society } from "@/lib/types";

type SortKey = "rank" | "prob" | "monthly_savings" | "distance_km";
const PAGE = 40;

interface Props {
  result: ScenarioResult;
  onSelect: (s: Society) => void;
}

/** Every eligible society, ranked; filter, sort and open any row for detail. */
export default function LeadsPage({ result, onSelect }: Props) {
  const [view, setView] = useState<"table" | "chart">("table");
  const [query, setQuery] = useState("");
  const [quadrant, setQuadrant] = useState<"all" | Quadrant>("all");
  const [allocatedOnly, setAllocatedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "rank", desc: false });
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = result.societies.filter((s) =>
      s.eligible
      && (quadrant === "all" || s.quadrant === quadrant)
      && (!allocatedOnly || s.selected)
      && (!q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)));
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => (a[sort.key] - b[sort.key]) * dir);
  }, [result.societies, query, quadrant, allocatedOnly, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    result.societies.forEach((s) => {
      if (!s.eligible) return;
      c.all += 1;
      c[s.quadrant] = (c[s.quadrant] ?? 0) + 1;
    });
    return c;
  }, [result.societies]);

  const toggleSort = (key: SortKey) => {
    setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: key !== "rank" && key !== "distance_km" }));
    setLimit(PAGE);
  };

  const filters: { value: "all" | Quadrant; label: React.ReactNode }[] = [
    { value: "all", label: <>All <Count n={counts.all} /></> },
    ...Object.entries(QUADRANTS).map(([name, q]) => ({
      value: name as Quadrant,
      label: <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: q.color }} />{name} <Count n={counts[name] ?? 0} /></span>,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative">
          <Icon.search className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            placeholder="Search society or city"
            className="h-8 w-56 rounded-lg bg-surface pr-3 pl-8 text-[13px] shadow-card outline-none placeholder:text-faint focus:ring-2 focus:ring-sun/40" />
        </label>
        <div className="overflow-x-auto">
          <Segmented size="sm" options={filters} value={quadrant} onChange={(v) => { setQuadrant(v); setLimit(PAGE); }} />
        </div>
        <button onClick={() => { setAllocatedOnly((v) => !v); setLimit(PAGE); }}
          className={cx("h-7 rounded-lg px-2.5 text-[12px] font-medium transition-colors duration-150",
            allocatedOnly ? "bg-ink text-white" : "bg-surface text-muted shadow-card hover:text-ink")}>
          In allocation only
        </button>
        <div className="ml-auto">
          <Segmented size="sm" value={view} onChange={setView}
            options={[{ value: "table", label: "Table" }, { value: "chart", label: "Chart" }]} />
        </div>
      </div>

      {view === "chart" ? (
        <Card><RiskReward result={result} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <Th onClick={() => toggleSort("rank")} active={sort.key === "rank"} desc={sort.desc} className="w-14 pl-5">#</Th>
                  <th className="py-2.5 font-medium">Society</th>
                  <th className="py-2.5 font-medium">Segment</th>
                  <Th onClick={() => toggleSort("prob")} active={sort.key === "prob"} desc={sort.desc}>Chance</Th>
                  <Th onClick={() => toggleSort("monthly_savings")} active={sort.key === "monthly_savings"} desc={sort.desc} align="right">Saves / mo</Th>
                  <Th onClick={() => toggleSort("distance_km")} active={sort.key === "distance_km"} desc={sort.desc} align="right">Distance</Th>
                  <th className="py-2.5 pr-5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((s) => (
                  <tr key={s.id} onClick={() => onSelect(s)}
                    className="cursor-pointer border-b border-line/70 transition-colors duration-100 last:border-0 hover:bg-subtle">
                    <td className="py-2.5 pl-5 text-faint tabular-nums">{s.rank}</td>
                    <td className="py-2.5">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-[12px] text-muted">{s.city} · {num(s.num_flats)} flats</div>
                    </td>
                    <td className="py-2.5"><Tag color={quadrantColor(s.quadrant)}>{s.quadrant}</Tag></td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 tabular-nums">{pct(s.prob)}</span>
                        <Meter value={s.prob} className="w-14" />
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{inrShort(s.monthly_savings)}</td>
                    <td className="py-2.5 text-right text-muted tabular-nums">{Math.round(s.distance_km)} km</td>
                    <td className="py-2.5 pr-5 text-right">
                      {s.selected
                        ? <span className="rounded-md bg-sun-soft px-1.5 py-0.5 text-[11px] font-medium text-sun-ink">Allocated</span>
                        : <span className="text-[12px] text-faint">Over capacity</span>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="py-14 text-center text-muted">No societies match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12px] text-muted">
              Showing {num(limit)} of {num(rows.length)}
              <Button size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-faint tabular-nums">{num(n)}</span>;
}

function Th({ children, onClick, active, desc, align = "left", className }: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  desc: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th className={cx("py-2.5 font-medium", align === "right" && "text-right", className)}>
      <button onClick={onClick} className={cx("inline-flex items-center gap-1 transition-colors hover:text-ink", active && "text-ink")}>
        {children}
        <span className={cx("text-[10px] transition-opacity", active ? "opacity-100" : "opacity-0")}>{desc ? "↓" : "↑"}</span>
      </button>
    </th>
  );
}
