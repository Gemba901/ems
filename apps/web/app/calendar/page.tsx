"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  CalendarService,
  CalendarVisit, CalendarRequest,
  AdminOrg, ClientOrg, VisitStatus,
  VISIT_STATUS_LABELS, VISIT_STATUS_COLOR, VISIT_DOT_COLOR, REQUEST_STATUS_COLOR,
  CreateVisitPayload,
} from "@/services/calendar.service";
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, CheckCircle2,
  Clock, Building2, FileText, Lock, Send, Trash2, Edit2,
  ShieldAlert, Settings,
} from "lucide-react";
import Link from "next/link";

// ── Month grid helpers ────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function toYMD(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function today() {
  const d = new Date();
  return toYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VisitStatus }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${VISIT_STATUS_COLOR[status]}`}>
      {VISIT_STATUS_LABELS[status]}
    </span>
  );
}

function VisitCard({
  visit,
  isAdmin,
  onEdit,
  onDelete,
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{visit.title}</p>
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
        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">{visit.notes}</p>
      )}
      {isAdmin && visit.internalNotes && (
        <div className="border border-amber-100 bg-amber-50 rounded-lg px-2.5 py-1.5">
          <p className="text-[10px] font-bold text-amber-500 mb-0.5">INTERNAL</p>
          <p className="text-xs text-amber-800">{visit.internalNotes}</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { accessToken, user } = useAuthStore();
  const isAdmin = user?.roleLevel === Role.SUPER_ADMIN;

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // undefined = loading, null = not configured
  const [adminOrg, setAdminOrg] = useState<AdminOrg | null | undefined>(undefined);

  const [visits,   setVisits]   = useState<CalendarVisit[]>([]);
  const [requests, setRequests] = useState<CalendarRequest[]>([]);
  const [orgs,     setOrgs]     = useState<ClientOrg[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editingVisit, setEditingVisit] = useState<CalendarVisit | null>(null);
  const [showRequest, setShowRequest] = useState(false);

  const todayStr = today();

  const load = useCallback(() => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    CalendarService.getMonthVisits(year, month, accessToken)
      .then(({ visits: v, requests: r }) => { setVisits(v); setRequests(r); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accessToken, year, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    CalendarService.getAdminOrg(accessToken)
      .then(setAdminOrg)
      .catch(() => setAdminOrg(null));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    CalendarService.getClientOrganizations(accessToken).then(setOrgs).catch(() => {});
  }, [accessToken, isAdmin]);

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
    setSelectedDay(null);
  };

  // Group visits/requests by date
  const byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }> = {};
  for (const v of visits) {
    if (!byDate[v.date]) byDate[v.date] = { visits: [], requests: [] };
    byDate[v.date].visits.push(v);
  }
  for (const r of requests) {
    if (!byDate[r.date]) byDate[r.date] = { visits: [], requests: [] };
    byDate[r.date].requests.push(r);
  }

  const selectedDayData = selectedDay ? byDate[selectedDay] : null;
  const selectedDayVisits   = selectedDayData?.visits   ?? [];
  const selectedDayRequests = selectedDayData?.requests ?? [];

  const daysInMonth  = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const handleDeleteVisit = async (id: string) => {
    if (!accessToken || !confirm("Delete this visit?")) return;
    try {
      await CalendarService.deleteVisit(id, accessToken);
      load();
      setSelectedDay(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (adminOrg === undefined) {
    return (
      <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400 gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </ProtectedRoute>
    );
  }

  if (adminOrg === null) {
    return (
      <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
        <div className="max-w-lg mx-auto mt-24 text-center space-y-5 px-4">
          <div className="flex items-center justify-center">
            <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-amber-400" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Calendar not configured</h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              The Calendar module requires a platform company to be designated before it can be used.
              {isAdmin
                ? " Head to Platform Settings to configure this."
                : " Please contact your administrator to enable the Calendar module."}
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              <Settings className="h-4 w-4" />
              Go to Platform Settings
            </Link>
          )}
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {isAdmin ? "Manage consultancy visits across all clients" : "Your upcoming visits and availability"}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setShowCreate(true); setEditingVisit(null); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus className="h-4 w-4" /> Schedule Visit
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
          {isAdmin ? (
            <>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Confirmed</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Tentative</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" />Completed</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Cancelled</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-400" />Request</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Your confirmed visit</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Tentative</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Occupied</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-400" />Your request</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Calendar grid */}
          <div className="xl:col-span-2 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">

            {/* Month navigation */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              </button>
              <h2 className="text-base font-bold text-slate-800">{MONTHS[month - 1]} {year}</h2>
              <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {DAYS.map((d) => (
                <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-slate-50" />
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dateStr = toYMD(year, month, day);
                  const dayData = byDate[dateStr];
                  const dayVisits   = dayData?.visits   ?? [];
                  const dayRequests = dayData?.requests ?? [];
                  const isToday    = dateStr === todayStr;
                  const isSelected = dateStr === selectedDay;
                  const hasOwn     = dayVisits.some((v) => v.isOwn);
                  const hasOccupied = dayVisits.some((v) => !v.isOwn);
                  const hasRequest  = dayRequests.length > 0;

                  const colIndex = (firstDayOfWeek + day - 1) % 7;
                  const isLastCol = colIndex === 6;

                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                      className={`min-h-[80px] p-2 border-b border-r border-slate-50 cursor-pointer transition-all ${
                        isLastCol ? "border-r-0" : ""
                      } ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    >
                      {/* Day number */}
                      <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 ${
                        isToday
                          ? "bg-blue-600 text-white"
                          : isSelected
                            ? "bg-blue-100 text-blue-700"
                            : "text-slate-600"
                      }`}>
                        {day}
                      </div>

                      {/* Dots */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {isAdmin
                          ? dayVisits.map((v) => (
                              <span key={v.id} className={`h-2 w-2 rounded-full ${VISIT_DOT_COLOR[v.status]}`} title={v.title} />
                            ))
                          : (
                            <>
                              {hasOwn     && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                              {hasOccupied && <span className="h-2 w-2 rounded-full bg-slate-300" />}
                            </>
                          )
                        }
                        {hasRequest && <span className="h-2 w-2 rounded-full bg-purple-400" />}
                      </div>

                      {/* Mini labels for admin */}
                      {isAdmin && dayVisits.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {dayVisits.slice(0, 2).map((v) => (
                            <p key={v.id} className="text-[9px] text-slate-500 truncate leading-tight">
                              {v.clientOrgName}
                            </p>
                          ))}
                          {dayVisits.length > 2 && (
                            <p className="text-[9px] text-slate-400">+{dayVisits.length - 2} more</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right panel — day detail or empty state */}
          <div className="xl:col-span-1">
            {selectedDay ? (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden sticky top-6">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {new Date(selectedDay + "T00:00:00").toLocaleDateString("en-GB", {
                        weekday: "long", day: "numeric", month: "long",
                      })}
                    </p>
                    {selectedDay === todayStr && (
                      <span className="text-[10px] font-bold text-blue-600">Today</span>
                    )}
                  </div>
                  <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3 max-h-[calc(100vh-14rem)] overflow-y-auto">
                  {selectedDayVisits.length === 0 && selectedDayRequests.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-400">No visits scheduled</p>
                      {!isAdmin && (
                        <button
                          onClick={() => setShowRequest(true)}
                          className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mx-auto transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Request a visit
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {selectedDayVisits.map((v) => (
                        <VisitCard
                          key={v.id}
                          visit={v}
                          isAdmin={isAdmin}
                          onEdit={setEditingVisit}
                          onDelete={handleDeleteVisit}
                        />
                      ))}

                      {selectedDayRequests.map((r) => (
                        <div key={r.id} className="rounded-xl border border-purple-100 bg-purple-50 p-3 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                            <p className="text-sm font-semibold text-purple-700">
                              {r.isOwn ? "Your visit request" : r.organizationName}
                            </p>
                            <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${REQUEST_STATUS_COLOR[r.status]}`}>
                              {r.status}
                            </span>
                          </div>
                          {r.preferredTime && (
                            <p className="text-xs text-purple-600">Preferred time: {r.preferredTime}</p>
                          )}
                          {r.message && <p className="text-xs text-slate-500">{r.message}</p>}
                          {r.responseNote && (
                            <p className="text-xs text-slate-500 border-t border-purple-100 pt-1.5">
                              Response: {r.responseNote}
                            </p>
                          )}
                          {isAdmin && r.status === "PENDING" && (
                            <RequestActions
                              requestId={r.id}
                              token={accessToken!}
                              onDone={load}
                            />
                          )}
                        </div>
                      ))}

                      {!isAdmin && selectedDayVisits.every((v) => !v.isOwn) && (
                        <button
                          onClick={() => setShowRequest(true)}
                          className="w-full mt-1 flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors py-2"
                        >
                          <Plus className="h-3.5 w-3.5" /> Request a visit on this day
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 text-center text-slate-400 text-sm">
                <p className="text-slate-300 text-4xl mb-3">📅</p>
                <p className="font-medium text-slate-500">Select a day</p>
                <p className="text-xs mt-1">Click any date to view or manage visits</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Visit modal (admin only) */}
      {(showCreate || editingVisit) && isAdmin && (
        <VisitFormModal
          orgs={orgs}
          token={accessToken!}
          editing={editingVisit}
          defaultDate={selectedDay ?? undefined}
          onClose={() => { setShowCreate(false); setEditingVisit(null); }}
          onSaved={() => { setShowCreate(false); setEditingVisit(null); load(); }}
        />
      )}

      {/* Visit Request modal (client only) */}
      {showRequest && !isAdmin && (
        <RequestModal
          token={accessToken!}
          defaultDate={selectedDay ?? undefined}
          onClose={() => setShowRequest(false)}
          onSaved={() => { setShowRequest(false); load(); }}
        />
      )}
    </ProtectedRoute>
  );
}

// ── Visit Form Modal (SUPER_ADMIN) ────────────────────────────────────────────

function VisitFormModal({
  orgs, token, editing, defaultDate, onClose, onSaved,
}: {
  orgs: ClientOrg[];
  token: string;
  editing: CalendarVisit | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title,         setTitle]         = useState(editing?.title         ?? "");
  const [clientOrgId,   setClientOrgId]   = useState(editing?.clientOrgId   ?? "");
  const [date,          setDate]          = useState(editing?.date ?? defaultDate ?? "");
  const [startTime,     setStartTime]     = useState(editing?.startTime      ?? "");
  const [endTime,       setEndTime]       = useState(editing?.endTime        ?? "");
  const [status,        setStatus]        = useState<VisitStatus>(editing?.status ?? "TENTATIVE");
  const [notes,         setNotes]         = useState(editing?.notes          ?? "");
  const [internalNotes, setInternalNotes] = useState(editing?.internalNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !clientOrgId || !date) { setError("Title, client, and date are required."); return; }
    setSaving(true); setError(null);
    try {
      const payload: CreateVisitPayload = {
        title, clientOrgId, date,
        startTime: startTime || undefined,
        endTime:   endTime   || undefined,
        status,
        notes:         notes         || undefined,
        internalNotes: internalNotes || undefined,
      };
      if (editing) {
        await CalendarService.updateVisit(editing.id, payload, token);
      } else {
        await CalendarService.createVisit(payload, token);
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Title (internal)</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Monthly quality audit" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Client Organization</label>
            <select className={`${inputCls} bg-white`} value={clientOrgId} onChange={(e) => setClientOrgId(e.target.value)}>
              <option value="">— Select client —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Date</label>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Start</label>
              <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">End</label>
              <input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Status</label>
            <select className={`${inputCls} bg-white`} value={status} onChange={(e) => setStatus(e.target.value as VisitStatus)}>
              <option value="TENTATIVE">Tentative</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Notes (visible to client)</label>
            <textarea rows={2} className={`${inputCls} resize-none`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What should the client know about this visit?" />
          </div>
          <div>
            <label className="text-xs font-semibold text-amber-500 block mb-1">Internal Notes (Gemba only)</label>
            <textarea rows={2} className={`${inputCls} resize-none border-amber-200 focus:border-amber-400 focus:ring-amber-500/20`} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Internal context, checklist, preparation notes…" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Saving…" : editing ? "Save Changes" : "Schedule Visit"}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Visit Request modal (client) ──────────────────────────────────────────────

function RequestModal({
  token, defaultDate, onClose, onSaved,
}: {
  token: string;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date,          setDate]          = useState(defaultDate ?? "");
  const [preferredTime, setPreferredTime] = useState("");
  const [message,       setMessage]       = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setError("Please select a date."); return; }
    setSaving(true); setError(null);
    try {
      await CalendarService.createRequest({ requestedDate: date, preferredTime: preferredTime || undefined, message: message || undefined }, token);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
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
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Requested Date</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? "Sending…" : "Send Request"}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Inline request approval for admin ────────────────────────────────────────

function RequestActions({ requestId, token, onDone }: { requestId: string; token: string; onDone: () => void }) {
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
        <button
          onClick={() => respond("APPROVED")}
          disabled={saving}
          className="flex-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => respond("REJECTED")}
          disabled={saving}
          className="flex-1 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
