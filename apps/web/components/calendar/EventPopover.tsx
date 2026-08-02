"use client";

import { X, Clock } from "lucide-react";
import {
  AgendaItem, EVENT_COLOR_CONFIG, EventColor, HolisticCalendarEvent,
} from "@/services/calendar.service";
import { AgendaItemBody } from "./AgendaItemBody";

function cfg(color: string) {
  return EVENT_COLOR_CONFIG[color as EventColor] ?? EVENT_COLOR_CONFIG.GRAPHITE;
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function EventPopover({
  item, token, isAdmin, onClose, onChanged, onEditEvent, onDeleteVisit, onUnblock,
}: {
  item: AgendaItem;
  token: string;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEditEvent: (event: HolisticCalendarEvent) => void;
  onDeleteVisit: (id: string) => void;
  onUnblock: (id: string) => void;
}) {
  const c = cfg(item.color);
  const orgColor = item.orgColor || undefined;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span style={orgColor ? { backgroundColor: orgColor } : undefined} className={`mt-1 h-3 w-3 shrink-0 rounded-full ${orgColor ? "" : c.dot}`} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-snug text-slate-900">{item.title}</h2>
            {!item.allDay ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3 w-3" /> {fmtDateTime(item.startAt)} – {fmtTime(item.endAt)}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-400">{fmtDateTime(item.startAt).split(",")[0]} · All day</p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <AgendaItemBody
            item={item}
            token={token}
            isAdmin={isAdmin}
            onChanged={onChanged}
            onEditEvent={onEditEvent}
            onDeleteVisit={onDeleteVisit}
            onUnblock={onUnblock}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
