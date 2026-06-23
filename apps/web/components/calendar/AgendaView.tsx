"use client";

import { useState } from "react";
import { Building2, Clock, FileText, Edit2, Trash2, Loader2, CalendarX2, BanIcon, X } from "lucide-react";
import {
  CalendarVisit, CalendarRequest, CalendarBlock, CalendarService,
  VISIT_DOT_COLOR, REQUEST_STATUS_COLOR,
} from "@/services/calendar.service";
import { StatusBadge } from "./VisitCard";
import { MONTHS, today } from "./calendarUtils";

export function RequestActions({
  requestId, token, onDone,
}: {
  requestId: string;
  token: string;
  onDone: () => void;
}) {
  const [note,   setNote]   = useState("");
  const [saving, setSaving] = useState(false);

  const respond = async (status: "APPROVED" | "REJECTED") => {
    setSaving(true);
    try {
      await CalendarService.respondToRequest(requestId, { status, responseNote: note || undefined }, token);
      onDone();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <div className="border-t border-purple-100 pt-2 space-y-1.5">
      <input
        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300"
        placeholder="Optional response note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={() => respond("APPROVED")} disabled={saving}
          className="flex-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Approve
        </button>
        <button onClick={() => respond("REJECTED")} disabled={saving}
          className="flex-1 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Reject
        </button>
      </div>
    </div>
  );
}

function AgendaVisitRow({
  visit, isAdmin, onEdit, onDelete,
}: {
  visit: CalendarVisit;
  isAdmin: boolean;
  onEdit: (v: CalendarVisit) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${VISIT_DOT_COLOR[visit.status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{visit.title}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {visit.clientOrgName && (
            <span className="flex items-center gap-1 text-xs text-slate-500"><Building2 className="h-3 w-3" /> {visit.clientOrgName}</span>
          )}
          {(visit.startTime || visit.endTime) && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" />{visit.startTime ?? ""}{visit.endTime ? ` – ${visit.endTime}` : ""}
            </span>
          )}
          {visit.endDate && visit.endDate !== visit.date && (
            <span className="text-xs text-indigo-500 font-medium">→ {visit.endDate}</span>
          )}
        </div>
        {visit.notes && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{visit.notes}</p>}
        {visit.status === "COMPLETED" && visit.completionNote && (
          <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1 mt-1">{visit.completionNote}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={visit.status} />
        {isAdmin && (
          <>
            <button onClick={() => onEdit(visit)} className="text-slate-300 hover:text-blue-500 transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
            <button onClick={() => onDelete(visit.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        )}
      </div>
    </div>
  );
}

function AgendaRequestRow({
  request, isAdmin, token, onDone,
}: {
  request: CalendarRequest;
  isAdmin: boolean;
  token: string;
  onDone: () => void;
}) {
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-purple-400 shrink-0" />
        <p className="text-sm font-semibold text-purple-700 flex-1">
          {request.isOwn ? "Your visit request" : request.organizationName}
        </p>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${REQUEST_STATUS_COLOR[request.status]}`}>
          {request.status}
        </span>
      </div>
      {request.preferredTime && <p className="text-xs text-purple-600">Preferred: {request.preferredTime}</p>}
      {request.message && <p className="text-xs text-slate-500">{request.message}</p>}
      {request.responseNote && (
        <p className="text-xs text-slate-500 border-t border-purple-100 pt-1.5">Response: {request.responseNote}</p>
      )}
      {isAdmin && request.status === "PENDING" && (
        <RequestActions requestId={request.id} token={token} onDone={onDone} />
      )}
    </div>
  );
}

function AgendaBlockRow({ block }: { block: CalendarBlock }) {
  const isHoliday = block.type === "HOLIDAY";
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isHoliday ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
      {isHoliday
        ? <CalendarX2 className="h-4 w-4 text-red-500 shrink-0" />
        : <BanIcon className="h-4 w-4 text-amber-500 shrink-0" />}
      <p className={`text-sm font-medium ${isHoliday ? "text-red-700" : "text-amber-700"}`}>
        {block.label ?? (isHoliday ? "Public Holiday" : "Busy Day")}
      </p>
    </div>
  );
}

type AgendaItem =
  | { kind: "VISIT";   date: string; data: CalendarVisit }
  | { kind: "REQUEST"; date: string; data: CalendarRequest }
  | { kind: "BLOCK";   date: string; data: CalendarBlock };

export function AgendaView({
  activeFilter, filterLabel, visits, requests, blocks,
  isAdmin, loading, year, month, onEdit, onDelete, onClearFilter, token, onRequestDone,
}: {
  activeFilter: string;
  filterLabel: string;
  visits: CalendarVisit[];
  requests: CalendarRequest[];
  blocks: CalendarBlock[];
  isAdmin: boolean;
  loading: boolean;
  year: number;
  month: number;
  onEdit: (v: CalendarVisit) => void;
  onDelete: (id: string) => void;
  onClearFilter: () => void;
  token: string;
  onRequestDone: () => void;
}) {
  const isBlockFilter = activeFilter === "HOLIDAY" || activeFilter === "BUSY_DAY";

  const items: AgendaItem[] = isBlockFilter
    ? blocks.filter((b) => b.type === activeFilter).map((b) => ({ kind: "BLOCK" as const, date: b.date, data: b }))
    : [
        ...visits.map((v)   => ({ kind: "VISIT"   as const, date: v.date, data: v })),
        ...requests.map((r) => ({ kind: "REQUEST" as const, date: r.date, data: r })),
      ];

  const byDate: Record<string, AgendaItem[]> = {};
  for (const item of items) {
    if (!byDate[item.date]) byDate[item.date] = [];
    byDate[item.date].push(item);
  }
  const dates    = Object.keys(byDate).sort();
  const todayStr = today();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{filterLabel}</span>
          {" · "}{MONTHS[month - 1]} {year}
        </p>
        <button onClick={onClearFilter} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
          <X className="h-3 w-3" /> Show calendar
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-100 rounded-2xl flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : dates.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-14 text-center text-slate-400">
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-slate-500">Nothing to show</p>
          <p className="text-xs mt-1">No {filterLabel.toLowerCase()} in {MONTHS[month - 1]} {year}</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {dates.map((date, idx) => {
            const d       = new Date(date + "T00:00:00");
            const isToday = date === todayStr;
            return (
              <div key={date} className={`flex min-h-[72px] ${idx < dates.length - 1 ? "border-b border-slate-100" : ""}`}>
                <div className={`w-[72px] shrink-0 flex flex-col items-center justify-center py-4 border-r border-slate-100 ${isToday ? "bg-blue-50" : "bg-slate-50/60"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-blue-500" : "text-slate-400"}`}>
                    {d.toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                  <p className={`text-2xl font-light leading-none mt-0.5 ${isToday ? "text-blue-600" : "text-slate-700"}`}>
                    {d.getDate()}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isToday ? "text-blue-400" : "text-slate-400"}`}>
                    {d.toLocaleDateString("en-GB", { month: "short" })}
                  </p>
                </div>
                <div className="flex-1 px-4 py-3 space-y-2">
                  {byDate[date].map((item) => {
                    if (item.kind === "VISIT")   return <AgendaVisitRow   key={item.data.id} visit={item.data}   isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} />;
                    if (item.kind === "REQUEST") return <AgendaRequestRow key={item.data.id} request={item.data} isAdmin={isAdmin} token={token} onDone={onRequestDone} />;
                    return <AgendaBlockRow key={item.data.id} block={item.data} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
