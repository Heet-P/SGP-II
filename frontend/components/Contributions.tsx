/** Diverging bars: how much each feature pushed the conversion score up or down. */
export default function Contributions({
  items,
  title = "Why this score",
  limit,
}: {
  items: { feature: string; value: number }[];
  title?: string;
  limit?: number;
}) {
  const sorted = [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit)
    .sort((a, b) => b.value - a.value);
  const max = Math.max(...items.map((c) => Math.abs(c.value)), 0.01);
  return (
    <div>
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h4>
      <ul className="space-y-2">
        {sorted.map((c) => {
          const w = `${(Math.abs(c.value) / max) * 50}%`;
          const pos = c.value >= 0;
          return (
            <li key={c.feature} className="grid grid-cols-[140px_1fr] items-center gap-3 text-xs">
              <span className="truncate text-muted">{c.feature}</span>
              <span className="relative h-3.5">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                <span
                  className={`absolute inset-y-0 rounded-sm transition-all duration-300 ${pos ? "bg-green-600" : "bg-red-500"}`}
                  style={pos ? { left: "50%", width: w } : { right: "50%", width: w }}
                  title={`${c.value >= 0 ? "+" : ""}${c.value.toFixed(2)}`}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11px] text-muted">Green pushes the conversion chance up; red pulls it down.</p>
    </div>
  );
}
