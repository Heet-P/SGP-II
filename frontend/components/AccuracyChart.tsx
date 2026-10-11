"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { pct } from "@/lib/format";
import type { LiveState } from "@/lib/live";

// The first few rows swing between 0% and 100%; start plotting once the estimate settles a little.
const MIN_ROWS = 20;

/** Live accuracy on held-out rows, against the majority-class baseline and the full-test-set figure. */
export default function AccuracyChart({ history: all, baseline, testAccuracy }: {
  history: LiveState["history"];
  baseline?: number;
  testAccuracy?: number;
}) {
  const history = all.filter((h) => h.n >= MIN_ROWS);
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="font-semibold">Accuracy as rows stream in</h3>
      <p className="text-xs text-muted">Only held-out rows count: the model never saw them during training.</p>
      <div className="mt-3 h-[230px]">
        {history.length < 2 ? (
          <div className="grid h-full place-items-center text-sm text-muted">
            Plotting starts after {MIN_ROWS} held-out rows…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#eeece6" vertical={false} />
              <XAxis dataKey="n" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11, fill: "#6b6f7b" }}
                tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis domain={[0.2, 1]} tickFormatter={pct} tick={{ fontSize: 11, fill: "#6b6f7b" }} width={40}
                tickLine={false} axisLine={false} />
              <Tooltip formatter={(v, name) => [pct(Number(v)), name === "accuracy" ? "Cumulative" : "Last 100 rows"]}
                labelFormatter={(n) => `${n} held-out rows`}
                contentStyle={{ borderRadius: 8, border: "1px solid #e7e5df", fontSize: 12 }} />
              {baseline != null && (
                <ReferenceLine y={baseline} stroke="#9aa0ac" strokeDasharray="4 4"
                  label={{ value: `Always "Rejected" ${pct(baseline)}`, position: "insideBottomLeft", fontSize: 11, fill: "#6b6f7b" }} />
              )}
              {testAccuracy != null && (
                <ReferenceLine y={testAccuracy} stroke="#16a34a" strokeDasharray="4 4"
                  label={{ value: `Full test set ${pct(testAccuracy)}`, position: "insideTopRight", fontSize: 11, fill: "#16a34a" }} />
              )}
              <Line dataKey="rolling" stroke="#f5b301" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line dataKey="accuracy" stroke="#14161c" strokeWidth={2.2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ink" />Cumulative</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-sun" />Last 100 rows</span>
      </div>
    </div>
  );
}
