"use client";

import { Lock, Edit2, Trash2, Building2, Clock, RefreshCw } from "lucide-react";
import {
  CalendarVisit, VisitStatus,
  VISIT_STATUS_LABELS, VISIT_STATUS_COLOR, RECURRENCE_LABELS,
} from "@/services/calendar.service";

export function StatusBadge({ status }: { status: VisitStatus }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${VISIT_STATUS_COLOR[status]}`}>
      {VISIT_STATUS_LABELS[status]}
    </span>
  );
}

export function VisitCard({
  visit, isAdmin, onEdit, onDelete,
}: {
  visit: CalendarVisit;
  isAdmin: boolean;
  onEdit: (v: CalendarVisit) => void;
  onDelete: (id: string) => void;
}) {
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
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
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <>
              <button onClick={() => onEdit(visit)} className="text-slate-400 hover:text-blue-600 transition-colors">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onDelete(visit.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={visit.status} />
        {visit.clientOrgName && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Building2 className="h-3 w-3" /> {visit.clientOrgName}
          </span>
        )}
        {(visit.startTime || visit.endTime) && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {visit.startTime ?? ""}{visit.endTime ? ` – ${visit.endTime}` : ""}
          </span>
        )}
      </div>
      {visit.notes && (
        <div className="border-t border-slate-100 pt-2">
          <p className="text-[10px] font-bold text-slate-400 mb-0.5">AGENDA</p>
          <p className="text-xs text-slate-500 leading-relaxed">{visit.notes}</p>
        </div>
      )}
      {visit.status === "COMPLETED" && visit.completionNote && (
        <div className="border border-blue-100 bg-blue-50 rounded-lg px-2.5 py-1.5">
          <p className="text-[10px] font-bold text-blue-500 mb-0.5">COMPLETION SUMMARY</p>
          <p className="text-xs text-blue-800">{visit.completionNote}</p>
        </div>
      )}
      {visit.attendees && visit.attendees.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <p className="text-[10px] font-bold text-slate-400 mb-1.5">ATTENDEES</p>
          <div className="flex flex-wrap gap-1.5">
            {visit.attendees.map((a) => (
              <div key={a.id} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                <div className="h-4 w-4 rounded-full bg-indigo-100 flex items-center justify-center text-[8px] font-bold text-indigo-600 shrink-0">
                  {a.name.charAt(0)}
                </div>
                <span className="text-[10px] text-slate-600">{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
