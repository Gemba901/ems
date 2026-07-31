"use client";

import { AgendaItem, HolisticCalendarEvent } from "@/services/calendar.service";
import { EventChip } from "./EventChip";

export function DayCell({
  dateStr, dayNumber, topLabel, items, isToday, isSelected, isOutsideMonth, isSunday, isAvailable,
  maxVisible = 3, onSelectDay, onOpenItem, density = "compact", minHeight = "min-h-20",
}: {
  dateStr: string;
  dayNumber: number;
  topLabel?: string;
  items: AgendaItem[];
  isToday: boolean;
  isSelected: boolean;
  isOutsideMonth?: boolean;
  isSunday?: boolean;
  isAvailable?: boolean;
  maxVisible?: number;
  onSelectDay: (dateStr: string) => void;
  onOpenItem: (item: AgendaItem) => void;
  density?: "compact" | "detailed";
  minHeight?: string;
}) {
  const visible = items.slice(0, maxVisible);
  const overflow = items.length - visible.length;
  const hasPendingInvite = items.some(
    i => i.kind === "EVENT" && (i.detail as HolisticCalendarEvent).myInvitationStatus === "PENDING",
  );

  return (
    <div
      onClick={() => onSelectDay(dateStr)}
      className={`${minHeight} flex cursor-pointer flex-col gap-1 border-b border-r border-slate-50 p-1.5 transition-colors ${
        isSelected ? "bg-blue-50" : "hover:bg-slate-50"
      } ${isOutsideMonth ? "bg-slate-50/40" : ""}`}
    >
      <div className={`flex ${topLabel ? "flex-col items-center" : "items-center justify-start"} gap-0.5`}>
        {topLabel && (
          <p className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? "text-blue-500" : isSunday ? "text-red-500" : "text-slate-400"}`}>
            {topLabel}
          </p>
        )}
        <div
          className={`relative flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
            isToday
              ? "bg-blue-600 text-white"
              : isSelected
              ? "bg-blue-100 text-blue-700"
              : isOutsideMonth
              ? "text-slate-300"
              : isSunday
              ? "text-red-500"
              : "text-slate-700"
          }`}
        >
          {dayNumber}
          {hasPendingInvite && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-violet-500" />}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        {visible.map(item => (
          <EventChip
            key={`${item.kind}-${item.id}`}
            item={item}
            density={density}
            onClick={e => { e.stopPropagation(); onOpenItem(item); }}
            muted={isOutsideMonth}
          />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSelectDay(dateStr); }}
            className="px-1 text-left text-[9px] text-slate-400 hover:text-slate-600"
          >
            +{overflow} more
          </button>
        )}
        {isAvailable && items.length === 0 && (
          <p className="px-1 text-[9px] font-semibold text-emerald-600">Available</p>
        )}
      </div>
    </div>
  );
}
