"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Loader2, Calendar } from "lucide-react";
import { AgendaItem, HolisticCalendarEvent } from "@/services/calendar.service";
import { EventChip } from "./EventChip";
import { AgendaItemBody } from "./AgendaItemBody";
import { MONTHS } from "./calendarUtils";

export function CalendarScheduleView({
  year, month, byDate, isLoading, selectedDate, onSelectDate, onOpenItem, onPrev, onNext,
  token, isAdmin, onChanged, onEditEvent, onDeleteVisit, onUnblock,
}: {
  year: number;
  month: number;
  byDate: Record<string, AgendaItem[]>;
  isLoading: boolean;
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
  onOpenItem: (item: AgendaItem) => void;
  onPrev: () => void;
  onNext: () => void;
  token: string;
  isAdmin: boolean;
  onChanged: () => void;
  onEditEvent: (event: HolisticCalendarEvent) => void;
  onDeleteVisit: (id: string) => void;
  onUnblock: (id: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysWithItems = Object.keys(byDate).filter(d => byDate[d].length > 0 && d >= monthStart).sort();

  const grouped: { monthKey: string; days: string[] }[] = [];
  for (const dateStr of daysWithItems) {
    const mk = dateStr.slice(0, 7);
    if (!grouped.length || grouped[grouped.length - 1].monthKey !== mk) grouped.push({ monthKey: mk, days: [] });
    grouped[grouped.length - 1].days.push(dateStr);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
        <button onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-800">{MONTHS[month - 1]} {year}</h2>
          <p className="text-[10px] text-slate-400">Showing the next 3 months</p>
        </div>
        <button onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : daysWithItems.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Calendar className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="font-medium text-slate-500">Nothing in the next 3 months</p>
          <p className="mt-1 text-xs">Create something to get started</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {grouped.map(({ monthKey, days }) => {
            const [gy, gm] = monthKey.split("-").map(Number);
            return (
              <div key={monthKey}>
                <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-5 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{MONTHS[gm - 1]} {gy}</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {days.map(dateStr => {
                    const items = byDate[dateStr] ?? [];
                    const date = new Date(`${dateStr}T00:00:00`);
                    const isSel = dateStr === selectedDate;
                    return (
                      <div
                        key={dateStr}
                        onClick={() => onSelectDate(dateStr)}
                        className={`flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors ${isSel ? "bg-blue-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="w-10 shrink-0 pt-0.5 text-center text-slate-500">
                          <p className="mb-0.5 text-[9px] font-bold uppercase leading-none tracking-wide">
                            {date.toLocaleDateString("en-GB", { weekday: "short" })}
                          </p>
                          <p className="text-xl font-bold leading-none text-slate-800">{date.getDate()}</p>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                          {items.map(item => {
                            const key = `${item.kind}-${item.id}`;
                            const isExpanded = expandedIds.has(key);
                            return (
                              <div key={key} className="flex items-start gap-1">
                                <div className="min-w-0 flex-1">
                                  <EventChip item={item} density="detailed" onClick={e => { e.stopPropagation(); onOpenItem(item); }} />
                                  {isExpanded && (
                                    <div
                                      onClick={e => e.stopPropagation()}
                                      className="mt-1.5 space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                                    >
                                      <AgendaItemBody
                                        item={item}
                                        token={token}
                                        isAdmin={isAdmin}
                                        onChanged={onChanged}
                                        onEditEvent={onEditEvent}
                                        onDeleteVisit={onDeleteVisit}
                                        onUnblock={onUnblock}
                                        onClose={() => toggleExpanded(key)}
                                      />
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); toggleExpanded(key); }}
                                  aria-label={isExpanded ? "Collapse details" : "Expand details"}
                                  className="mt-1.5 shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                >
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
