"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2, BanIcon } from "lucide-react";
import { CalendarService } from "@/services/calendar.service";
import { CreateTypeTabs, CreateFlowType } from "./CreateTypeTabs";

export function BlockDayModal({
  token, date, currentEmployeeId, isAdmin, adminOrgConfigured, onSwitchType, onClose, onSaved,
}: {
  token: string;
  date: string;
  currentEmployeeId?: string;
  isAdmin: boolean;
  adminOrgConfigured: boolean;
  onSwitchType: (type: CreateFlowType) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label,      setLabel]      = useState("");
  const [employeeId, setEmployeeId] = useState(currentEmployeeId ?? "");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const { data: orgEmployees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["calendar-org-employees-invite"],
    queryFn: () => CalendarService.getOrgEmployeesForInvite(token),
  });

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) { setError("Select who is Out of Office."); return; }
    setSaving(true); setError(null);
    try {
      await CalendarService.createBlock({
        date, type: "BUSY_DAY", label: label.trim() || undefined, employeeId,
      }, token);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to mark Out of Office");
    } finally { setSaving(false); }
  };

  const inputCls = "w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all";

  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-0 overflow-y-auto p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-bold text-foreground">Mark Out of Office</DialogTitle>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-muted-foreground"><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <CreateTypeTabs active="BLOCK" isAdmin={isAdmin} adminOrgConfigured={adminOrgConfigured} dateStr={date} onSelect={onSwitchType} />

          <p className="text-xs text-muted-foreground">{displayDate}</p>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Who is Out of Office</label>
            {loadingEmployees ? (
              <div className="flex items-center justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <NativeSelect className={`${inputCls} bg-card`} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">— Select employee —</option>
                {orgEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                ))}
              </NativeSelect>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Label <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              className={inputCls}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Annual leave"
            />
          </div>
          {error && <p className="text-sm text-danger bg-danger-subtle px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="ghost" type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-foreground hover:bg-foreground disabled:opacity-50 text-primary-foreground py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BanIcon className="h-4 w-4" />}
              {saving ? "Saving…" : "Mark Out of Office"}
            </Button>
            <Button variant="ghost" type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
