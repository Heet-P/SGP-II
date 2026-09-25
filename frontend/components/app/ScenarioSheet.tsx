"use client";

import { Drawer } from "vaul";

import { Button, cx, Icon } from "@/components/ui";
import type { FarmSite, ScenarioParams } from "@/lib/types";

interface Props {
  params: ScenarioParams;
  sites: FarmSite[];
  onChange: (patch: Partial<ScenarioParams>) => void;
  onReset: () => void;
}

/** Summary pill in the top bar; opens the scenario panel from the right. */
export default function ScenarioSheet({ params, sites, onChange, onReset }: Props) {
  const site = sites.find((s) => s.id === params.site_id)?.name.replace(" (reference site)", "") ?? "Pune";
  return (
    <Drawer.Root direction="right">
      <Drawer.Trigger asChild>
        <button className="group inline-flex h-8 items-center gap-2 rounded-full bg-surface pr-3 pl-1.5 text-[13px] shadow-card transition-colors duration-150 hover:bg-subtle">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-sun text-[10px]">☀</span>
          <span className="font-medium">{site}</span>
          <span className="text-faint">·</span>
          <span className="tabular-nums">{params.capacity_mw} MW</span>
          <span className="text-faint">·</span>
          <span className="tabular-nums text-muted">₹{params.gen_cost.toFixed(2)}/unit</span>
          <Icon.sliders className="ml-0.5 text-muted transition-colors group-hover:text-ink" />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/15" />
        <Drawer.Content
          className="fixed top-2 right-2 bottom-2 z-50 flex w-[380px] max-w-[calc(100vw-16px)] outline-none"
          style={{ "--initial-transform": "calc(100% + 8px)" } as React.CSSProperties}>
          <div className="flex h-full w-full flex-col rounded-2xl bg-surface shadow-pop">
            <div className="flex items-start justify-between px-5 pt-5">
              <div>
                <Drawer.Title className="text-[15px] font-semibold tracking-tight">Scenario</Drawer.Title>
                <Drawer.Description className="mt-0.5 text-[13px] text-muted">
                  Every change re-ranks all societies instantly.
                </Drawer.Description>
              </div>
              <Drawer.Close asChild>
                <Button variant="ghost" size="sm" aria-label="Close"><Icon.close /></Button>
              </Drawer.Close>
            </div>

            {/* data-vaul-no-drag: dragging a slider must not drag the panel closed. */}
            <div data-vaul-no-drag className="flex-1 space-y-7 overflow-y-auto px-5 py-6">
              <Group title="Farm">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] text-muted">Site</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {sites.map((s) => (
                      <button key={s.id} onClick={() => onChange({ site_id: s.id })}
                        className={cx(
                          "h-8 rounded-lg px-2.5 text-left text-[13px] transition-colors duration-150",
                          s.id === params.site_id ? "bg-ink text-white" : "bg-subtle text-ink hover:bg-line",
                        )}>
                        {s.name.replace(" (reference site)", "")}
                      </button>
                    ))}
                  </div>
                </label>
                <Slider label="Capacity" unit="MW" value={params.capacity_mw} min={1} max={25} step={0.5}
                  format={(v) => v.toFixed(1)} onChange={(v) => onChange({ capacity_mw: v })} />
              </Group>

              <Group title="Pricing">
                <Slider label="Generation cost" unit="₹/unit" value={params.gen_cost} min={2} max={6} step={0.1}
                  format={(v) => v.toFixed(2)} onChange={(v) => onChange({ gen_cost: v })} />
                <Switch label="Charge for transmission distance" checked={params.use_distance}
                  onChange={(v) => onChange({ use_distance: v })} />
                <Slider label="Transfer cost" unit="₹/unit/km" value={params.transfer_cost} min={0} max={0.1} step={0.005}
                  format={(v) => v.toFixed(3)} disabled={!params.use_distance} onChange={(v) => onChange({ transfer_cost: v })} />
                <Slider label="Markup" unit="%" value={params.markup_pct} min={0} max={60} step={5}
                  format={(v) => v.toFixed(0)} onChange={(v) => onChange({ markup_pct: v })} />
              </Group>

              <Group title="Eligibility">
                <Slider label="Max distance" unit="km" value={params.max_distance_km} min={10} max={600} step={10}
                  format={(v) => v.toFixed(0)} onChange={(v) => onChange({ max_distance_km: v })} />
                <Slider label="Max building age" unit="yrs" value={params.max_age_years} min={5} max={45} step={1}
                  format={(v) => v.toFixed(0)} onChange={(v) => onChange({ max_age_years: v })} />
              </Group>
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <Button variant="ghost" size="sm" onClick={onReset}>Reset to defaults</Button>
              <Drawer.Close asChild>
                <Button variant="primary" size="sm">Done</Button>
              </Drawer.Close>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">{title}</h3>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Slider({ label, unit, value, min, max, step, format, disabled, onChange }: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className={cx("block", disabled && "opacity-50")}>
      <span className="mb-2.5 flex items-baseline justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          {format(value)} <span className="text-faint">{unit}</span>
        </span>
      </span>
      <input type="range" className="range" value={value} min={min} max={max} step={step} disabled={disabled}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between text-left text-[13px] text-muted">
      {label}
      <span className={cx("relative h-[18px] w-8 rounded-full transition-colors duration-200", checked ? "bg-ink" : "bg-line-strong")}>
        <span className={cx(
          "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform duration-200 ease-snappy",
          checked ? "translate-x-[16px]" : "translate-x-[2px]",
        )} />
      </span>
    </button>
  );
}
