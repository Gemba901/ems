"use client";

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

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Mark Out of Office</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <CreateTypeTabs active="BLOCK" isAdmin={isAdmin} adminOrgConfigured={adminOrgConfigured} onSelect={onSwitchType} />

          <p className="text-xs text-slate-500">{displayDate}</p>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Who is Out of Office</label>
            {loadingEmployees ? (
              <div className="flex items-center justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
            ) : (
              <select className={`${inputCls} bg-white`} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">— Select employee —</option>
                {orgEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              Label <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              className={inputCls}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Annual leave"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BanIcon className="h-4 w-4" />}
              {saving ? "Saving…" : "Mark Out of Office"}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
