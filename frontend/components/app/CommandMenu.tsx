"use client";

import { Command } from "cmdk";
import { useEffect, useMemo } from "react";

import { Icon, Kbd } from "@/components/ui";
import { pct } from "@/lib/format";
import type { FarmSite, Society } from "@/lib/types";

import type { Page } from "./AppShell";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  societies: Society[];
  sites: FarmSite[];
  onNavigate: (page: Page) => void;
  onSite: (id: string) => void;
  onSociety: (s: Society) => void;
}

const PAGES: { id: Page; label: string; icon: keyof typeof Icon }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "leads", label: "Leads", icon: "leads" },
  { id: "live", label: "Live model", icon: "live" },
  { id: "dataset", label: "Dataset", icon: "dataset" },
];

/** ⌘K: jump to a page, switch farm site, or open any ranked society. */
export default function CommandMenu({ open, onOpenChange, societies, sites, onNavigate, onSite, onSociety }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Searching thousands of rows is noisy; the best-ranked 300 cover every useful lookup.
  const ranked = useMemo(() => [...societies].filter((s) => s.eligible).sort((a, b) => a.rank - b.rank).slice(0, 300), [societies]);

  const run = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command menu"
      // Plain substring match: predictable, and ties keep the societies in rank order.
      filter={(value, search) => (value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
      overlayClassName="fixed inset-0 z-50 bg-black/20"
      contentClassName="fixed top-[18vh] left-1/2 z-50 w-[560px] max-w-[calc(100vw-24px)] -translate-x-1/2 overflow-hidden rounded-2xl bg-surface shadow-pop">
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Icon.search className="text-muted" />
        <Command.Input placeholder="Search pages, sites or societies…"
          className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="max-h-[360px] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">No results.</Command.Empty>
        <Command.Group heading="Go to">
          {PAGES.map((p) => {
            const I = Icon[p.icon];
            return (
              <Item key={p.id} value={`page ${p.label}`} onSelect={() => run(() => onNavigate(p.id))}>
                <I className="text-muted" /> {p.label}
              </Item>
            );
          })}
        </Command.Group>
        <Command.Group heading="Farm site">
          {sites.map((s) => (
            <Item key={s.id} value={`site ${s.name}`} onSelect={() => run(() => onSite(s.id))}>
              <span className="grid h-4 w-4 place-items-center text-[11px]">☀</span> {s.name}
            </Item>
          ))}
        </Command.Group>
        <Command.Group heading="Societies">
          {ranked.map((s) => (
            <Item key={s.id} value={`${s.name} ${s.city} ${s.id}`} onSelect={() => run(() => onSociety(s))}>
              <span className="w-8 text-right text-[12px] text-faint tabular-nums">#{s.rank}</span>
              <span className="flex-1 truncate">{s.name} <span className="text-muted">· {s.city}</span></span>
              <span className="text-[12px] text-muted tabular-nums">{pct(s.prob)}</span>
            </Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Command.Item value={value} onSelect={onSelect}
      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13px] data-[selected=true]:bg-subtle">
      {children}
    </Command.Item>
  );
}
