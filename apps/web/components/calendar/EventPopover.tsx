"use client";

import { Button } from "@/components/ui/button";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span style={orgColor ? { backgroundColor: orgColor } : undefined} className={`mt-1 h-3 w-3 shrink-0 rounded-full ${orgColor ? "" : c.dot}`} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base font-bold leading-snug text-foreground">{item.title}</DialogTitle>
            {!item.allDay ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {fmtDateTime(item.startAt)} – {fmtTime(item.endAt)}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">{fmtDateTime(item.startAt).split(",")[0]} · All day</p>
            )}
          </div>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-muted-foreground"><X className="h-4 w-4" /></Button>
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
      </DialogContent>
    </Dialog>
  );
}
