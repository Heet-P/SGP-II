"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "vaul";

import Contributions from "@/components/Contributions";
import { Button, Icon, Meter, Tag } from "@/components/ui";
import { getExplanation, type Explanation } from "@/lib/api";
import { inr, inrShort, num, pct } from "@/lib/format";
import { quadrantColor } from "@/lib/quadrants";
import type { Society } from "@/lib/types";

interface Props {
  society: Society | null;
  total: number;
  onClose: () => void;
  onShowOnMap: (id: string) => void;
}

/** Detail sheet for one society: the numbers that matter, why the model scored it, and a pitch. */
export default function SocietySheet({ society, total, onClose, onShowOnMap }: Props) {
  // Keep the last society while the sheet animates closed.
  const [shown, setShown] = useState<Society | null>(society);
  const [why, setWhy] = useState<Explanation | null>(null);
  if (society && society !== shown) setShown(society);

  useEffect(() => {
    if (!society) return;
    const ctrl = new AbortController();
    getExplanation(society, ctrl.signal).then(setWhy).catch(() => {});
    return () => ctrl.abort();
  }, [society]);

  const s = shown;
  const explanation = why && s && why.id === s.id ? why : null;
  const pitch = s
    ? `Your ${num(s.active_flats)} households could save about ${inr(s.savings_per_flat)} per flat every month, ` +
      `roughly ${inrShort(s.monthly_savings * 12)} a year for the society. You pay ₹${s.tariff.toFixed(2)}/unit to ` +
      `${s.provider} today; our solar rate is ₹${s.offer.toFixed(2)}/unit.`
    : "";

  const copy = async () => {
    await navigator.clipboard.writeText(pitch).catch(() => {});
    toast.success("Pitch copied", { description: s?.name });
  };

  return (
    <Drawer.Root direction="right" open={society !== null} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/15" />
        <Drawer.Content
          className="fixed top-2 right-2 bottom-2 z-50 flex w-[440px] max-w-[calc(100vw-16px)] outline-none"
          style={{ "--initial-transform": "calc(100% + 8px)" } as React.CSSProperties}>
          <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-pop">
            {s && (
              <>
                <div className="flex items-start justify-between gap-4 px-6 pt-6">
                  <div className="min-w-0">
                    <Tag color={quadrantColor(s.quadrant)}>{s.quadrant}{s.selected ? " · in allocation" : ""}</Tag>
                    <Drawer.Title className="mt-2 truncate text-[20px] font-semibold tracking-tight">{s.name}</Drawer.Title>
                    <Drawer.Description className="mt-0.5 text-[13px] text-muted">
                      {s.city} · {s.provider} · {num(s.num_flats)} flats · rank {num(s.rank)} of {num(total)}
                    </Drawer.Description>
                  </div>
                  <Drawer.Close asChild>
                    <Button variant="ghost" size="sm" aria-label="Close"><Icon.close /></Button>
                  </Drawer.Close>
                </div>

                <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="text-[12px] text-muted">Chance to convert</div>
                      <div className="mt-1 text-[32px] leading-none font-semibold tracking-tight tabular-nums">{pct(s.prob)}</div>
                      <Meter value={s.prob} color={s.prob >= 0.5 ? "var(--color-good)" : "var(--color-bad)"} className="mt-3" />
                    </div>
                    <div>
                      <div className="text-[12px] text-muted">Society saves</div>
                      <div className="mt-1 text-[32px] leading-none font-semibold tracking-tight tabular-nums">
                        {inrShort(s.monthly_savings)}
                      </div>
                      <div className="mt-2.5 text-[12px] text-muted">per month · {inrShort(s.monthly_savings * 12)} a year</div>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-5 text-[13px]">
                    <Fact label="Distance to farm" value={`${Math.round(s.distance_km)} km`} />
                    <Fact label="Building age" value={`${s.age} years`} />
                    <Fact label="Pays today" value={`₹${s.tariff.toFixed(2)}/unit`} />
                    <Fact label="Our solar rate" value={`₹${s.offer.toFixed(2)}/unit`} />
                  </dl>

                  <div>
                    {explanation ? (
                      <Contributions items={explanation.contributions} limit={6} title="Why the model scored it this way" />
                    ) : (
                      <div className="h-40 animate-pulse rounded-xl bg-subtle" />
                    )}
                  </div>

                  <div>
                    <h4 className="mb-2.5 text-xs font-semibold tracking-wider text-muted uppercase">Suggested pitch</h4>
                    <p className="rounded-xl bg-subtle px-4 py-3.5 text-[14px] leading-relaxed">{pitch}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-3">
                  <Button variant="ghost" size="sm" onClick={() => onShowOnMap(s.id)}>
                    <Icon.pin /> Show on map
                  </Button>
                  <Button variant="primary" size="sm" onClick={copy}>
                    <Icon.copy /> Copy pitch
                  </Button>
                </div>
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
