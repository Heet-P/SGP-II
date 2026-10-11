"use client";

import { pct } from "@/lib/format";
import type { StreamEvent } from "@/lib/live";

/** One row per classified society, newest first. */
export default function ActivityFeed({ events, onSelect }: { events: StreamEvent[]; onSelect: (e: StreamEvent) => void }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="font-semibold">Classification log</h3>
        <span className="text-xs text-muted">click a row to find it on the map</span>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-1.5">
        {events.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Waiting for the first row…</li>}
        {events.map((e) => {
          const converts = e.predicted === "Converted";
          return (
            <li key={e.seq} className="animate-slide-in">
              <button onClick={() => onSelect(e)}
                className="grid w-full grid-cols-[52px_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-canvas">
                <span className={`rounded-md px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-white ${converts ? "bg-green-600" : "bg-red-500"}`}>
                  {pct(e.prob)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.society.name}</span>
                  <span className="block truncate text-xs text-muted">
                    #{e.seq} · {e.society.city} · {e.society.num_flats} flats
                  </span>
                </span>
                <Verdict e={e} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Verdict({ e }: { e: StreamEvent }) {
  if (e.correct === null) {
    return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">new lead</span>;
  }
  return e.correct ? (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">✓ {e.actual}</span>
  ) : (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">✗ was {e.actual}</span>
  );
}
