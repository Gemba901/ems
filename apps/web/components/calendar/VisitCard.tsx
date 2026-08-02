"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lock, Trash2, Building2, Clock, RefreshCw, Loader2, CheckCircle2, ChevronDown, Users, UserPlus, X,
} from "lucide-react";
import {
  CalendarService, CalendarVisit, VisitStatus,
  VISIT_STATUS_LABELS, VISIT_STATUS_COLOR, RECURRENCE_LABELS,
} from "@/services/calendar.service";
import { isSundayDate } from "./calendarUtils";

function weekdayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
}

export function StatusBadge({ status }: { status: VisitStatus }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${VISIT_STATUS_COLOR[status]}`}>
      {VISIT_STATUS_LABELS[status]}
    </span>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";

export function VisitCard({
  visit, token, isAdmin, onSaved, onDelete,
}: {
  visit: CalendarVisit;
  token: string;
  isAdmin: boolean;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [date, setDate] = useState(visit.date);
  const [status, setStatus] = useState<VisitStatus>(visit.status);
  const [notes, setNotes] = useState(visit.notes ?? "");
  const [completionNote, setCompletionNote] = useState(visit.completionNote ?? "");
  const [showAttendees, setShowAttendees] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const dirty = date !== visit.date || status !== visit.status || notes !== (visit.notes ?? "") || completionNote !== (visit.completionNote ?? "");

  const { data: orgEmployees = [] } = useQuery({
    queryKey: ["calendar-org-employees", visit.clientOrgId],
    queryFn: () => CalendarService.getOrgEmployees(visit.clientOrgId!, token),
    enabled: !!visit.clientOrgId && showAttendees,
  });

  const addAttendeeMutation = useMutation({
    mutationFn: ({ employeeId }: { employeeId: string }) => CalendarService.addAttendee(visit.id, { employeeId }, token),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-month"] }); onSaved(); },
  });

  const removeAttendeeMutation = useMutation({
    mutationFn: ({ employeeId }: { employeeId: string }) => CalendarService.removeAttendee(visit.id, employeeId, token),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-month"] }); onSaved(); },
  });

  if (!visit.isOwn && !isAdmin) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-500">Occupied</p>
          {(visit.startTime || visit.endTime) && (
            <p className="text-xs text-slate-400">{visit.startTime} {visit.endTime ? `– ${visit.endTime}` : ""}</p>
          )}
        </div>
      </div>
    );
  }

  const isMultiDay = !!visit.endDate && visit.endDate !== visit.date;
  const currentAttendeeIds = new Set((visit.attendees ?? []).map(a => a.employeeId));

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      if (date && isSundayDate(date)) { setError("Partner visits cannot be scheduled on Sundays."); setSaving(false); return; }
      await CalendarService.updateVisit(visit.id, {
        date: date || undefined,
        status,
        notes: notes || undefined,
        completionNote: completionNote || undefined,
      }, token);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 leading-tight">{visit.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={visit.status} />
          {visit.clientOrgName && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Building2 className="h-3 w-3" /> {visit.clientOrgName}
            </span>
          )}
        </div>
        {visit.notes && (
          <div className="border-t border-slate-100 pt-2">
            <p className="text-[10px] font-bold text-slate-400 mb-0.5">AGENDA</p>
            <p className="text-xs text-slate-500 leading-relaxed">{visit.notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-tight">{visit.title}</p>
          {isMultiDay && (
            <p className="text-[10px] text-indigo-500 font-medium mt-0.5">
              Multi-day · ends {visit.endDate}
            </p>
          )}
          {visit.recurrencePattern && (
            <p className="text-[10px] text-violet-500 font-medium flex items-center gap-1 mt-0.5">
              <RefreshCw className="h-2.5 w-2.5" /> {RECURRENCE_LABELS[visit.recurrencePattern]}
            </p>
          )}
        </div>
        <button onClick={() => onDelete(visit.id)} className="shrink-0 text-slate-400 hover:text-red-500 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {visit.clientOrgName && (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <Building2 className="h-3 w-3" /> {visit.clientOrgName}
        </span>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 block mb-1">Date</label>
          <div className="flex items-center gap-1.5">
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {date && <p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">{weekdayLabel(date)}</p>}
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 block mb-1">Status</label>
          <select className={`${inputCls} bg-white`} value={status} onChange={e => setStatus(e.target.value as VisitStatus)}>
            <option value="TENTATIVE">Tentative</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {(visit.startTime || visit.endTime) && (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3 w-3" />
          {visit.startTime ?? ""}{visit.endTime ? ` – ${visit.endTime}` : ""}
        </span>
      )}

      <div>
        <label className="text-[10px] font-semibold text-slate-400 block mb-1">Agenda</label>
        <textarea
          rows={3} className={`${inputCls} resize-none`} value={notes}
          onChange={e => setNotes(e.target.value)} placeholder="What will be covered during this visit?"
        />
      </div>

      {status === "COMPLETED" && (
        <div>
          <label className="text-[10px] font-semibold text-blue-500 block mb-1">Completion Summary</label>
          <textarea
            rows={2} className={`${inputCls} resize-none border-blue-200 focus:border-blue-400 focus:ring-blue-500/20`}
            value={completionNote} onChange={e => setCompletionNote(e.target.value)} placeholder="What was accomplished during this visit?"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg">{error}</p>}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      )}

      {visit.clientOrgId && (
        <div className="border-t border-slate-100 pt-2">
          <button type="button" onClick={() => setShowAttendees(s => !s)} className="flex items-center gap-2 w-full text-xs font-semibold text-slate-500">
            <Users className="h-3.5 w-3.5 text-indigo-400" />
            Attendees
            <span className="ml-auto text-slate-400">{visit.attendees?.length ?? 0}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAttendees ? "rotate-180" : ""}`} />
          </button>
          {showAttendees && (
            <div className="mt-2 space-y-2">
              {(visit.attendees ?? []).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 shrink-0">
                    {a.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-slate-700">{a.name}</span>
                  {a.jobTitle && <span className="text-slate-400">{a.jobTitle}</span>}
                  <button type="button" onClick={() => removeAttendeeMutation.mutate({ employeeId: a.employeeId })} className="text-slate-300 hover:text-red-500 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-2">
                <p className="text-[10px] text-slate-400 font-semibold mb-1.5">ADD FROM PARTNER ORG</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {orgEmployees.filter(e => !currentAttendeeIds.has(e.id)).map(e => (
                    <button key={e.id} type="button" onClick={() => addAttendeeMutation.mutate({ employeeId: e.id })}
                      className="flex items-center gap-2 w-full text-xs text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg px-2 py-1 transition-colors">
                      <UserPlus className="h-3 w-3 shrink-0" />
                      {e.firstName} {e.lastName}
                      {e.jobTitle && <span className="text-slate-400 ml-auto">{e.jobTitle}</span>}
                    </button>
                  ))}
                  {orgEmployees.filter(e => !currentAttendeeIds.has(e.id)).length === 0 && (
                    <p className="text-xs text-slate-400 px-2 py-1">All employees added</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
