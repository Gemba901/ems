"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarVisit, CalendarRequest, CalendarBlock, VISIT_STATUS_COLOR } from "@/services/calendar.service";
import { MONTHS, MONTH_SHORT, addDays, dateToYMD } from "./calendarUtils";

export function WeekView({
  weekStart, weekEndDate, byDate, blockByDate, todayStr, selectedDay, setSelectedDay,
  isAdmin, prevWeek, nextWeek,
}: {
  weekStart: Date;
  weekEndDate: Date;
  byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
  blockByDate: Record<string, CalendarBlock>;
  todayStr: string;
  selectedDay: string | null;
  setSelectedDay: (d: string | null) => void;
  isAdmin: boolean;
  prevWeek: () => void;
  nextWeek: () => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekLabel =
    weekStart.getMonth() === weekEndDate.getMonth()
      ? `${weekStart.getDate()}–${weekEndDate.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
      : `${weekStart.getDate()} ${MONTH_SHORT[weekStart.getMonth()]} – ${weekEndDate.getDate()} ${MONTH_SHORT[weekEndDate.getMonth()]} ${weekEndDate.getFullYear()}`;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button onClick={prevWeek} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <h2 className="text-base font-bold text-slate-800">{weekLabel}</h2>
        <button onClick={nextWeek} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100">
        {days.map((d) => {
          const key         = dateToYMD(d);
          const isToday     = key === todayStr;
          const isSelected  = key === selectedDay;
          const block       = blockByDate[key];
          const dayVisits   = byDate[key]?.visits   ?? [];
          const dayRequests = byDate[key]?.requests ?? [];

          return (
            <div
              key={key}
              onClick={() => setSelectedDay(isSelected ? null : key)}
              className={`min-h-[120px] p-2 border-r border-slate-100 last:border-r-0 cursor-pointer transition-all ${
                block?.type === "HOLIDAY"  ? isSelected ? "bg-red-100"    : "bg-red-50 hover:bg-red-100"
                : block?.type === "BUSY_DAY" ? isSelected ? "bg-amber-100" : "bg-amber-50 hover:bg-amber-100"
                : isSelected ? "bg-blue-50" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex flex-col items-center mb-2">
                <p className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? "text-blue-500" : "text-slate-400"}`}>
                  {d.toLocaleDateString("en-GB", { weekday: "short" })}
                </p>
                <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-bold ${
                  isToday ? "bg-blue-600 text-white" : isSelected ? "bg-blue-100 text-blue-700" : "text-slate-700"
                }`}>
                  {d.getDate()}
                </div>
              </div>
              {block && (
                <div className={`text-[8px] font-bold text-center truncate ${block.type === "HOLIDAY" ? "text-red-500" : "text-amber-600"}`}>
                  {block.label ?? (block.type === "HOLIDAY" ? "Holiday" : "Busy")}
                </div>
              )}
              <div className="space-y-0.5">
                {dayVisits.slice(0, 3).map((v) => (
                  <div key={v.id} className={`text-[8px] font-semibold px-1 py-0.5 rounded truncate ${VISIT_STATUS_COLOR[v.status]}`}>
                    {v.clientOrgName ?? v.title}
                  </div>
                ))}
                {dayVisits.length > 3 && (
                  <p className="text-[8px] text-slate-400 text-center">+{dayVisits.length - 3}</p>
                )}
                {dayRequests.length > 0 && (
                  <div className="text-[8px] font-semibold px-1 py-0.5 rounded truncate bg-purple-100 text-purple-700">
                    {dayRequests.length} request{dayRequests.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
