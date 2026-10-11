"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import AccuracyChart from "@/components/AccuracyChart";
import ActivityFeed from "@/components/ActivityFeed";
import AnimatedNumber from "@/components/AnimatedNumber";
import Contributions from "@/components/Contributions";
import ProbGauge from "@/components/ProbGauge";
import TryModel from "@/components/TryModel";
import { getModelCard } from "@/lib/api";
import { inr, num, pct } from "@/lib/format";
import type { HotLead, Source, StreamEvent, StreamMetrics, useLiveModel } from "@/lib/live";
import type { ModelCard } from "@/lib/types";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-xl bg-line/60" />,
});

type Live = ReturnType<typeof useLiveModel>;

const SOURCES: { id: Source; label: string }[] = [
  { id: "mixed", label: "Mixed" },
  { id: "test", label: "Held-out rows" },
  { id: "pending", label: "Pending leads" },
];

export default function LiveModel({ live }: { live: Live }) {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null);
  const { latest, metrics, history, hot, feed, points, done } = live.state;

  useEffect(() => {
    getModelCard().then(setCard).catch(() => {});
  }, [live.connected]);

  return (
    <div className="space-y-4">
      <Strip live={live} card={card} />

      {done && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Stream finished: every row from this source has been classified. Pick a source above to run it again.
        </div>
      )}

      {metrics && <Counters m={metrics} card={card} />}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {latest ? <NowClassifying e={latest} /> : <Placeholder text="Waiting for the first row…" />}
        <Confusion m={metrics} latest={latest} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <AccuracyChart history={history} baseline={card?.test_metrics.baseline_accuracy}
          testAccuracy={card?.test_metrics.accuracy} />
        <HotLeads leads={hot} scored={metrics?.pending_scored ?? 0} onSelect={setFocus} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="h-[460px]"><LiveMap points={points} latest={latest} focus={focus} /></div>
        <div className="h-[460px]">
          <ActivityFeed events={feed} onSelect={(e: StreamEvent) => setFocus({ lat: e.society.lat, lon: e.society.lon })} />
        </div>
      </div>

      <TryModel card={card} />
    </div>
  );
}

function Strip({ live, card }: { live: Live; card: ModelCard | null }) {
  const running = live.connected && !live.paused;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-panel px-5 py-3.5 text-white">
      <span className="flex items-center gap-2 text-xs font-bold tracking-[0.18em]">
        <span className={`h-2.5 w-2.5 rounded-full ${running ? "live-dot bg-green-400" : "bg-white/40"}`} />
        {!live.connected ? "RECONNECTING" : live.state.done ? "FINISHED" : live.paused ? "PAUSED" : "LIVE"}
      </span>
      <span className="text-sm text-panel-muted">
        {card ? (
          <>
            <b className="text-white">{card.model}</b> · trained on {num(card.train_rows)} rows of{" "}
            <span className="font-mono text-[12px]">{card.dataset}</span> in {card.fit_ms} ms
          </>
        ) : "Loading model…"}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Segmented options={SOURCES} value={live.source} onChange={live.restart} />
        <Segmented options={[1, 2, 4, 8].map((s) => ({ id: s, label: `${s}×` }))} value={live.speed} onChange={live.setSpeed} />
        <button onClick={live.togglePause} disabled={live.state.done}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40">
          {live.paused && !live.state.done ? "▶ Resume" : "❚❚ Pause"}
        </button>
        <button onClick={() => live.restart(live.source)}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
          ↺ Restart
        </button>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-white/10 p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${value === o.id ? "bg-white text-ink" : "text-white/80 hover:text-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Counters({ m, card }: { m: StreamMetrics; card: ModelCard | null }) {
  const baseline = card?.test_metrics.baseline_accuracy;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Stat label="Rows classified" value={m.classified} format={(v) => num(Math.round(v))}
        sub={`${num(m.remaining)} still to come`} />
      <Stat label="Live accuracy" value={m.accuracy ?? 0} format={(v) => (m.accuracy == null ? "—" : pct(v))}
        sub={`on ${num(m.labelled)} held-out rows${baseline ? ` · baseline ${pct(baseline)}` : ""}`} />
      <Stat label="Live AUC" value={m.auc ?? 0} format={(v) => (m.auc == null ? "—" : v.toFixed(3))}
        sub={card ? `full test set ${card.test_metrics.auc.toFixed(3)}` : "ranking quality"} />
      <Stat label="New leads flagged" value={m.predicted_converts} format={(v) => num(Math.round(v))}
        sub={`likely to convert, of ${num(m.pending_scored)} pending`} />
      <Stat label="Inference time" value={m.avg_latency_ms ?? 0} format={(v) => `${v.toFixed(1)} ms`}
        sub={m.rows_per_min ? `${num(m.rows_per_min)} rows / min` : "per row"} />
    </div>
  );
}

function Stat({ label, value, format, sub }: { label: string; value: number; format: (v: number) => string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight"><AnimatedNumber value={value} format={format} duration={400} /></div>
      <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>
    </div>
  );
}

/** The row the model just scored: its real inputs, the prediction and, if known, the real outcome. */
function NowClassifying({ e }: { e: StreamEvent }) {
  const s = e.society;
  const inputs = [
    ["Flats", num(s.num_flats)],
    ["Consumption / mo", `${num(s.consumption_kwh)} kWh`],
    ["Current tariff", `₹${s.tariff.toFixed(2)}`],
    ["Solar tariff", `₹${s.solar_tariff.toFixed(2)}`],
    ["Distance", `${s.distance_km} km`],
    ["Building age", `${s.age} yrs`],
    ["Est. savings / mo", inr(s.savings)],
    ["Provider", s.provider],
  ];
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wider text-muted">Now classifying · row #{num(e.seq)}</span>
        <span className={`rounded-full px-2.5 py-0.5 font-medium ${e.source === "test" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>
          {e.source === "test" ? "Held-out row · real outcome known" : "Pending row · new lead"}
        </span>
      </div>
      <div className="mt-3 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{s.name}</h3>
          <p className="text-sm text-muted">{s.city} · {s.district} district · <span className="font-mono text-xs">{s.id}</span></p>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-4">
            {inputs.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-muted">{k}</dt>
                <dd className="truncate text-sm font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5"><Contributions items={e.contributions} limit={5} title="What drove this prediction" /></div>
        </div>
        <div>
          <ProbGauge prob={e.prob} />
          <div className="mt-5 rounded-lg bg-canvas px-4 py-3 text-sm">
            {e.actual ? (
              <div className="flex items-center justify-between">
                <span>Recorded outcome: <b>{e.actual}</b></span>
                <span className={`font-semibold ${e.correct ? "text-green-700" : "text-red-700"}`}>
                  {e.correct ? "✓ Correct" : "✗ Wrong"}
                </span>
              </div>
            ) : (
              <span className="text-muted">No outcome yet: this society hasn&apos;t been pitched.</span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">Scored in <b className="text-ink tabular-nums">{e.latency_ms.toFixed(1)} ms</b></p>
        </div>
      </div>
    </div>
  );
}

function Confusion({ m, latest }: { m: StreamMetrics | null; latest: StreamEvent | null }) {
  const cm = m?.confusion ?? { tp: 0, fp: 0, tn: 0, fn: 0 };
  const total = Math.max(1, cm.tp + cm.fp + cm.tn + cm.fn);
  const hit = latest?.correct == null ? null
    : (latest.correct ? "t" : "f") + (latest.predicted === "Converted" ? "p" : "n");
  const cells: { key: keyof typeof cm; label: string; good: boolean }[][] = [
    [{ key: "tp", label: "Converted, predicted convert", good: true }, { key: "fn", label: "Converted, predicted reject", good: false }],
    [{ key: "fp", label: "Rejected, predicted convert", good: false }, { key: "tn", label: "Rejected, predicted reject", good: true }],
  ];
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="font-semibold">Confusion matrix</h3>
      <p className="text-xs text-muted">Held-out rows only · rows = recorded outcome, columns = prediction</p>
      <div className="mt-4 grid grid-cols-[80px_1fr_1fr] gap-2 text-xs">
        <span />
        <span className="text-center font-medium text-muted">Predict convert</span>
        <span className="text-center font-medium text-muted">Predict reject</span>
        {cells.map((row, i) => (
          <Row key={i} label={i === 0 ? "Converted" : "Rejected"}>
            {row.map((c) => (
              <div key={c.key} title={c.label}
                className={`relative grid h-20 place-items-center overflow-hidden rounded-lg ${c.good ? "text-green-900" : "text-red-900"}`}
                style={{ background: `${c.good ? "rgb(22 163 74" : "rgb(239 68 68"} / ${0.08 + (cm[c.key] / total) * 0.6})` }}>
                {hit === c.key && <span key={latest?.seq} className="animate-flash pointer-events-none absolute inset-0" />}
                <span className="relative text-2xl font-semibold tabular-nums">{num(cm[c.key])}</span>
              </div>
            ))}
          </Row>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-canvas px-3 py-2">
          <dt className="text-[11px] text-muted">Precision (flagged that really converted)</dt>
          <dd className="font-semibold tabular-nums">{m?.precision == null ? "—" : pct(m.precision)}</dd>
        </div>
        <div className="rounded-lg bg-canvas px-3 py-2">
          <dt className="text-[11px] text-muted">Recall (converters we caught)</dt>
          <dd className="font-semibold tabular-nums">{m?.recall == null ? "—" : pct(m.recall)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="self-center font-medium text-muted">{label}</span>
      {children}
    </>
  );
}

function HotLeads({ leads, scored, onSelect }: {
  leads: HotLead[];
  scored: number;
  onSelect: (p: { lat: number; lon: number }) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="font-semibold">Best new leads so far</h3>
      <p className="text-xs text-muted">Highest predicted conversion among {num(scored)} pending societies scored</p>
      <ol className="mt-3 space-y-1.5">
        {leads.length === 0 && <li className="py-6 text-center text-sm text-muted">No pending rows scored yet.</li>}
        {leads.map((l, i) => (
          <li key={l.id}>
            <button onClick={() => onSelect(l)}
              className="grid w-full grid-cols-[22px_1fr_90px] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-canvas">
              <span className="text-xs font-semibold text-muted">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.name}</span>
                <span className="block truncate text-xs text-muted">{l.city} · {l.num_flats} flats · {inr(l.savings)}/mo</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                  <span className="block h-full rounded-full bg-green-600" style={{ width: `${l.prob * 100}%` }} />
                </span>
                <span className="w-9 text-right text-xs font-semibold tabular-nums">{pct(l.prob)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="grid h-full min-h-60 place-items-center rounded-xl border border-dashed border-line bg-surface text-sm text-muted">{text}</div>;
}
