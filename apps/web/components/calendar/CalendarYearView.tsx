"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { AgendaItem, EVENT_COLOR_CONFIG, EventColor } from "@/services/calendar.service";
import { MONTHS, getDaysInMonth, getFirstDayOfWeek, toYMD } from "./calendarUtils";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function dotClass(color: string) {
  return (EVENT_COLOR_CONFIG[color as EventColor] ?? EVENT_COLOR_CONFIG.GRAPHITE).dot;
}

function MiniMonth({
  year, month, byDate, todayStr, onSelectDay,
}: {
  year: number;
  month: number;
  byDate: Record<string, AgendaItem[]>;
  todayStr: string;
  onSelectDay: (dateStr: string, month: number, year: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  return (
    <div className="bg-white p-4">
      <h3 className="mb-3 text-xs font-bold text-slate-700">{MONTHS[month - 1]}</h3>
      <div className="mb-1 grid grid-cols-7">
        {DAY_LABELS.map((d, i) => <div key={i} className="text-center text-[8px] font-bold text-slate-300">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dateStr = toYMD(year, month, day);
          const items = byDate[dateStr] ?? [];
          const isToday = dateStr === todayStr;
          const hasItems = items.length > 0;
          return (
            <button
              key={day}
              onClick={() => onSelectDay(dateStr, month, year)}
              title={hasItems ? `${items.length} item${items.length > 1 ? "s" : ""}` : undefined}
              className={`relative rounded py-0.5 text-center text-[9px] font-medium transition-colors ${
                isToday
                  ? "bg-blue-600 text-white"
                  : hasItems
                  ? "font-semibold text-slate-700 hover:bg-blue-50"
                  : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {day}
              {hasItems && !isToday && (
                <span
                  style={items[0].orgColor ? { backgroundColor: items[0].orgColor } : undefined}
                  className={`absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${items[0].orgColor ? "" : dotClass(items[0].color)}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarYearView({
  year, byDate, todayStr, isLoading, onSelectDay, onPrev, onNext,
}: {
  year: number;
  byDate: Record<string, AgendaItem[]>;
  todayStr: string;
  isLoading: boolean;
  onSelectDay: (dateStr: string, month: number, year: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <button onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <h2 className="text-base font-bold text-slate-800">{year}</h2>
        <button onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <MiniMonth key={m} year={year} month={m} byDate={byDate} todayStr={todayStr} onSelectDay={onSelectDay} />
          ))}
        </div>
      )}
    </div>
  );
}
