"use client";

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

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Request a Visit</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <CreateTypeTabs active="REQUEST" isAdmin={isAdmin} adminOrgConfigured={adminOrgConfigured} dateStr={date || undefined} onSelect={onSwitchType} />

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Requested Date</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} />
            {date && !dateIsBusy && !dateIsSunday && (
              <p className="mt-1 text-[11px] font-semibold text-emerald-600">Available</p>
            )}
          </div>
          {dateIsBusy && (
            <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <Lock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600">This date is already booked. Please select a different date.</p>
            </div>
          )}
          {dateIsSunday && !dateIsBusy && (
            <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <Lock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600">Sundays are reserved for personal events. Please choose another date.</p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Preferred Time (optional)</label>
            <input type="time" className={inputCls} value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Message (optional)</label>
            <textarea rows={3} className={`${inputCls} resize-none`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What would you like to discuss or audit during this visit?" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving || dateIsBusy || dateIsSunday} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? "Sending…" : "Send Request"}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
