"use client";

import Link from "next/link";

import { cx, Icon, Kbd } from "@/components/ui";

export type Page = "overview" | "leads" | "live" | "dataset";

const NAV: { id: Page; label: string; icon: keyof typeof Icon }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "leads", label: "Leads", icon: "leads" },
  { id: "live", label: "Live model", icon: "live" },
  { id: "dataset", label: "Dataset", icon: "dataset" },
];

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  liveConnected: boolean;
  onOpenCommand: () => void;
  children: React.ReactNode;
}

/** Slim navigation rail, a sticky top bar and the page content. */
export default function AppShell({ page, onNavigate, title, subtitle, actions, liveConnected, onOpenCommand, children }: Props) {
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[212px] flex-col border-r border-line px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-[14px] font-semibold tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-sun text-[12px]">☀</span>
          SolarLeads
        </Link>
        <nav className="space-y-0.5">
          {NAV.map((n) => <NavItem key={n.id} item={n} active={page === n.id} live={n.id === "live" && liveConnected} onClick={() => onNavigate(n.id)} />)}
        </nav>
        <Link href="/client"
          className="mt-auto flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink">
          <Icon.arrow className="text-faint" /> Client portal
        </Link>
        <button onClick={onOpenCommand}
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink">
          <Icon.search /> Search
          <span className="ml-auto flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>
      </aside>

      <div className="lg:pl-[212px]">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-4 px-5 lg:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <button onClick={onOpenCommand} aria-label="Search"
                className="grid h-8 w-8 place-items-center rounded-full bg-surface text-muted shadow-card transition-colors hover:bg-subtle hover:text-ink lg:hidden">
                <Icon.search />
              </button>
            </div>
          </div>
          {/* Compact navigation below lg, where the rail is hidden. */}
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => onNavigate(n.id)}
                className={cx("h-7 rounded-md px-2.5 text-[13px] whitespace-nowrap", page === n.id ? "bg-surface font-medium shadow-card" : "text-muted")}>
                {n.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-[1320px] px-5 py-6 lg:px-8 lg:py-7">
          {subtitle && <p className="mb-5 text-[14px] text-muted">{subtitle}</p>}
          <div key={page} className="animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ item, active, live, onClick }: {
  item: (typeof NAV)[number];
  active: boolean;
  live: boolean;
  onClick: () => void;
}) {
  const I = Icon[item.icon];
  return (
    <button onClick={onClick}
      className={cx(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors duration-150",
        active ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:bg-subtle hover:text-ink",
      )}>
      <I className={active ? "text-ink" : "text-faint"} />
      {item.label}
      {live && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-good" />}
    </button>
  );
}
