import AnimatedNumber from "@/components/AnimatedNumber";
import { inrShort, num, pct } from "@/lib/format";
import type { ScenarioResult } from "@/lib/types";

export default function KpiCards({ kpis }: { kpis: ScenarioResult["kpis"] }) {
  const used = kpis.capacity_kwh ? kpis.used_kwh / kpis.capacity_kwh : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Card label="Societies to pitch" value={kpis.selected_count} format={(v) => num(Math.round(v))}
        sub={`of ${num(kpis.eligible_count)} eligible · ${num(kpis.total_count)} total`} />
      <Card label="Farm capacity used" value={used} format={pct}
        sub={`${num(kpis.used_kwh / 1e3)} / ${num(kpis.capacity_kwh / 1e3)} MWh/mo`}>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-sun transition-[width] duration-500"
            style={{ width: `${Math.min(used, 1) * 100}%` }} />
        </div>
      </Card>
      <Card label="Society savings / month" value={kpis.monthly_savings_rs} format={inrShort}
        sub={`${inrShort(kpis.monthly_savings_rs * 12)} a year`} />
      <Card label="Avg conversion chance" value={kpis.avg_conversion ?? 0}
        format={(v) => (kpis.avg_conversion == null ? "—" : pct(v))}
        sub="across selected societies" />
      <Card label="Flats reached" value={kpis.flats_reached} format={(v) => num(Math.round(v))} sub="households" />
    </div>
  );
}

function Card({ label, value, format, sub, children }: {
  label: string;
  value: number;
  format: (v: number) => string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">
        <AnimatedNumber value={value} format={format} />
      </div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
      {children}
    </div>
  );
}
