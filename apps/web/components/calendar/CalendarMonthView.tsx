"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { AgendaItem } from "@/services/calendar.service";
import { DayCell } from "./DayCell";
import { DAYS, MONTHS, getDaysInMonth, getFirstDayOfWeek, toYMD } from "./calendarUtils";

export function CalendarMonthView({
  year, month, byDate, todayStr, selectedDate, isLoading, onSelectDate, onOpenItem, onPrev, onNext,
  isAdmin, adminOrgConfigured, busyDates,
}: {
  year: number;
  month: number;
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
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const prevMonthDate = new Date(year, month - 2, 1);
  const prevDaysInMonth = getDaysInMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1);

  const cells: { dateStr: string; dayNumber: number; outside: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDaysInMonth - i;
    cells.push({ dateStr: toYMD(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, d), dayNumber: d, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: toYMD(year, month, d), dayNumber: d, outside: false });
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  const nextMonthDate = new Date(year, month, 1);
  for (let d = 1; d <= trailing; d++) {
    cells.push({ dateStr: toYMD(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, d), dayNumber: d, outside: true });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
        <button onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <h2 className="text-base font-bold text-slate-800">{MONTHS[month - 1]} {year}</h2>
        <button onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-7 border-b border-slate-100">
        {DAYS.map((d, i) => (
          <div key={d} className={`py-2 text-center text-[10px] font-bold uppercase tracking-wide ${i === 0 ? "text-red-500" : "text-slate-400"}`}>{d}</div>
        ))}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-7">
          {cells.map(({ dateStr, dayNumber, outside }, i) => (
            <DayCell
              key={dateStr}
              dateStr={dateStr}
              dayNumber={dayNumber}
              items={byDate[dateStr] ?? []}
              isToday={dateStr === todayStr}
              isSelected={dateStr === selectedDate}
              isOutsideMonth={outside}
              isSunday={i % 7 === 0}
              isAvailable={canRequestVisit && !outside && i % 7 !== 0 && dateStr >= todayStr && !busyDates?.has(dateStr)}
              onSelectDay={onSelectDate}
              onOpenItem={onOpenItem}
              density="compact"
              maxVisible={3}
            />
          ))}
        </div>
      )}
    </div>
  );
}
