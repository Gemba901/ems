"use client";

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
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-bold text-slate-700">{MONTHS[month - 1]} {year}</p>
        <div className="flex items-center gap-0.5">
          <button onClick={onPrev} className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-slate-100">
            <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <button onClick={onNext} className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-slate-100">
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[8px] font-bold text-slate-300">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dateStr = toYMD(year, month, day);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasItems = markedDates.has(dateStr);
          return (
            <button
              key={day}
              onClick={() => onSelectDate(dateStr)}
              className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                isToday
                  ? "bg-blue-600 text-white"
                  : isSelected
                  ? "bg-blue-100 font-bold text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {day}
              {hasItems && !isToday && (
                <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
