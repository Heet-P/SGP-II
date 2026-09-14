import { pct } from "@/lib/format";

/** Conversion probability as a big number plus a bar with the 50% decision threshold marked. */
export default function ProbGauge({ prob }: { prob: number }) {
  const converts = prob >= 0.5;
  const color = converts ? "#16a34a" : "#dc2626";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-4xl font-semibold tracking-tight tabular-nums" style={{ color }}>{pct(prob)}</span>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: color }}>
          Predicts {converts ? "Converted" : "Rejected"}
        </span>
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-canvas">
        <div className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${prob * 100}%`, background: color }} />
        <div className="absolute -top-1 left-1/2 h-4.5 w-0.5 -translate-x-1/2 bg-ink/60" title="Decision threshold (50%)" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>0%</span><span>threshold 50%</span><span>100%</span>
      </div>
    </div>
  );
}
