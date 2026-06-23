"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { CalendarVisit, CalendarRequest, CalendarBlock } from "@/services/calendar.service";
import { MONTHS, toYMD, getDaysInMonth, getFirstDayOfWeek, addDays } from "./calendarUtils";

function MiniVisitMonth({
  year, month, byDate, blockByDate, todayStr, onSelectDay,
}: {
  year: number;
  month: number;
  byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
  blockByDate: Record<string, CalendarBlock>;
  todayStr: string;
  onSelectDay: (dateStr: string, month: number, year: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDayOfWeek(year, month);

  return (
    <div className="bg-white p-4">
      <h3 className="text-xs font-bold text-slate-700 mb-3">{MONTHS[month - 1]}</h3>
      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[8px] font-bold text-slate-300">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateStr     = toYMD(year, month, day);
          const dayData     = byDate[dateStr];
          const dayVisits   = dayData?.visits   ?? [];
          const dayRequests = dayData?.requests ?? [];
          const block       = blockByDate[dateStr];
          const isToday     = dateStr === todayStr;
          const hasActivity = dayVisits.length > 0 || dayRequests.length > 0 || !!block;

          let dotColor = "bg-slate-300";
          if (block?.type === "HOLIDAY")       dotColor = "bg-red-400";
          else if (block?.type === "BUSY_DAY") dotColor = "bg-amber-400";
          else if (dayRequests.length > 0 && dayVisits.length === 0) dotColor = "bg-purple-400";
          else if (dayVisits.length > 0) {
            const s = dayVisits[0].status;
            dotColor = s === "CONFIRMED" ? "bg-emerald-500"
                     : s === "COMPLETED" ? "bg-blue-400"
                     : s === "CANCELLED" ? "bg-slate-300"
                     : "bg-amber-400";
          }

          return (
            <button
              key={day}
              onClick={() => onSelectDay(dateStr, month, year)}
              className={`relative flex items-center justify-center rounded text-[9px] font-medium py-0.5 transition-colors ${
                isToday                          ? "bg-blue-600 text-white"
                : block?.type === "HOLIDAY"      ? "text-red-600 hover:bg-red-50"
                : block?.type === "BUSY_DAY"     ? "text-amber-600 hover:bg-amber-50"
                : hasActivity                    ? "text-slate-700 font-semibold hover:bg-blue-50"
                : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {day}
              {hasActivity && !isToday && (
                <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${dotColor}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function YearViewVisits({
  year, byDate, blockByDate, todayStr, isLoading, onSelectDay, prevYear, nextYear,
}: {
  year: number;
  byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
  blockByDate: Record<string, CalendarBlock>;
  todayStr: string;
  isLoading: boolean;
  onSelectDay: (dateStr: string, month: number, year: number) => void;
  prevYear: () => void;
  nextYear: () => void;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button onClick={prevYear} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <h2 className="text-base font-bold text-slate-800">{year}</h2>
        <button onClick={nextYear} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap px-5 py-3 border-b border-slate-50">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Tentative</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" />Completed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-400" />Request</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Holiday</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Busy Day</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-slate-100">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <MiniVisitMonth
                key={m}
                year={year}
                month={m}
                byDate={byDate}
                blockByDate={blockByDate}
                todayStr={todayStr}
                onSelectDay={onSelectDay}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
