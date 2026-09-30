"use client";

import "lenis/dist/lenis.css";

import { ReactLenis, useLenis } from "lenis/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";

import { SOCIETY_LABELS } from "@/components/landing/labels";

// three.js needs the browser, so the canvas only renders client-side.
const Scene = dynamic(() => import("@/components/landing/Scene"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gradient-to-b from-[#a9c9e4] to-[#6f7d4f]" />,
});

interface Stat {
  value: string;
  label: string;
}

interface Beat {
  kicker: string;
  title: string;
  body: string;
  stats: Stat[];
  side: "left" | "right";
  cta?: boolean;
  /** Stats are live readouts written by the 3D energy display. */
  live?: boolean;
}

type ReadoutEls = { clock: HTMLElement | null; power: HTMLElement | null; energy: HTMLElement | null };

// Figures match the dashboard's defaults: 5 MW farm, 19% capacity factor, ₹3.50/unit generation,
// ₹0.03/unit/km transfer, 200 km reach, and the project dataset's row counts.
const BEATS: Beat[] = [
  {
    kicker: "SolarLeads",
    title: "Sunlight is Maharashtra's cheapest electricity.",
    body: "Scroll to follow it from a solar farm, down the lines, into the housing societies that need it.",
    side: "left",
    stats: [
      { value: "5 MW", label: "solar farm" },
      { value: "684 MWh", label: "every month" },
      { value: "3,752", label: "societies to rank" },
    ],
  },
  {
    kicker: "01 · Capture",
    title: "Every photon becomes current.",
    body: "Silicon cells turn sunlight into direct current, and inverters convert it to grid-ready AC.",
    side: "left",
    stats: [
      { value: "19%", label: "capacity factor" },
      { value: "₹3.50", label: "per unit to generate" },
    ],
  },
  {
    kicker: "02 · Measure",
    title: "Watch a day of sunlight add up.",
    body: "From sunrise to sunset the farm's output climbs to its midday peak and eases off, and every hour adds to the day's total.",
    side: "left",
    live: true,
    stats: [],
  },
  {
    kicker: "03 · Transmit",
    title: "Six lines, six directions.",
    body: "Transmission lines carry power to societies all around the farm. Every kilometre adds cost, so who you supply first matters.",
    side: "left",
    stats: [
      { value: "6", label: "societies on this grid" },
      { value: "₹0.03", label: "per unit, per km" },
    ],
  },
  {
    kicker: "04 · Deliver",
    title: "Lighting up the societies most likely to switch.",
    body: "SolarLeads ranks housing societies by how likely they are to sign and how much they would save, and shows the model scoring them live.",
    // Left, so the lit societies on the right of the final shot stay visible.
    side: "left",
    cta: true,
    stats: [
      { value: "15,000", label: "rows in the dataset" },
      { value: "Live", label: "model scoring" },
    ],
  },
];

// Layered shadow keeps white text readable over bright sky and dark ground alike.
const TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.55), 0 2px 18px rgba(0,0,0,0.45)";

export default function Landing() {
  const progressRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  // Positioned every frame by the 3D scene to follow their societies.
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Live numbers for the measure section, written every frame by the energy display.
  const readoutRef = useRef<ReadoutEls>({ clock: null, power: null, energy: null });

  return (
    <ReactLenis root options={{ lerp: 0.08, smoothWheel: true }}>
      <ScrollProgress progressRef={progressRef} barRef={barRef} cueRef={cueRef} />

      <div className="fixed inset-0 -z-0">
        <Scene progress={progressRef} labels={labelRefs} readout={readoutRef} />
        {SOCIETY_LABELS.map((l, i) => (
          <div key={l.name} ref={(el) => { labelRefs.current[i] = el; }} style={{ opacity: 0 }}
            className="pointer-events-none absolute top-0 left-0 whitespace-nowrap rounded-xl bg-[#14161c] px-3 py-2 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f5b301]" />{l.name}
            </div>
            <div className="text-[10px] text-white/60">{l.detail} · powered</div>
          </div>
        ))}
      </div>

      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-4 lg:px-10">
        <span className="flex items-center gap-2 rounded-full bg-[#14161c] py-1.5 pr-4 pl-1.5 text-[14px] font-semibold tracking-tight text-white">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f5b301] text-sm text-[#14161c]">☀</span>
          SolarLeads
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/client"
            className="rounded-full bg-[#14161c] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.2)] hover:bg-[#2a2d36]">
            For solar companies
          </Link>
          <Link href="/dashboard"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#14161c] shadow-[0_6px_18px_rgba(0,0,0,0.2)] hover:bg-[#f3eee2]">
            Open dashboard →
          </Link>
        </nav>
      </header>
      <div className="fixed inset-x-0 top-0 z-30 h-1">
        <div ref={barRef} className="h-full w-0 bg-[#f5b301]" />
      </div>

      <main className="relative z-10">
        {BEATS.map((b, i) => (
          <section key={i}
            className={`flex h-screen items-end px-6 pt-24 pb-16 lg:px-16 ${b.side === "left" ? "justify-start" : "justify-end"}`}>
            <Caption beat={b} first={i === 0} readoutRef={readoutRef} />
          </section>
        ))}
      </main>

      <div ref={cueRef} className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#14161c] px-4 py-2 text-xs font-semibold text-white transition-opacity duration-500">
        Scroll ↓
      </div>
    </ReactLenis>
  );
}

/**
 * Text set directly on the scene, with no card. A soft, edgeless shadow pool behind it plus a
 * text shadow keep it legible without blocking the 3D view.
 */
function Caption({ beat, first, readoutRef }: {
  beat: Beat;
  first: boolean;
  readoutRef: React.RefObject<ReadoutEls>;
}) {
  const Heading = first ? "h1" : "h2";
  return (
    <div className="relative max-w-[520px] text-white" style={{ textShadow: TEXT_SHADOW }}>
      <div aria-hidden
        className="pointer-events-none absolute -inset-x-24 -inset-y-20 -z-10 bg-[radial-gradient(closest-side,rgba(8,10,16,0.42),rgba(8,10,16,0.18)_60%,transparent)]" />
      <div className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#ffc629]">{beat.kicker}</div>
      <Heading className={`mt-3 font-semibold leading-[1.05] tracking-tight ${first ? "text-[40px] lg:text-[56px]" : "text-[32px] lg:text-[42px]"}`}>
        {beat.title}
      </Heading>
      <p className="mt-4 max-w-[440px] text-[16px] leading-relaxed text-white/90">{beat.body}</p>
      {beat.live && (
        <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-3">
          {([["clock", "06:00", "time of day"], ["power", "0.00 MW", "output now"], ["energy", "0.0 MWh", "generated today"]] as const)
            .map(([key, initial, label], i) => (
              <div key={key} className={i > 0 ? "border-l border-white/35 pl-7" : ""}>
                <dt className="sr-only">{label}</dt>
                <dd ref={(el) => { readoutRef.current[key] = el; }}
                  className={`text-2xl font-semibold tracking-tight tabular-nums ${key === "energy" ? "text-[#ffc629]" : ""}`}>
                  {initial}
                </dd>
                <dd className="text-[13px] text-white/80">{label}</dd>
              </div>
            ))}
        </dl>
      )}
      {beat.stats.length > 0 && <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-3">
        {beat.stats.map((st, i) => (
          <div key={st.label} className={i > 0 ? "border-l border-white/35 pl-7" : ""}>
            <dt className="sr-only">{st.label}</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">{st.value}</dd>
            <dd className="text-[13px] text-white/80">{st.label}</dd>
          </div>
        ))}
      </dl>}
      {beat.cta && (
        <Link href="/dashboard" style={{ textShadow: "none" }}
          className="mt-7 inline-flex items-center gap-3 rounded-full bg-[#f5b301] py-2.5 pr-2.5 pl-6 text-[15px] font-semibold text-[#14161c] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5">
          Open the dashboard
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#14161c] text-white">→</span>
        </Link>
      )}
    </div>
  );
}

/** Feeds Lenis scroll progress to the 3D scene through a ref, so scrolling never re-renders React. */
function ScrollProgress({ progressRef, barRef, cueRef }: {
  progressRef: React.RefObject<number>;
  barRef: React.RefObject<HTMLDivElement | null>;
  cueRef: React.RefObject<HTMLDivElement | null>;
}) {
  useLenis((lenis) => {
    progressRef.current = lenis.progress || 0;
    if (barRef.current) barRef.current.style.width = `${progressRef.current * 100}%`;
    if (cueRef.current) cueRef.current.style.opacity = progressRef.current > 0.03 ? "0" : "1";
  });
  return null;
}
