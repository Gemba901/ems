"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, Loader2, Plus, X } from "lucide-react";
import { AgendaItem } from "@/services/calendar.service";
import { EventChip } from "./EventChip";

export function DayQuickPopover({
  dateStr, items, isLoading, isAdmin, adminOrgConfigured,
  onClose, onOpenItem, onCreateEvent, onCreateVisit, onCreateRequest, onCreateBlock,
}: {
  dateStr: string;
  items: AgendaItem[];
  isLoading?: boolean;
  isAdmin: boolean;
  adminOrgConfigured: boolean;
  onClose: () => void;
  onOpenItem: (item: AgendaItem) => void;
  onCreateEvent: () => void;
  onCreateVisit: () => void;
  onCreateRequest: () => void;
  onCreateBlock: () => void;
}) {
  const [mode, setMode] = useState<"list" | "create">(items.length > 0 ? "list" : "create");

  const dateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const createOptions: { label: string; onClick: () => void }[] = [
    { label: "Event", onClick: onCreateEvent },
    ...(isAdmin && adminOrgConfigured ? [{ label: "Scheduled Partner Visit", onClick: onCreateVisit }] : []),
    ...(!isAdmin && adminOrgConfigured ? [{ label: "Request a visit", onClick: onCreateRequest }] : []),
    ...(isAdmin && adminOrgConfigured ? [{ label: "Block a day", onClick: onCreateBlock }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          {mode === "create" && items.length > 0 && (
            <button onClick={() => setMode("list")} className="shrink-0 text-slate-400 hover:text-slate-600">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="flex-1 truncate text-sm font-bold text-slate-900">{dateLabel}</h2>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-2 overflow-y-auto p-4">
          {mode === "list" ? (
            isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <CalendarDays className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                <p className="text-sm font-medium text-slate-500">Nothing scheduled</p>
              </div>
            ) : (
              items.map(item => (
                <EventChip
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  density="detailed"
                  onClick={() => { onOpenItem(item); onClose(); }}
                />
              ))
            )
          ) : (
            createOptions.map(opt => (
              <button
                key={opt.label}
                type="button"
                onClick={() => { opt.onClick(); onClose(); }}
                className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                {opt.label}
              </button>
            ))
          )}
        </div>

        {mode === "list" && (
          <div className="border-t border-slate-100 p-4">
            <button
              type="button"
              onClick={() => setMode("create")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Add to this day
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
