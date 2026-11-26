"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { useState } from "react";
import { X, Loader2, CheckCircle2, Minus, Plus } from "lucide-react";
import { CalendarService, PartnerOrg, VisitStatus } from "@/services/calendar.service";
import { MONTHS, isSundayDate } from "./calendarUtils";
import { CreateTypeTabs, CreateFlowType } from "./CreateTypeTabs";

function weekdayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
}

export function VisitFormModal({
  orgs, token, defaultDate, year, month, isAdmin, adminOrgConfigured, onSwitchType, onClose, onSaved,
}: {
  orgs: PartnerOrg[];
  token: string;
  defaultDate?: string;
  year: number;
  month: number;
  isAdmin: boolean;
  adminOrgConfigured: boolean;
  onSwitchType: (type: CreateFlowType) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientOrgId,    setClientOrgId]    = useState("");
  const [status,         setStatus]         = useState<VisitStatus>("TENTATIVE");
  const [completionNote, setCompletionNote] = useState("");
  const [visitCount,     setVisitCount]     = useState<number>(1);
  const [slots,          setSlots]          = useState<{ date: string; agenda: string }[]>([{ date: defaultDate ?? "", agenda: "" }]);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const handleCountChange = (n: number) => {
    const count = Math.max(1, Math.min(31, n));
    setVisitCount(count);
    setSlots((prev) => {
      if (count > prev.length) {
        return [...prev, ...Array.from({ length: count - prev.length }, () => ({ date: "", agenda: "" }))];
      }
      return prev.slice(0, count);
    });
  };

  const updateSlot = (i: number, field: "date" | "agenda", value: string) => {
    setSlots((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  const selectedOrg = orgs.find((o) => o.id === clientOrgId);
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientOrgId) { setError("Please select a partner."); return; }
    setSaving(true); setError(null);
    try {
      const datedSlots = slots.filter((s) => s.date);
      if (datedSlots.length === 0) { setError("Set a date for at least one visit."); setSaving(false); return; }
      if (datedSlots.some((s) => isSundayDate(s.date))) { setError("Partner visits cannot be scheduled on Sundays."); setSaving(false); return; }
      const orgName = selectedOrg?.name ?? "Partner";
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.date) continue;
        await CalendarService.createVisit({
          title: `${orgName} — Visit ${i + 1} · ${MONTHS[month - 1]} ${year}`,
          clientOrgId,
          date: s.date,
          status,
          notes: s.agenda || undefined,
          completionNote: completionNote || undefined,
        }, token);
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all";

  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-bold text-foreground">Schedule Partner Visit</DialogTitle>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-muted-foreground"><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <CreateTypeTabs active="VISIT" isAdmin={isAdmin} adminOrgConfigured={adminOrgConfigured} dateStr={defaultDate} onSelect={onSwitchType} />

          {/* Partner */}
          <div>
            <label htmlFor="calendar-visitform-partner-organization" className="text-xs font-semibold text-muted-foreground block mb-1">Partner Organization</label>
            <NativeSelect id="calendar-visitform-partner-organization" className={`${inputCls} bg-card`} value={clientOrgId} onChange={(e) => setClientOrgId(e.target.value)}>
              <option value="">— Select partner —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </div>

          {/* Multi-visit slots */}
          {clientOrgId && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Number of visits — <span className="font-normal text-muted-foreground">{MONTHS[month - 1]} {year}</span>
                </label>
                <div className="flex items-center border border-border rounded-xl overflow-hidden w-fit bg-card">
                  <Button variant="ghost" type="button" onClick={() => handleCountChange(visitCount - 1)} className="h-9 w-9 flex items-center justify-center hover:bg-muted transition-colors border-r border-border">
                    <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Input
                    type="number" min={1} max={31} value={visitCount}
                    onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
                    className="w-12 text-center text-sm font-bold text-foreground outline-none py-2"
                  />
                  <Button variant="ghost" type="button" onClick={() => handleCountChange(visitCount + 1)} className="h-9 w-9 flex items-center justify-center hover:bg-muted transition-colors border-l border-border">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {slots.map((slot, i) => (
                  <div key={i} className="border border-border rounded-xl p-3.5 space-y-2.5 bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <span className="text-xs font-semibold text-muted-foreground">Visit {i + 1}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date" value={slot.date}
                        min={`${monthPrefix}-01`} max={`${monthPrefix}-31`}
                        onChange={(e) => updateSlot(i, "date", e.target.value)}
                        className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                      />
                      {slot.date && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                          {weekdayLabel(slot.date)}
                        </span>
                      )}
                    </div>
                    <Textarea
                      rows={2} placeholder="Agenda for this visit…" value={slot.agenda}
                      onChange={(e) => updateSlot(i, "agenda", e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all placeholder:text-muted-foreground"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Status */}
          {!!clientOrgId && (
            <div>
              <label htmlFor="calendar-visitform-status" className="text-xs font-semibold text-muted-foreground block mb-1">Status</label>
              <NativeSelect id="calendar-visitform-status" className={`${inputCls} bg-card`} value={status} onChange={(e) => setStatus(e.target.value as VisitStatus)}>
                <option value="TENTATIVE">Tentative</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </NativeSelect>
            </div>
          )}

          {/* Completion summary */}
          {status === "COMPLETED" && (
            <div>
              <label htmlFor="calendar-visitform-completion-summary" className="text-xs font-semibold text-info block mb-1">Completion Summary</label>
              <Textarea id="calendar-visitform-completion-summary" rows={2} className={`${inputCls} resize-none border-info/20 focus:border-ring focus:ring-ring/20`} value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} placeholder="What was accomplished during this visit?" />
            </div>
          )}

          {error && <p className="text-sm text-danger bg-danger-subtle px-3 py-2 rounded-xl">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="ghost" type="submit" disabled={saving || !clientOrgId} className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Saving…" : `Schedule ${visitCount > 1 ? `${visitCount} Visits` : "Visit"}`}
            </Button>
            <Button variant="ghost" type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
