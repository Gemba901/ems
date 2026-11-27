"use client";

import { Button } from "@/components/ui/button";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { AgendaItem } from "@/services/calendar.service";
import { DayCell } from "./DayCell";
import { MONTHS, MONTH_SHORT, addDays, dateToYMD } from "./calendarUtils";

export function CalendarWeekView({
  weekStart, byDate, todayStr, selectedDate, isLoading, onSelectDate, onOpenItem, onPrev, onNext,
  isAdmin, adminOrgConfigured, busyDates,
}: {
  weekStart: Date;
  byDate: Record<string, AgendaItem[]>;
  todayStr: string;
  selectedDate: string | null;
  isLoading: boolean;
  onSelectDate: (d: string) => void;
  onOpenItem: (item: AgendaItem) => void;
  onPrev: () => void;
  onNext: () => void;
  isAdmin?: boolean;
  adminOrgConfigured?: boolean;
  busyDates?: Set<string>;
}) {
  const canRequestVisit = !isAdmin && !!adminOrgConfigured;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()}–${weekEnd.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()} ${MONTH_SHORT[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <Button variant="ghost" aria-label="Previous period" onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
        <h2 className="text-base font-bold text-foreground">{weekLabel}</h2>
        <Button variant="ghost" aria-label="Next period" onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-7">
          {days.map(day => {
            const key = dateToYMD(day);
            return (
              <DayCell
                key={key}
                dateStr={key}
                dayNumber={day.getDate()}
                topLabel={day.toLocaleDateString("en-GB", { weekday: "short" })}
                items={byDate[key] ?? []}
                isToday={key === todayStr}
                isSelected={key === selectedDate}
                isSunday={day.getDay() === 0}
                isAvailable={canRequestVisit && day.getDay() !== 0 && key >= todayStr && !busyDates?.has(key)}
                onSelectDay={onSelectDate}
                onOpenItem={onOpenItem}
                density="compact"
                maxVisible={6}
                minHeight="min-h-40"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
