"use client";

import { Button } from "@/components/ui/button";

import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from "lucide-react";
import { AgendaItem } from "@/services/calendar.service";
import { EventChip } from "./EventChip";

export function CalendarDayView({
  dateStr, items, isLoading, isToday, onPrev, onNext, onOpenItem,
}: {
  dateStr: string;
  items: AgendaItem[];
  isLoading: boolean;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenItem: (item: AgendaItem) => void;
}) {
  const date = new Date(`${dateStr}T00:00:00`);
  const label = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const sorted = [...items].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <Button variant="ghost" aria-label="Previous period" onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
        <div className="text-center">
          <h2 className="text-base font-bold text-foreground">{label}</h2>
          {isToday && <span className="text-[10px] font-bold text-info">Today</span>}
        </div>
        <Button variant="ghost" aria-label="Next period" onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">Nothing scheduled</p>
            <p className="mt-1 text-xs">Create an event to get started</p>
          </div>
        ) : (
          sorted.map(item => (
            <EventChip key={`${item.kind}-${item.id}`} item={item} density="detailed" onClick={() => onOpenItem(item)} />
          ))
        )}
      </div>
    </div>
  );
}
