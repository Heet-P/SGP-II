"use client";

import type { FarmSite, ScenarioParams } from "@/lib/types";

interface Props {
  params: ScenarioParams;
  sites: FarmSite[];
  onChange: (patch: Partial<ScenarioParams>) => void;
}

export default function Sidebar({ params, sites, onChange }: Props) {
  return (
    <aside className="w-full shrink-0 bg-panel text-white lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:overflow-y-auto">
      <div className="flex items-center gap-2.5 border-b border-panel-line px-6 py-5">
        <SunMark />
        <div>
          <div className="text-[15px] font-semibold tracking-tight">SolarLeads</div>
          <div className="text-xs text-panel-muted">Society prioritisation</div>
        </div>
      </div>

      <div className="space-y-7 px-6 py-6">
        <Section title="Farm">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-panel-muted">Site</span>
            <select
              value={params.site_id}
              onChange={(e) => onChange({ site_id: e.target.value })}
              className="w-full rounded-lg border border-panel-line bg-[#171c2a] px-3 py-2 text-sm outline-none focus:border-sun"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Slider label="Capacity" unit="MW" value={params.capacity_mw} min={1} max={25} step={0.5}
            format={(v) => v.toFixed(1)} onChange={(v) => onChange({ capacity_mw: v })} />
        </Section>

        <Section title="Pricing">
          <Slider label="Generation cost" unit="₹/unit" value={params.gen_cost} min={2} max={6} step={0.1}
            format={(v) => v.toFixed(2)} onChange={(v) => onChange({ gen_cost: v })} />
          <Toggle label="Include transmission distance" checked={params.use_distance}
            onChange={(v) => onChange({ use_distance: v })} />
          <Slider label="Transfer cost" unit="₹/unit/km" value={params.transfer_cost} min={0} max={0.1} step={0.005}
            format={(v) => v.toFixed(3)} disabled={!params.use_distance}
            onChange={(v) => onChange({ transfer_cost: v })} />
          <Slider label="Markup" unit="%" value={params.markup_pct} min={0} max={60} step={5}
            format={(v) => v.toFixed(0)} onChange={(v) => onChange({ markup_pct: v })} />
        </Section>

        <Section title="Eligibility">
          <Slider label="Max distance" unit="km" value={params.max_distance_km} min={10} max={600} step={10}
            format={(v) => v.toFixed(0)} onChange={(v) => onChange({ max_distance_km: v })} />
          <Slider label="Max building age" unit="yrs" value={params.max_age_years} min={5} max={45} step={1}
            format={(v) => v.toFixed(0)} onChange={(v) => onChange({ max_age_years: v })} />
          <Slider label="Min active flats" unit="%" value={params.min_active_pct} min={0} max={100} step={5}
            format={(v) => v.toFixed(0)} onChange={(v) => onChange({ min_active_pct: v })} />
        </Section>

        <p className="text-xs leading-relaxed text-panel-muted">
          Every ranking, chart and map point recalculates as you move these.
        </p>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sun">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface SliderProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

function Slider({ label, unit, value, min, max, step, format, disabled, onChange }: SliderProps) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <label className={`block ${disabled ? "opacity-60" : ""}`}>
      <span className="mb-2 flex items-baseline justify-between text-[13px]">
        <span className="text-panel-muted">{label}</span>
        <span className="font-mono text-white">
          {format(value)} <span className="text-panel-muted">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        className="range"
        style={{ "--fill": fill } as React.CSSProperties}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between text-left text-[13px] text-panel-muted"
    >
      {label}
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-sun" : "bg-panel-line"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SunMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="6.5" fill="#f5b301" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="15" y="2" width="2" height="5" rx="1" fill="#f5b301"
          transform={`rotate(${i * 45} 16 16)`} />
      ))}
    </svg>
  );
}
