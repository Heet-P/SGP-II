"use client";

import { useEffect, useState } from "react";

import { Button, Icon } from "@/components/ui";
import { getDataset } from "@/lib/api";
import { num } from "@/lib/format";
import type { DatasetPage, DatasetRow } from "@/lib/types";

const PAGE_SIZE = 25;

const COLUMN_LABELS: Record<string, string> = {
  role: "Role in demo",
  society_id: "Society ID",
  society_name: "Society",
  city: "City",
  district: "District",
  pincode: "Pincode",
  num_flats: "Flats",
  avg_monthly_consumption_kwh: "Consumption (kWh/mo)",
  current_provider: "Provider",
  current_tariff_rs_per_unit: "Tariff (₹/unit)",
  distance_to_solar_farm_km: "Distance (km)",
  building_age_years: "Age (yrs)",
  estimated_solar_tariff_rs_per_unit: "Solar tariff (₹/unit)",
  estimated_monthly_savings_rs: "Est. savings (₹/mo)",
  secretary_name: "Secretary",
  secretary_phone: "Phone",
  secretary_email: "Email",
  pitch_priority_score: "Priority score",
  pitch_outcome: "Outcome",
};

const ROLES = [
  { id: "Train", color: "#64748b", bg: "#f1f5f9", text: "The model learns from these rows. They never appear in the live stream." },
  { id: "Held-out", color: "#7c3aed", bg: "#f5f3ff", text: "Hidden during training. Streamed live and checked against their real outcome." },
  { id: "Pending", color: "#0284c7", bg: "#f0f9ff", text: "Not pitched yet, so no outcome. Streamed live and scored as new leads." },
] as const;

const OUTCOME_COLORS: Record<string, string> = { Converted: "#16a34a", Rejected: "#dc2626", Pending: "#0284c7" };

/** `embedded`: shown inside the app shell, which already supplies the page title. */
export default function DatasetReview({ started, onStart, embedded = false }: {
  started: boolean;
  onStart: () => void;
  embedded?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("");
  const [role, setRole] = useState("");
  const [data, setData] = useState<DatasetPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      getDataset({ page, page_size: PAGE_SIZE, q, outcome, role }, ctrl.signal)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [page, q, outcome, role]);

  // Any filter change goes back to the first page.
  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const pages = data ? Math.max(1, Math.ceil(data.matching / PAGE_SIZE)) : 1;
  const columns = data ? ["role", ...data.columns.filter((c) => c !== "role")] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {!embedded && (
            <>
              <div className="text-[12px] font-medium text-sun-ink">Step 1 of 2 · Review the data</div>
              <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight">The dataset the model works from</h1>
            </>
          )}
          <p className="mt-1 text-[14px] text-muted">
            <span className="font-mono text-[13px]">maharashtra_solar_societies_synthetic.csv</span>
            {data && <> · {num(data.total)} rows · {data.columns.length - 1} columns</>}
          </p>
        </div>
        <StartButton started={started} onStart={onStart} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Couldn&apos;t load the dataset ({error}). Is the backend running?
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {ROLES.map((r) => {
          const active = role === r.id;
          return (
            <button key={r.id} onClick={() => filter(() => setRole(active ? "" : r.id))}
              className={`rounded-2xl bg-surface p-4 text-left shadow-card transition-[box-shadow,transform] duration-150 active:scale-[0.99] ${active ? "ring-2" : "hover:bg-subtle"}`}
              style={{ ["--tw-ring-color" as string]: r.color }}>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.id}
                </span>
                <span className="text-[22px] font-semibold tracking-tight tabular-nums">{data ? num(data.counts.role[r.id] ?? 0) : "—"}</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{r.text}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <input value={q} onChange={(e) => filter(() => setQ(e.target.value))} placeholder="Search society, city or ID…"
            className="w-64 rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-sun" />
          <select value={outcome} onChange={(e) => filter(() => setOutcome(e.target.value))}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-sun">
            <option value="">All outcomes</option>
            {["Converted", "Rejected", "Pending"].map((o) => (
              <option key={o} value={o}>{o}{data ? ` (${num(data.counts.outcome[o] ?? 0)})` : ""}</option>
            ))}
          </select>
          <select value={role} onChange={(e) => filter(() => setRole(e.target.value))}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-sun">
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
          </select>
          <span className="ml-auto text-sm text-muted">
            {data && <>Showing <b className="text-ink">{num(data.matching)}</b> of {num(data.total)} rows</>}
          </span>
        </div>

        <div className="max-h-[560px] overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-canvas">
              <tr>
                <th className="border-b border-line px-3 py-2.5 text-right font-medium text-muted">#</th>
                {columns.map((c) => (
                  <th key={c} className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-medium text-muted">
                    {COLUMN_LABELS[c] ?? c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((row, i) => (
                <tr key={String(row.society_id)} className="hover:bg-sun-soft/40">
                  <td className="border-b border-line/70 px-3 py-2 text-right text-xs text-muted tabular-nums">
                    {num((page - 1) * PAGE_SIZE + i + 1)}
                  </td>
                  {columns.map((c) => (
                    <td key={c} className="whitespace-nowrap border-b border-line/70 px-3 py-2">
                      <Cell column={c} row={row} />
                    </td>
                  ))}
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="px-3 py-10 text-center text-muted">No rows match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
          <span className="text-muted">Page {num(page)} of {num(pages)}</span>
          <div className="flex gap-2">
            <PageButton disabled={page <= 1} onClick={() => setPage(1)}>« First</PageButton>
            <PageButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</PageButton>
            <PageButton disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next ›</PageButton>
            <PageButton disabled={page >= pages} onClick={() => setPage(pages)}>Last »</PageButton>
          </div>
        </div>
      </div>

      <div className="flex justify-end"><StartButton started={started} onStart={onStart} /></div>
    </div>
  );
}

function Cell({ column, row }: { column: string; row: DatasetRow }) {
  const v = row[column];
  if (column === "role") {
    const r = ROLES.find((x) => x.id === v)!;
    return <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: r.color, background: r.bg }}>{v}</span>;
  }
  if (column === "pitch_outcome") {
    return <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: OUTCOME_COLORS[v as string] }}>{v}</span>;
  }
  if (column === "society_name") return <span className="font-medium">{v}</span>;
  if (column === "society_id" || column === "pincode") return <span className="font-mono text-xs">{v}</span>;
  if (column.endsWith("_rs_per_unit")) return <span className="tabular-nums">{Number(v).toFixed(2)}</span>;
  if (typeof v === "number") {
    const text = Number.isInteger(v) ? num(v) : v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return <span className="tabular-nums">{text}</span>;
  }
  return <>{v}</>;
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="rounded-md border border-line px-2.5 py-1 font-medium hover:bg-canvas disabled:opacity-40">
      {children}
    </button>
  );
}

function StartButton({ started, onStart }: { started: boolean; onStart: () => void }) {
  return (
    <Button variant="primary" onClick={onStart} className="h-10 px-4">
      {started ? <>Back to live model <Icon.arrow /></> : <><Icon.play /> Start live classification</>}
    </Button>
  );
}
