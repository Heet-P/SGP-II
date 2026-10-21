"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "vaul";

import AccuracyChart from "@/components/AccuracyChart";
import ActivityFeed from "@/components/ActivityFeed";
import AnimatedNumber from "@/components/AnimatedNumber";
import Contributions from "@/components/Contributions";
import TryModel from "@/components/TryModel";
import { Button, Card, CardHeader, cx, Icon, Meter, Segmented } from "@/components/ui";
import { getModelCard } from "@/lib/api";
import { inr, num, pct } from "@/lib/format";
import type { HotLead, Source, StreamEvent, StreamMetrics, useLiveModel } from "@/lib/live";
import type { ModelCard } from "@/lib/types";

type Live = ReturnType<typeof useLiveModel>;
type Panel = "accuracy" | "confusion" | "log" | "leads";

export default function LivePage({ live }: { live: Live }) {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [panel, setPanel] = useState<Panel>("accuracy");
  const { latest, metrics, history, hot, feed, done } = live.state;

  useEffect(() => {
    getModelCard().then(setCard).catch(() => {});
  }, [live.connected]);

  useEffect(() => {
    if (done) toast("Stream finished", { description: "Every row from this source has been classified." });
  }, [done]);

  return (
    <div className="space-y-5">
      <Toolbar live={live} card={card} />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {latest ? <NowClassifying e={latest} /> : (
          <Card className="grid min-h-72 place-items-center text-[13px] text-muted">
            {live.connected ? "Waiting for the first row…" : "Connecting to the live stream…"}
          </Card>
        )}
        <Metrics m={metrics} card={card} />
      </div>

      <div className="space-y-3">
        <Segmented size="sm" value={panel} onChange={setPanel} options={[
          { value: "accuracy", label: "Accuracy" },
          { value: "confusion", label: "Confusion matrix" },
          { value: "log", label: "Log" },
          { value: "leads", label: "Best new leads" },
        ]} />
        <div key={panel} className="animate-fade-up">
          {panel === "accuracy" && (
            <AccuracyChart history={history} baseline={card?.test_metrics.baseline_accuracy} testAccuracy={card?.test_metrics.accuracy} />
          )}
          {panel === "confusion" && <Confusion m={metrics} latest={latest} />}
          {panel === "log" && <div className="h-[440px]"><ActivityFeed events={feed} /></div>}
          {panel === "leads" && <BestLeads leads={hot} scored={metrics?.pending_scored ?? 0} />}
        </div>
      </div>
    </div>
  );
}

const SOURCES: { value: Source; label: string }[] = [
  { value: "mixed", label: "Mixed" },
  { value: "test", label: "Held-out" },
  { value: "pending", label: "Pending" },
];

function Toolbar({ live, card }: { live: Live; card: ModelCard | null }) {
  const running = live.connected && !live.paused;
  const status = !live.connected ? "Connecting" : live.state.done ? "Finished" : live.paused ? "Paused" : "Live";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2.5">
        <span className={cx("h-2 w-2 rounded-full", running ? "live-dot bg-good" : "bg-faint")} />
        <span className="text-[13px] font-medium">{status}</span>
        {card && (
          <span className="hidden text-[13px] text-muted md:inline">
            · Logistic regression trained on {num(card.train_rows)} rows
          </span>
        )}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={live.source} onChange={live.restart} options={SOURCES} />
        <Segmented size="sm" value={live.speed} onChange={live.setSpeed}
          options={[1, 2, 4, 8].map((s) => ({ value: s, label: `${s}×` }))} />
        <Button size="sm" onClick={live.togglePause} disabled={live.state.done} aria-label={live.paused ? "Resume" : "Pause"}>
          {live.paused && !live.state.done ? <Icon.play /> : <Icon.pause />}
        </Button>
        <Button size="sm" onClick={() => live.restart(live.source)} aria-label="Restart"><Icon.restart /></Button>
        <TrySheet card={card} />
      </div>
    </div>
  );
}

/** "Classify your own" opens the what-if tool in a sheet instead of crowding the page. */
function TrySheet({ card }: { card: ModelCard | null }) {
  return (
    <Drawer.Root direction="right">
      <Drawer.Trigger asChild>
        <Button size="sm" variant="primary"><Icon.sparkle /> Classify your own</Button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/15" />
        <Drawer.Content
          className="fixed top-2 right-2 bottom-2 z-50 flex w-[860px] max-w-[calc(100vw-16px)] outline-none"
          style={{ "--initial-transform": "calc(100% + 8px)" } as React.CSSProperties}>
          <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-pop">
            <div className="flex items-start justify-between px-6 pt-6">
              <div>
                <Drawer.Title className="text-[15px] font-semibold tracking-tight">Classify your own society</Drawer.Title>
                <Drawer.Description className="mt-0.5 text-[13px] text-muted">
                  Change any input and the model re-scores it instantly.
                </Drawer.Description>
              </div>
              <Drawer.Close asChild>
                <Button variant="ghost" size="sm" aria-label="Close"><Icon.close /></Button>
              </Drawer.Close>
            </div>
            <div data-vaul-no-drag className="flex-1 overflow-y-auto px-2 pb-4">
              <TryModel card={card} bare />
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function NowClassifying({ e }: { e: StreamEvent }) {
  const s = e.society;
  const converts = e.prob >= 0.5;
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span className="tabular-nums">Row {num(e.seq)}</span>
        <span>{e.source === "test" ? "Held-out row · real outcome known" : "Pending row · new lead"}</span>
      </div>
      <h2 className="mt-3 truncate text-[22px] font-semibold tracking-tight">{s.name}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{s.city} · {s.provider} · {num(s.num_flats)} flats</p>

      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_1fr]">
        <div>
          <div className="flex items-baseline gap-3">
            <span className={cx("text-[44px] leading-none font-semibold tracking-tight tabular-nums", converts ? "text-good" : "text-bad")}>
              {pct(e.prob)}
            </span>
            <span className="text-[13px] text-muted">predicts {converts ? "Converted" : "Rejected"}</span>
          </div>
          <div className="relative mt-4">
            <Meter value={e.prob} color={converts ? "var(--color-good)" : "var(--color-bad)"} />
            <span className="absolute -top-1 left-1/2 h-3 w-px bg-ink/40" title="50% threshold" />
          </div>
          <div className="mt-5 text-[13px]">
            {e.actual ? (
              <span className={e.correct ? "text-good" : "text-bad"}>
                {e.correct ? "✓ Correct" : "✗ Wrong"} <span className="text-muted">· recorded outcome was {e.actual}</span>
              </span>
            ) : (
              <span className="text-muted">No outcome yet. This society hasn&apos;t been pitched.</span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-faint tabular-nums">Scored in {e.latency_ms.toFixed(1)} ms</p>
        </div>
        <Contributions items={e.contributions} limit={4} title="What drove it" />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 text-[13px] sm:grid-cols-4">
        <Input label="Consumption" value={`${num(s.consumption_kwh)} kWh`} />
        <Input label="Tariff" value={`₹${s.tariff.toFixed(2)}`} />
        <Input label="Distance" value={`${s.distance_km} km`} />
        <Input label="Est. savings" value={`${inr(s.savings)}/mo`} />
      </dl>
    </Card>
  );
}

function Input({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Metrics({ m, card }: { m: StreamMetrics | null; card: ModelCard | null }) {
  const rows = [
    {
      label: "Live accuracy",
      value: m?.accuracy ?? null,
      format: pct,
      hint: m ? `${num(m.labelled)} held-out rows${card ? ` · baseline ${pct(card.test_metrics.baseline_accuracy)}` : ""}` : "",
    },
    {
      label: "Live AUC",
      value: m?.auc ?? null,
      format: (v: number) => v.toFixed(3),
      hint: card ? `full test set ${card.test_metrics.auc.toFixed(3)}` : "",
    },
    {
      label: "Rows classified",
      value: m?.classified ?? null,
      format: (v: number) => num(Math.round(v)),
      hint: m?.rows_per_min ? `${num(m.rows_per_min)} per minute · ${num(m.predicted_converts)} new leads flagged` : "",
    },
  ];
  return (
    <Card className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="px-5 py-4">
          <div className="text-[12px] font-medium text-muted">{r.label}</div>
          <div className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight">
            {r.value == null ? <span className="text-faint">—</span> : <AnimatedNumber value={r.value} format={r.format} duration={400} />}
          </div>
          {r.hint && <div className="mt-2 truncate text-[12px] text-muted">{r.hint}</div>}
        </div>
      ))}
    </Card>
  );
}

function Confusion({ m, latest }: { m: StreamMetrics | null; latest: StreamEvent | null }) {
  const cm = m?.confusion ?? { tp: 0, fp: 0, tn: 0, fn: 0 };
  const total = Math.max(1, cm.tp + cm.fp + cm.tn + cm.fn);
  const hit = latest?.correct == null ? null : (latest.correct ? "t" : "f") + (latest.predicted === "Converted" ? "p" : "n");
  const cell = (key: keyof typeof cm, good: boolean) => (
    <div className="relative grid h-24 place-items-center overflow-hidden rounded-xl"
      style={{ background: `${good ? "rgb(22 163 74" : "rgb(220 38 38"} / ${0.06 + (cm[key] / total) * 0.5})` }}>
      {hit === key && <span key={latest?.seq} className="animate-flash pointer-events-none absolute inset-0" />}
      <span className="relative text-[26px] font-semibold tabular-nums">{num(cm[key])}</span>
    </div>
  );
  return (
    <Card>
      <CardHeader title="Confusion matrix" hint="Held-out rows only · rows are the recorded outcome, columns the prediction" />
      <div className="grid grid-cols-[96px_1fr_1fr] gap-2 px-5 pb-5 text-[12px]">
        <span />
        <span className="text-center text-muted">Predicted convert</span>
        <span className="text-center text-muted">Predicted reject</span>
        <span className="self-center text-muted">Converted</span>
        {cell("tp", true)}
        {cell("fn", false)}
        <span className="self-center text-muted">Rejected</span>
        {cell("fp", false)}
        {cell("tn", true)}
      </div>
      <div className="grid grid-cols-2 border-t border-line text-[13px]">
        <div className="px-5 py-3"><span className="text-muted">Precision </span><span className="font-medium tabular-nums">{m?.precision == null ? "—" : pct(m.precision)}</span></div>
        <div className="border-l border-line px-5 py-3"><span className="text-muted">Recall </span><span className="font-medium tabular-nums">{m?.recall == null ? "—" : pct(m.recall)}</span></div>
      </div>
    </Card>
  );
}

function BestLeads({ leads, scored }: { leads: HotLead[]; scored: number }) {
  return (
    <Card>
      <CardHeader title="Best new leads so far" hint={`Highest predicted chance among ${num(scored)} pending societies scored`} />
      <ol className="px-2 pb-2">
        {leads.length === 0 && <li className="py-10 text-center text-[13px] text-muted">No pending rows scored yet.</li>}
        {leads.map((l, i) => (
          <li key={l.id} className="grid grid-cols-[20px_1fr_120px] items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="text-[12px] text-faint tabular-nums">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{l.name}</span>
              <span className="block truncate text-[12px] text-muted">{l.city} · {num(l.num_flats)} flats · {inr(l.savings)}/mo</span>
            </span>
            <span className="flex items-center gap-2.5">
              <Meter value={l.prob} color="var(--color-good)" className="flex-1" />
              <span className="w-9 text-right text-[13px] font-medium tabular-nums">{pct(l.prob)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
