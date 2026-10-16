"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import Reasons from "@/components/client/Reasons";
import { Button, Card, CardHeader, cx, Meter } from "@/components/ui";
import { classifyBatch, classifySociety } from "@/lib/api";
import { inrShort, num, pct } from "@/lib/format";
import type { ClassifyResult, ModelCard, SocietyInput } from "@/lib/types";

const DEFAULT: SocietyInput = {
  name: "",
  district: "Pune",
  current_provider: "MSEDCL",
  num_flats: 240,
  avg_monthly_consumption_kwh: 53000,
  current_tariff_rs_per_unit: 10.9,
  estimated_solar_tariff_rs_per_unit: 8.9,
  distance_to_solar_farm_km: 30,
  building_age_years: 20,
};

const NUMBERS: { key: keyof SocietyInput; label: string; unit: string; step: number }[] = [
  { key: "num_flats", label: "Flats", unit: "", step: 1 },
  { key: "avg_monthly_consumption_kwh", label: "Monthly use", unit: "kWh", step: 500 },
  { key: "current_tariff_rs_per_unit", label: "Pays today", unit: "₹/unit", step: 0.1 },
  { key: "estimated_solar_tariff_rs_per_unit", label: "Your solar rate", unit: "₹/unit", step: 0.1 },
  { key: "distance_to_solar_farm_km", label: "Distance to farm", unit: "km", step: 1 },
  { key: "building_age_years", label: "Building age", unit: "yrs", step: 1 },
];

// CSV columns: friendly names first, then the dataset's own column names, so both work.
const ALIASES: Record<string, keyof SocietyInput> = {
  name: "name", society: "name", society_name: "name",
  district: "district", city: "district",
  provider: "current_provider", current_provider: "current_provider",
  flats: "num_flats", num_flats: "num_flats",
  monthly_kwh: "avg_monthly_consumption_kwh", consumption: "avg_monthly_consumption_kwh", avg_monthly_consumption_kwh: "avg_monthly_consumption_kwh",
  tariff: "current_tariff_rs_per_unit", current_tariff: "current_tariff_rs_per_unit", current_tariff_rs_per_unit: "current_tariff_rs_per_unit",
  solar_tariff: "estimated_solar_tariff_rs_per_unit", estimated_solar_tariff_rs_per_unit: "estimated_solar_tariff_rs_per_unit",
  distance_km: "distance_to_solar_farm_km", distance: "distance_to_solar_farm_km", distance_to_solar_farm_km: "distance_to_solar_farm_km",
  building_age: "building_age_years", age: "building_age_years", building_age_years: "building_age_years",
};
const REQUIRED: (keyof SocietyInput)[] = ["district", "current_provider", "num_flats", "avg_monthly_consumption_kwh", "current_tariff_rs_per_unit"];
const TEMPLATE = [
  "name,district,provider,flats,monthly_kwh,tariff,solar_tariff,distance_km,building_age",
  "Green Park CHS,Pune,MSEDCL,320,68000,11.2,8.6,12,9",
  "Lake View Heights,Thane,Tata Power,180,31000,10.4,8.9,35,22",
].join("\n");

interface Entry {
  key: string;
  input: SocietyInput;
  result: ClassifyResult;
}

export default function CheckSocieties({ card }: { card: ModelCard | null }) {
  const [input, setInput] = useState<SocietyInput>(DEFAULT);
  const [live, setLive] = useState<ClassifyResult | null>(null);
  const [list, setList] = useState<Entry[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // Re-classify as the client types, cancelling requests a newer edit has superseded.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      classifySociety(input, ctrl.signal).then(setLive).catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [input]);

  const set = (patch: Partial<SocietyInput>) => setInput((s) => ({ ...s, ...patch }));

  const add = () => {
    if (!live) return;
    const name = input.name?.trim() || `Society ${list.length + 1}`;
    setList((l) => [{ key: crypto.randomUUID(), input: { ...input, name }, result: { ...live, name } }, ...l]);
    toast.success("Added to your list", { description: `${name} · ${pct(live.prob)} chance to sign` });
    set({ name: "" });
  };

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const { rows, skipped } = parseCsv(await f.text());
      if (rows.length === 0) {
        toast.error("No usable rows found", { description: "Check the column names against the template." });
        return;
      }
      const { results } = await classifyBatch(rows);
      setList((l) => [...results.map((r, i) => ({
        key: crypto.randomUUID(),
        input: rows[i],
        result: { ...r, name: rows[i].name || `Row ${i + 1}` },
      })), ...l]);
      toast.success(`Classified ${num(rows.length)} societies`, {
        description: skipped ? `${skipped} rows skipped for missing values.` : f.name,
      });
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "solarleads-societies-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = [...list].sort((a, b) => b.result.prob - a.result.prob);
  const likely = list.filter((e) => e.result.prob >= 0.5).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader title="Enter a society" hint="The model scores it as you type."
            action={<Button variant="ghost" size="sm" onClick={() => setInput(DEFAULT)}>Reset</Button>} />
          <div className="grid gap-x-4 gap-y-3.5 px-5 pb-5 sm:grid-cols-2">
            <Field label="Society name" className="sm:col-span-2">
              <input value={input.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Green Park CHS"
                className="h-9 w-full rounded-lg bg-subtle px-3 text-[14px] outline-none placeholder:text-faint focus:ring-2 focus:ring-sun/40" />
            </Field>
            <Field label="District">
              <Select value={input.district} options={card?.districts ?? [input.district]} onChange={(v) => set({ district: v })} />
            </Field>
            <Field label="Current electricity provider">
              <Select value={input.current_provider} options={card?.providers ?? [input.current_provider]}
                onChange={(v) => set({ current_provider: v })} />
            </Field>
            {NUMBERS.map((n) => (
              <Field key={n.key} label={n.label}>
                <div className="flex h-9 items-center rounded-lg bg-subtle pr-3 focus-within:ring-2 focus-within:ring-sun/40">
                  <input type="number" min={0} step={n.step} value={input[n.key] as number}
                    onChange={(e) => set({ [n.key]: Number(e.target.value) } as Partial<SocietyInput>)}
                    className="h-full w-full min-w-0 bg-transparent px-3 text-[14px] tabular-nums outline-none" />
                  {n.unit && <span className="text-[12px] text-faint">{n.unit}</span>}
                </div>
              </Field>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          {live ? (
            <>
              <div className="text-[12px] text-muted">{input.name?.trim() || "This society"}</div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className={cx("text-[48px] leading-none font-semibold tracking-tight tabular-nums", live.prob >= 0.5 ? "text-good" : "text-bad")}>
                  {pct(live.prob)}
                </span>
                <span className="text-[14px] font-medium">{live.prob >= 0.5 ? "Likely to sign" : "Unlikely to sign"}</span>
              </div>
              <Meter value={live.prob} color={live.prob >= 0.5 ? "var(--color-good)" : "var(--color-bad)"} className="mt-4" />
              <p className="mt-3 text-[13px] text-muted">
                Would save about <span className="font-medium text-ink">{inrShort(live.estimated_monthly_savings_rs)}</span> a month
                {input.num_flats > 0 && <> ({inrShort(live.estimated_monthly_savings_rs / input.num_flats)} per flat)</>}.
              </p>
              <h4 className="mt-6 mb-3 text-[11px] font-semibold tracking-[0.1em] text-faint uppercase">Why</h4>
              <Reasons reasons={live.reasons} />
              <div className="mt-auto pt-6">
                <Button variant="primary" className="w-full" onClick={add}>Add to my list</Button>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-[13px] text-muted">Scoring…</div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="My societies"
          hint={list.length ? `${num(list.length)} checked · ${num(likely)} likely to sign` : "Add societies above, or upload a CSV to check many at once."}
          action={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={downloadTemplate}>CSV template</Button>
              <input ref={file} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <Button size="sm" onClick={() => file.current?.click()} disabled={uploading}>
                {uploading ? "Classifying…" : "Upload CSV"}
              </Button>
              {list.length > 0 && <Button variant="ghost" size="sm" onClick={() => setList([])}>Clear</Button>}
            </div>
          } />
        {sorted.length === 0 ? (
          <div className="border-t border-line px-5 py-12 text-center text-[13px] text-muted">Nothing here yet.</div>
        ) : (
          <ul className="border-t border-line">
            {sorted.map((e) => {
              const isOpen = open === e.key;
              const top = e.result.reasons[0];
              return (
                <li key={e.key} className="border-b border-line/70 last:border-0">
                  <button onClick={() => setOpen(isOpen ? null : e.key)}
                    className="grid w-full grid-cols-[1fr_140px_110px_20px] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-subtle max-md:grid-cols-[1fr_110px_20px]">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{e.result.name}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {e.input.district} · {num(e.input.num_flats)} flats{top ? ` · ${top.feature.toLowerCase()} ${top.effect === "up" ? "helps" : "hurts"} most` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2.5">
                      <span className={cx("w-9 text-[13px] font-medium tabular-nums", e.result.prob >= 0.5 ? "text-good" : "text-bad")}>{pct(e.result.prob)}</span>
                      <Meter value={e.result.prob} color={e.result.prob >= 0.5 ? "var(--color-good)" : "var(--color-bad)"} className="flex-1" />
                    </span>
                    <span className="text-right text-[13px] tabular-nums max-md:hidden">{inrShort(e.result.estimated_monthly_savings_rs)}/mo</span>
                    <span className={cx("text-faint transition-transform duration-200", isOpen && "rotate-90")}>›</span>
                  </button>
                  {isOpen && (
                    <div className="animate-fade-up px-5 pt-1 pb-4"><Reasons reasons={e.result.reasons} /></div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[12px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg bg-subtle px-2.5 text-[14px] outline-none focus:ring-2 focus:ring-sun/40">
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

/** Minimal CSV parser (handles quoted fields) mapped onto the model's inputs. */
function parseCsv(text: string): { rows: SocietyInput[]; skipped: number } {
  const records = splitCsv(text.trim());
  if (records.length < 2) return { rows: [], skipped: 0 };
  const header = records[0].map((h) => ALIASES[h.trim().toLowerCase().replace(/\s+/g, "_")]);
  const rows: SocietyInput[] = [];
  let skipped = 0;
  for (const rec of records.slice(1)) {
    if (rec.every((c) => c.trim() === "")) continue;
    const row: Record<string, string> = {};
    header.forEach((key, i) => { if (key && rec[i] !== undefined) row[key] = rec[i].trim(); });
    if (REQUIRED.some((k) => !row[k])) {
      skipped++;
      continue;
    }
    const n = (k: keyof SocietyInput, fallback: number) => {
      const v = Number(row[k]);
      return Number.isFinite(v) && row[k] !== undefined && row[k] !== "" ? v : fallback;
    };
    rows.push({
      name: row.name,
      district: row.district,
      current_provider: row.current_provider,
      num_flats: n("num_flats", 0),
      avg_monthly_consumption_kwh: n("avg_monthly_consumption_kwh", 0),
      current_tariff_rs_per_unit: n("current_tariff_rs_per_unit", 0),
      estimated_solar_tariff_rs_per_unit: n("estimated_solar_tariff_rs_per_unit", DEFAULT.estimated_solar_tariff_rs_per_unit),
      distance_to_solar_farm_km: n("distance_to_solar_farm_km", DEFAULT.distance_to_solar_farm_km),
      building_age_years: n("building_age_years", DEFAULT.building_age_years),
    });
  }
  // The API needs positive values; drop rows that would be rejected.
  const valid = rows.filter((r) => r.num_flats > 0 && r.avg_monthly_consumption_kwh > 0 && r.current_tariff_rs_per_unit > 0);
  return { rows: valid.slice(0, 1000), skipped: skipped + rows.length - valid.length };
}

function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell);
  out.push(row);
  return out;
}
