"use client";

import { AgendaItem, EVENT_COLOR_CONFIG, EventColor, HolisticCalendarEvent } from "@/services/calendar.service";

const KIND_LABEL: Record<string, string> = {
  EVENT: "Event",
  VISIT: "Visit",
  REQUEST: "Request",
  BLOCK: "Blocked",
  BIRTHDAY: "Birthday",
  CLIENT_VISIT: "New Client Visit",
};

function cfg(color: string) {
  return EVENT_COLOR_CONFIG[color as EventColor] ?? EVENT_COLOR_CONFIG.GRAPHITE;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function EventChip({
  item, density = "compact", onClick, muted,
}: {
  item: AgendaItem;
  density?: "dot" | "compact" | "detailed";
  onClick?: (e: React.MouseEvent) => void;
  muted?: boolean;
}) {
  const c = cfg(item.color);
  const orgColor = item.orgColor || undefined;
  const isPendingInvite = item.kind === "EVENT" && (item.detail as HolisticCalendarEvent).myInvitationStatus === "PENDING";

  if (density === "dot") {
    return (
      <span
        onClick={onClick}
        title={item.title}
        style={orgColor ? { backgroundColor: orgColor } : undefined}
        className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 cursor-pointer ${orgColor ? "" : c.dot}`}
      />
    );
  }

  if (density === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={item.title}
        style={orgColor ? { backgroundColor: `${orgColor}1A`, color: orgColor } : undefined}
        className={`flex items-center gap-1 w-full rounded px-1 py-0.5 text-left text-[10px] font-medium truncate transition-all hover:brightness-95 ${orgColor ? "" : c.badge} ${muted ? "opacity-50" : ""}`}
      >
        <span style={orgColor ? { backgroundColor: orgColor } : undefined} className={`h-1.5 w-1.5 rounded-full shrink-0 ${orgColor ? "" : c.dot}`} />
        <span className="flex-1 truncate">
          {!item.allDay ? `${fmtTime(item.startAt)} ` : ""}
          {item.title}
        </span>
        {isPendingInvite && <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={orgColor ? { borderColor: orgColor } : undefined}
      className={`flex w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left transition-colors hover:brightness-95 ${orgColor ? "" : c.border}`}
    >
      <span style={orgColor ? { backgroundColor: orgColor } : undefined} className={`h-2 w-2 rounded-full shrink-0 ${orgColor ? "" : c.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
        {!item.allDay && (
          <p className="mt-0.5 text-[10px] leading-none text-slate-400">
            {fmtTime(item.startAt)} – {fmtTime(item.endAt)}
          </p>
        )}
      </div>
      <span
        style={orgColor ? { backgroundColor: `${orgColor}1A`, color: orgColor } : undefined}
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${orgColor ? "" : c.badge}`}
      >
        {KIND_LABEL[item.kind]}
      </span>
      {isPendingInvite && <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" title="Pending invitation" />}
    </button>
  );
}
