"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { useState } from "react";
import { Lock, Loader2, Send, X } from "lucide-react";
import { CalendarService } from "@/services/calendar.service";
import { CreateTypeTabs, CreateFlowType } from "./CreateTypeTabs";
import { isSundayDate } from "./calendarUtils";

export function RequestModal({
  token, defaultDate, busyDates, isAdmin, adminOrgConfigured, onSwitchType, onClose, onSaved,
}: {
  token: string;
  defaultDate?: string;
  busyDates: Set<string>;
  isAdmin: boolean;
  adminOrgConfigured: boolean;
  onSwitchType: (type: CreateFlowType) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date,          setDate]          = useState(defaultDate ?? "");
  const [preferredTime, setPreferredTime] = useState("");
  const [message,       setMessage]       = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const dateIsBusy = !!date && busyDates.has(date);
  const dateIsSunday = !!date && isSundayDate(date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setError("Please select a date."); return; }
    if (dateIsBusy) { setError("This date is unavailable. Please choose another date."); return; }
    if (dateIsSunday) { setError("Sundays are reserved for personal events. Please choose another date."); return; }
    setSaving(true); setError(null);
    try {
      await CalendarService.createRequest({ requestedDate: date, preferredTime: preferredTime || undefined, message: message || undefined }, token);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally { setSaving(false); }
  };

  const inputCls = "w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all";

  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-bold text-foreground">Request a Visit</DialogTitle>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-muted-foreground"><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <CreateTypeTabs active="REQUEST" isAdmin={isAdmin} adminOrgConfigured={adminOrgConfigured} dateStr={date || undefined} onSelect={onSwitchType} />

          <div>
            <label htmlFor="calendar-request-requested-date" className="text-xs font-semibold text-muted-foreground block mb-1">Requested Date</label>
            <Input id="calendar-request-requested-date" type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} />
            {date && !dateIsBusy && !dateIsSunday && (
              <p className="mt-1 text-[11px] font-semibold text-success">Available</p>
            )}
          </div>
          {dateIsBusy && (
            <div className="flex items-start gap-2.5 bg-muted border border-border rounded-xl px-3 py-2.5">
              <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">This date is already booked. Please select a different date.</p>
            </div>
          )}
          {dateIsSunday && !dateIsBusy && (
            <div className="flex items-start gap-2.5 bg-muted border border-border rounded-xl px-3 py-2.5">
              <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">Sundays are reserved for personal events. Please choose another date.</p>
            </div>
          )}
          <div>
            <label htmlFor="calendar-request-preferred-time-optional" className="text-xs font-semibold text-muted-foreground block mb-1">Preferred Time (optional)</label>
            <Input id="calendar-request-preferred-time-optional" type="time" className={inputCls} value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
          </div>
          <div>
            <label htmlFor="calendar-request-message-optional" className="text-xs font-semibold text-muted-foreground block mb-1">Message (optional)</label>
            <Textarea id="calendar-request-message-optional" rows={3} className={`${inputCls} resize-none`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What would you like to discuss or audit during this visit?" />
          </div>
          {error && <p className="text-sm text-danger bg-danger-subtle px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-3">
            <Button variant="ghost" type="submit" disabled={saving || dateIsBusy || dateIsSunday} className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? "Sending…" : "Send Request"}
            </Button>
            <Button variant="ghost" type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
