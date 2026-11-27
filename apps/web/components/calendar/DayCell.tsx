"use client";

import { Button } from "@/components/ui/button";

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
      className={`${minHeight} flex cursor-pointer flex-col gap-1 border-b border-r border-border p-1.5 transition-colors ${
        isSelected ? "bg-info-subtle" : "hover:bg-muted"
      } ${isOutsideMonth ? "bg-muted/40" : ""}`}
    >
      <div className={`flex ${topLabel ? "flex-col items-center" : "items-center justify-start"} gap-0.5`}>
        {topLabel && (
          <p className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? "text-info" : isSunday ? "text-danger" : "text-muted-foreground"}`}>
            {topLabel}
          </p>
        )}
        <Button variant="ghost"
          type="button"
          aria-label={`Open ${dateStr}`}
          aria-current={isToday ? "date" : undefined}
          onClick={(event) => { event.stopPropagation(); onSelectDay(dateStr); }}
          className={`relative flex size-6 p-0 items-center justify-center rounded-full text-xs font-semibold ${
            isToday
              ? "bg-primary text-primary-foreground"
              : isSelected
              ? "bg-info-subtle text-info"
              : isOutsideMonth
              ? "text-muted-foreground"
              : isSunday
              ? "text-danger"
              : "text-foreground"
          }`}
        >
          {dayNumber}
          {hasPendingInvite && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />}
        </Button>
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
          <Button variant="ghost"
            type="button"
            onClick={e => { e.stopPropagation(); onSelectDay(dateStr); }}
            className="h-auto min-w-0 whitespace-normal px-1 text-left text-[9px] text-muted-foreground hover:text-muted-foreground"
          >
            +{overflow} more
          </Button>
        )}
        {isAvailable && items.length === 0 && (
          <p className="px-1 text-[9px] font-semibold text-success">Available</p>
        )}
      </div>
    </div>
  );
}
