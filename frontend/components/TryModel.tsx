"use client";

import { useEffect, useState } from "react";

import Contributions from "@/components/Contributions";
import ProbGauge from "@/components/ProbGauge";
import { classifySociety } from "@/lib/api";
import { inr, num } from "@/lib/format";
import type { ClassifyResult, ModelCard, SocietyInput } from "@/lib/types";

// Start near the dataset's typical society.
const DEFAULT: SocietyInput = {
  district: "Pune",
  current_provider: "MSEDCL",
  num_flats: 240,
  avg_monthly_consumption_kwh: 53000,
  current_tariff_rs_per_unit: 10.9,
  estimated_solar_tariff_rs_per_unit: 8.9,
  distance_to_solar_farm_km: 30,
  building_age_years: 20,
};

const RANGES: { key: keyof SocietyInput; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: "num_flats", label: "Flats", min: 30, max: 450, step: 5, fmt: (v) => num(v) },
  { key: "avg_monthly_consumption_kwh", label: "Monthly consumption", min: 2500, max: 200000, step: 500, fmt: (v) => `${num(v)} kWh` },
  { key: "current_tariff_rs_per_unit", label: "Current tariff", min: 8.3, max: 13.8, step: 0.1, fmt: (v) => `₹${v.toFixed(2)}` },
  { key: "estimated_solar_tariff_rs_per_unit", label: "Solar tariff offered", min: 6.5, max: 11.7, step: 0.1, fmt: (v) => `₹${v.toFixed(2)}` },
  { key: "distance_to_solar_farm_km", label: "Distance to farm", min: 1, max: 180, step: 1, fmt: (v) => `${v} km` },
  { key: "building_age_years", label: "Building age", min: 1, max: 39, step: 1, fmt: (v) => `${v} yrs` },
];

export default function TryModel({ card }: { card: ModelCard | null }) {
  const [input, setInput] = useState(DEFAULT);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      classifySociety(input, ctrl.signal)
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [input]);

  const set = (patch: Partial<SocietyInput>) => setInput((s) => ({ ...s, ...patch }));

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold">Try it: classify a society that isn&apos;t in the dataset</h3>
          <p className="text-xs text-muted">Every change goes to the same model; nothing here is precomputed.</p>
        </div>
        <button onClick={() => setInput(DEFAULT)} className="text-xs font-medium text-muted hover:text-ink">Reset inputs</button>
      </div>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Select label="District" value={input.district} options={card?.districts ?? [input.district]}
              onChange={(v) => set({ district: v })} />
            <Select label="Current provider" value={input.current_provider} options={card?.providers ?? [input.current_provider]}
              onChange={(v) => set({ current_provider: v })} />
          </div>
          {RANGES.map((r) => (
            <label key={r.key} className="block">
              <span className="mb-1 flex justify-between text-[13px]">
                <span className="text-muted">{r.label}</span>
                <span className="font-mono">{r.fmt(input[r.key] as number)}</span>
              </span>
              <input type="range" min={r.min} max={r.max} step={r.step} value={input[r.key] as number}
                onChange={(e) => set({ [r.key]: Number(e.target.value) } as Partial<SocietyInput>)}
                className="w-full accent-[#f5b301]" />
            </label>
          ))}
        </div>

        <div>
          {error && <p className="text-sm text-red-700">Couldn&apos;t classify: {error}</p>}
          {result && (
            <>
              <ProbGauge prob={result.prob} />
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Estimated savings</dt>
                  <dd className="font-semibold tabular-nums">{inr(result.estimated_monthly_savings_rs)}/mo</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Scored in</dt>
                  <dd className="font-semibold tabular-nums">{result.latency_ms.toFixed(1)} ms</dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] leading-relaxed text-muted">
                Savings are worked out the same way as in the dataset: (current tariff − solar tariff) × consumption.
              </p>
            </>
          )}
        </div>

        <div>{result && <Contributions items={result.contributions} limit={7} />}</div>
      </div>
    </section>
  );
}

function Select({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-sun">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}
