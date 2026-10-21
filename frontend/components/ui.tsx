"use client";

/*
 * Small shared primitives for the dashboard. Deliberately few: hairline cards, quiet buttons,
 * a segmented control and a stat group cover almost every screen.
 */

import { useLayoutEffect, useRef, useState } from "react";

import AnimatedNumber from "@/components/AnimatedNumber";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx("rounded-2xl bg-surface shadow-card", className)}>{children}</section>;
}

export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 truncate text-[12px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" };

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap select-none",
        "transition-[background-color,box-shadow,transform,color] duration-150 ease-snappy active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]",
        variant === "primary" && "bg-ink text-white hover:bg-ink/85",
        variant === "secondary" && "bg-surface text-ink shadow-card hover:bg-subtle",
        variant === "ghost" && "text-muted hover:bg-subtle hover:text-ink",
        className,
      )}
    />
  );
}

/** Segmented control; the highlight measures the active segment and slides to it. */
export function Segmented<T extends string | number>({ options, value, onChange, size = "md" }: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const index = options.findIndex((o) => o.value === value);
  useLayoutEffect(() => {
    const el = refs.current[index];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [index, options.length]);
  return (
    <div className="relative inline-flex rounded-lg bg-subtle p-0.5">
      {pill && (
        <span aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-md bg-surface shadow-card transition-[left,width] duration-200 ease-snappy"
          style={{ left: pill.left, width: pill.width }} />
      )}
      {options.map((o, i) => (
        <button key={String(o.value)} ref={(el) => { refs.current[i] = el; }} onClick={() => onChange(o.value)}
          className={cx(
            "relative z-10 rounded-md px-3 font-medium whitespace-nowrap transition-colors duration-150",
            size === "sm" ? "h-6 text-[12px]" : "h-7 text-[13px]",
            o.value === value ? "text-ink" : "text-muted hover:text-ink",
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A row of stats separated by hairlines, inside one card. */
export function StatGroup({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x [&>*]:border-line max-md:[&>*:nth-child(-n+2)]:border-b">
      {children}
    </Card>
  );
}

export function Stat({ label, value, format, hint, children }: {
  label: string;
  value: number | null;
  format: (v: number) => string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight">
        {value == null ? <span className="text-faint">—</span> : <AnimatedNumber value={value} format={format} duration={450} />}
      </div>
      {hint && <div className="mt-2 truncate text-[12px] text-muted">{hint}</div>}
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

/** Colour dot + label, used for quadrants, stages and roles. */
export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

/** Thin horizontal bar for a 0–1 value. */
export function Meter({ value, color = "var(--color-ink)", className }: { value: number; color?: string; className?: string }) {
  return (
    <span className={cx("block h-1 overflow-hidden rounded-full bg-subtle", className)}>
      <span className="block h-full rounded-full transition-[width] duration-300 ease-snappy"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </span>
  );
}

// ------------------------------------------------------------------ icons (1.5px stroke, 16px)

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}

export const Icon = {
  overview: (p: { className?: string }) => (
    <Svg {...p}><rect x="2" y="2" width="5" height="5" rx="1.2" /><rect x="9" y="2" width="5" height="5" rx="1.2" /><rect x="2" y="9" width="5" height="5" rx="1.2" /><rect x="9" y="9" width="5" height="5" rx="1.2" /></Svg>
  ),
  leads: (p: { className?: string }) => (
    <Svg {...p}><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.5" cy="4" r=".6" fill="currentColor" /><circle cx="2.5" cy="8" r=".6" fill="currentColor" /><circle cx="2.5" cy="12" r=".6" fill="currentColor" /></Svg>
  ),
  live: (p: { className?: string }) => <Svg {...p}><path d="M1.5 8h3l1.5-4 3 8 1.5-4h4" /></Svg>,
  dataset: (p: { className?: string }) => (
    <Svg {...p}><ellipse cx="8" cy="3.5" rx="5.5" ry="2" /><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" /></Svg>
  ),
  search: (p: { className?: string }) => <Svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="m13.5 13.5-3.3-3.3" /></Svg>,
  sliders: (p: { className?: string }) => (
    <Svg {...p}><path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" /><circle cx="10.5" cy="4.5" r="1.5" /><circle cx="5.5" cy="11.5" r="1.5" /></Svg>
  ),
  close: (p: { className?: string }) => <Svg {...p}><path d="m4 4 8 8M12 4l-8 8" /></Svg>,
  copy: (p: { className?: string }) => <Svg {...p}><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></Svg>,
  pin: (p: { className?: string }) => <Svg {...p}><path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14Z" /><circle cx="8" cy="6.5" r="1.5" /></Svg>,
  play: (p: { className?: string }) => <Svg {...p}><path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" /></Svg>,
  pause: (p: { className?: string }) => <Svg {...p}><path d="M5.5 3.5v9M10.5 3.5v9" /></Svg>,
  restart: (p: { className?: string }) => <Svg {...p}><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3" /></Svg>,
  arrow: (p: { className?: string }) => <Svg {...p}><path d="M3 8h10M9 4l4 4-4 4" /></Svg>,
  sparkle: (p: { className?: string }) => <Svg {...p}><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12" /></Svg>,
};
