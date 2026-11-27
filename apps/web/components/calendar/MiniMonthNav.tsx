"use client";

import { Button } from "@/components/ui/button";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS, getDaysInMonth, getFirstDayOfWeek, toYMD } from "./calendarUtils";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function MiniMonthNav({
  year, month, selectedDate, todayStr, markedDates, onPrev, onNext, onSelectDate,
}: {
  year: number;
  month: number;
  selectedDate: string | null;
  todayStr: string;
  markedDates: Set<string>;
  onPrev: () => void;
  onNext: () => void;
  onSelectDate: (dateStr: string) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-bold text-foreground">{MONTHS[month - 1]} {year}</p>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" aria-label="Previous period" onClick={onPrev} className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-muted">
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" aria-label="Next period" onClick={onNext} className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-muted">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className={`text-center text-[8px] font-bold ${i === 0 ? "text-danger" : "text-muted-foreground"}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dateStr = toYMD(year, month, day);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const isSunday = (firstDay + day - 1) % 7 === 0;
          const hasItems = markedDates.has(dateStr);
          return (
            <Button variant="ghost"
              key={day}
              onClick={() => onSelectDate(dateStr)}
              className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                isToday
                  ? "bg-primary text-primary-foreground"
                  : isSelected
                  ? "bg-info-subtle font-bold text-info"
                  : isSunday
                  ? "text-danger hover:bg-muted"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {day}
              {hasItems && !isToday && (
                <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-info" />
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
