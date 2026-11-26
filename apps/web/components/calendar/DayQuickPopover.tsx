"use client";

import { Button } from "@/components/ui/button";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { CalendarDays, Loader2, Plus, X } from "lucide-react";
import { AgendaItem } from "@/services/calendar.service";
import { EventChip } from "./EventChip";

export function DayQuickPopover({
  dateStr, items, isLoading, onClose, onOpenItem, onCreate,
}: {
  dateStr: string;
  items: AgendaItem[];
  isLoading?: boolean;
  onClose: () => void;
  onOpenItem: (item: AgendaItem) => void;
  onCreate: () => void;
}) {
  const dateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[80dvh] flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <DialogTitle className="flex-1 truncate text-sm font-bold text-foreground">{dateLabel}</DialogTitle>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-muted-foreground"><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-2 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Nothing scheduled</p>
            </div>
          ) : (
            items.map(item => (
              <EventChip
                key={`${item.kind}-${item.id}`}
                item={item}
                density="detailed"
                onClick={() => { onOpenItem(item); onClose(); }}
              />
            ))
          )}
        </div>

        <div className="border-t border-border p-4">
          <Button variant="ghost"
            type="button"
            onClick={() => { onCreate(); onClose(); }}
            className="h-auto min-w-0 whitespace-normal flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add to this day
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
