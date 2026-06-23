"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, CheckCircle2, Minus, Plus, ChevronDown, Users, UserPlus } from "lucide-react";
import { CalendarService, CalendarVisit, ClientOrg, VisitStatus } from "@/services/calendar.service";
import { MONTHS } from "./calendarUtils";

export function VisitFormModal({
  orgs, token, editing, defaultDate, year, month, onClose, onSaved,
}: {
  orgs: ClientOrg[];
  token: string;
  editing: CalendarVisit | null;
  defaultDate?: string;
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientOrgId,    setClientOrgId]    = useState(editing?.clientOrgId ?? "");
  const [editDate,       setEditDate]       = useState(editing?.date ?? defaultDate ?? "");
  const [editAgenda,     setEditAgenda]     = useState(editing?.notes ?? "");
  const [status,         setStatus]         = useState<VisitStatus>(editing?.status ?? "TENTATIVE");
  const [completionNote, setCompletionNote] = useState(editing?.completionNote ?? "");
  const [visitCount,     setVisitCount]     = useState<number>(1);
  const [slots,          setSlots]          = useState<{ date: string; agenda: string }[]>([{ date: defaultDate ?? "", agenda: "" }]);
  const [showAttendees,  setShowAttendees]  = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const queryClient = useQueryClient();

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

  const { data: orgEmployees = [] } = useQuery({
    queryKey: ["calendar-org-employees", clientOrgId],
    queryFn: () => CalendarService.getOrgEmployees(clientOrgId, token),
    enabled: !!clientOrgId && showAttendees && !!editing,
  });

  const addAttendeeMutation = useMutation({
    mutationFn: ({ employeeId }: { employeeId: string }) =>
      CalendarService.addAttendee(editing!.id, { employeeId }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-month"] }),
  });

  const removeAttendeeMutation = useMutation({
    mutationFn: ({ employeeId }: { employeeId: string }) =>
      CalendarService.removeAttendee(editing!.id, employeeId, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-month"] }),
  });

  const currentAttendeeIds = new Set((editing?.attendees ?? []).map((a) => a.employeeId));
  const selectedOrg        = orgs.find((o) => o.id === clientOrgId);
  const monthPrefix        = `${year}-${String(month).padStart(2, "0")}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientOrgId) { setError("Please select a client."); return; }
    setSaving(true); setError(null);
    try {
      if (editing) {
        await CalendarService.updateVisit(editing.id, {
          clientOrgId,
          date: editDate || undefined,
          status,
          notes:          editAgenda     || undefined,
          completionNote: completionNote || undefined,
        }, token);
      } else {
        const datedSlots = slots.filter((s) => s.date);
        if (datedSlots.length === 0) { setError("Set a date for at least one visit."); setSaving(false); return; }
        const orgName = selectedOrg?.name ?? "Client";
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
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-900">{editing ? "Edit Visit" : "Schedule Visit"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Client */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Client Organization</label>
            <select className={`${inputCls} bg-white`} value={clientOrgId} onChange={(e) => setClientOrgId(e.target.value)}>
              <option value="">— Select client —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* Create mode: multi-visit slots */}
          {!editing && clientOrgId && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Number of visits — <span className="font-normal text-slate-400">{MONTHS[month - 1]} {year}</span>
                </label>
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden w-fit bg-white">
                  <button type="button" onClick={() => handleCountChange(visitCount - 1)} className="h-9 w-9 flex items-center justify-center hover:bg-slate-50 transition-colors border-r border-slate-100">
                    <Minus className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                  <input
                    type="number" min={1} max={31} value={visitCount}
                    onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
                    className="w-12 text-center text-sm font-bold text-slate-800 outline-none py-2"
                  />
                  <button type="button" onClick={() => handleCountChange(visitCount + 1)} className="h-9 w-9 flex items-center justify-center hover:bg-slate-50 transition-colors border-l border-slate-100">
                    <Plus className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {slots.map((slot, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl p-3.5 space-y-2.5 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <span className="text-xs font-semibold text-slate-600">Visit {i + 1}</span>
                    </div>
                    <input
                      type="date" value={slot.date}
                      min={`${monthPrefix}-01`} max={`${monthPrefix}-31`}
                      onChange={(e) => updateSlot(i, "date", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    />
                    <textarea
                      rows={2} placeholder="Agenda for this visit…" value={slot.agenda}
                      onChange={(e) => updateSlot(i, "agenda", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-300"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Edit mode */}
          {editing && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Date</label>
                <input type="date" className={inputCls} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Agenda</label>
                <textarea rows={3} className={`${inputCls} resize-none`} value={editAgenda} onChange={(e) => setEditAgenda(e.target.value)} placeholder="What will be covered during this visit?" />
              </div>
            </>
          )}

          {/* Status */}
          {(!!editing || !!clientOrgId) && (
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Status</label>
              <select className={`${inputCls} bg-white`} value={status} onChange={(e) => setStatus(e.target.value as VisitStatus)}>
                <option value="TENTATIVE">Tentative</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          )}

          {/* Completion summary */}
          {status === "COMPLETED" && (
            <div>
              <label className="text-xs font-semibold text-blue-500 block mb-1">Completion Summary</label>
              <textarea rows={2} className={`${inputCls} resize-none border-blue-200 focus:border-blue-400 focus:ring-blue-500/20`} value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} placeholder="What was accomplished during this visit?" />
            </div>
          )}

          {/* Attendees — edit only */}
          {editing && clientOrgId && (
            <div className="border border-slate-100 rounded-xl p-3 space-y-3">
              <button type="button" onClick={() => setShowAttendees((s) => !s)} className="flex items-center gap-2 w-full text-xs font-semibold text-slate-500">
                <Users className="h-3.5 w-3.5 text-indigo-400" />
                Attendees
                <span className="ml-auto text-slate-400">{editing.attendees?.length ?? 0}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAttendees ? "rotate-180" : ""}`} />
              </button>
              {showAttendees && (
                <div className="space-y-2">
                  {(editing.attendees ?? []).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 shrink-0">{a.name.charAt(0)}</div>
                      <span className="flex-1 text-slate-700">{a.name}</span>
                      {a.jobTitle && <span className="text-slate-400">{a.jobTitle}</span>}
                      <button type="button" onClick={() => removeAttendeeMutation.mutate({ employeeId: a.employeeId })} className="text-slate-300 hover:text-red-500 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-2">
                    <p className="text-[10px] text-slate-400 font-semibold mb-1.5">ADD FROM CLIENT ORG</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {orgEmployees.filter((e) => !currentAttendeeIds.has(e.id)).map((e) => (
                        <button key={e.id} type="button" onClick={() => addAttendeeMutation.mutate({ employeeId: e.id })}
                          className="flex items-center gap-2 w-full text-xs text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg px-2 py-1 transition-colors">
                          <UserPlus className="h-3 w-3 shrink-0" />
                          {e.firstName} {e.lastName}
                          {e.jobTitle && <span className="text-slate-400 ml-auto">{e.jobTitle}</span>}
                        </button>
                      ))}
                      {orgEmployees.filter((e) => !currentAttendeeIds.has(e.id)).length === 0 && (
                        <p className="text-xs text-slate-400 px-2 py-1">All employees added</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving || !clientOrgId} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Saving…" : editing ? "Save Changes" : `Schedule ${visitCount > 1 ? `${visitCount} Visits` : "Visit"}`}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
