"use client";

import { useState, useMemo } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarService,
  CalendarVisit, CalendarRequest, CalendarBlock, CalendarBlockType,
  AdminOrg, ClientOrg, VisitStatus, RecurrencePattern,
  VISIT_STATUS_LABELS, VISIT_STATUS_COLOR, VISIT_DOT_COLOR, REQUEST_STATUS_COLOR,
  RECURRENCE_LABELS,
} from "@/services/calendar.service";
import {
  ChevronLeft, ChevronRight, Plus, Minus, X, Loader2, CheckCircle2,
  Clock, Building2, FileText, Lock, Send, Trash2, Edit2,
  ShieldAlert, Settings, BanIcon, CalendarX2, Download,
  BarChart3, Calendar, Users, RefreshCw, UserPlus, ChevronDown,
  User, Briefcase, BookOpen, LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import { EventsCalendarTab, type CalendarTabType } from "@/components/calendar/EventsCalendarTab";
import { VisitMonthPlanPanel } from "@/components/calendar/VisitMonthPlanPanel";

// ── Month grid helpers ────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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
function getWeekStart(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function dateToYMD(d: Date) {
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

// ── Main page ─────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week" | "analytics" | "year";

type MainTab = CalendarTabType | "consultancy";

const MAIN_TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
  { key: "personal",    label: "Personal",    icon: <User className="h-3.5 w-3.5" /> },
  { key: "company",     label: "Company",     icon: <Briefcase className="h-3.5 w-3.5" /> },
  { key: "training",    label: "Training",    icon: <BookOpen className="h-3.5 w-3.5" /> },
  { key: "consultancy", label: "Consultancy Visits", icon: <Calendar className="h-3.5 w-3.5" /> },
];

export default function CalendarPage() {
  const { accessToken, user } = useAuthStore();
  const isAdmin = user?.isAdminOrg === true;
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>("personal");

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [weekStart, setWeekStart] = useState(() => getWeekStart(now));

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editingVisit, setEditingVisit] = useState<CalendarVisit | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [analyticsYear, setAnalyticsYear] = useState(now.getFullYear());
  const [visitViewYear, setVisitViewYear] = useState(now.getFullYear());

  const isFiltered = activeFilter !== "";
  const filterOrgId = activeFilter !== "HOLIDAY" && activeFilter !== "BUSY_DAY"
    ? (activeFilter || undefined)
    : undefined;

  const todayStr = today();

  const { data: adminOrg, isLoading: adminOrgLoading } = useQuery({
    queryKey: ["calendar-admin-org"],
    queryFn: () => CalendarService.getAdminOrg(accessToken!).catch(() => null),
    enabled: !!accessToken && mainTab === "consultancy",
  });
  const adminOrgResolved: AdminOrg | null | undefined =
    mainTab !== "consultancy" ? null : (adminOrgLoading ? undefined : (adminOrg ?? null));

  const { data: monthData, isLoading: loading, error: monthError } = useQuery({
    queryKey: ["calendar-month", year, month, activeFilter],
    queryFn: () => CalendarService.getMonthVisits(year, month, accessToken!, filterOrgId),
    enabled: !!accessToken && viewMode !== "analytics",
  });

  // Week view uses a different query when spanning month boundaries
  const weekEndDate = addDays(weekStart, 6);
  const weekYear  = weekStart.getFullYear();
  const weekMonth = weekStart.getMonth() + 1;
  const { data: weekData } = useQuery({
    queryKey: ["calendar-month", weekYear, weekMonth, ""],
    queryFn: () => CalendarService.getMonthVisits(weekYear, weekMonth, accessToken!),
    enabled: !!accessToken && viewMode === "week",
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["calendar-analytics", analyticsYear],
    queryFn: () => CalendarService.getAnalytics(analyticsYear, accessToken!),
    enabled: !!accessToken && viewMode === "analytics",
  });

  const yearVisitResults = useQueries({
    queries: viewMode === "year"
      ? Array.from({ length: 12 }, (_, i) => ({
          queryKey: ["calendar-month", visitViewYear, i + 1, ""] as const,
          queryFn: () => CalendarService.getMonthVisits(visitViewYear, i + 1, accessToken!),
          enabled: !!accessToken,
        }))
      : [],
  });
  const yearVisitLoading = yearVisitResults.some(q => q.isLoading);

  const byDateVisitYear = useMemo(() => {
    if (viewMode !== "year") return {} as Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
    const map: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }> = {};
    for (const q of yearVisitResults) {
      if (!q.data) continue;
      for (const v of q.data.visits) {
        const start = v.date;
        const end   = v.endDate ?? v.date;
        let cur = new Date(start + "T00:00:00");
        const endD = new Date(end + "T00:00:00");
        while (cur <= endD) {
          const key = dateToYMD(cur);
          if (!map[key]) map[key] = { visits: [], requests: [] };
          if (!map[key].visits.find(x => x.id === v.id)) map[key].visits.push(v);
          cur = addDays(cur, 1);
        }
      }
      for (const r of q.data.requests) {
        if (!map[r.date]) map[r.date] = { visits: [], requests: [] };
        map[r.date].requests.push(r);
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, visitViewYear, yearVisitLoading]);

  const yearBlockByDate = useMemo(() => {
    if (viewMode !== "year") return {} as Record<string, CalendarBlock>;
    const map: Record<string, CalendarBlock> = {};
    for (const q of yearVisitResults) {
      if (!q.data) continue;
      for (const b of q.data.blocks) map[b.date] = b;
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, visitViewYear, yearVisitLoading]);

  const visits: CalendarVisit[]     = monthData?.visits    ?? [];
  const requests: CalendarRequest[] = monthData?.requests  ?? [];
  const blocks: CalendarBlock[]     = monthData?.blocks    ?? [];
  const busyDates: Set<string>      = new Set(monthData?.busyDates ?? []);
  const error = monthError ? (monthError as any).message : deleteError;

  const blockByDate: Record<string, CalendarBlock> = {};
  for (const b of blocks) blockByDate[b.date] = b;

  const { data: orgs = [] } = useQuery({
    queryKey: ["calendar-client-orgs"],
    queryFn: () => CalendarService.getClientOrganizations(accessToken!),
    enabled: !!accessToken && isAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => CalendarService.deleteVisit(id, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] });
      setSelectedDay(null);
    },
    onError: (e: unknown) => setDeleteError(e instanceof Error ? e.message : "Delete failed"),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => CalendarService.deleteBlock(id, accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] }),
  });

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
  const prevWeek = () => setWeekStart((ws) => addDays(ws, -7));
  const nextWeek = () => setWeekStart((ws) => addDays(ws, 7));

  // Group visits/requests by date (multi-day: add to all spanned days in this month)
  const byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }> = {};
  for (const v of visits) {
    const start = v.date;
    const end   = v.endDate ?? v.date;
    let cur = new Date(start + "T00:00:00");
    const endD = new Date(end + "T00:00:00");
    while (cur <= endD) {
      const key = dateToYMD(cur);
      if (!byDate[key]) byDate[key] = { visits: [], requests: [] };
      if (!byDate[key].visits.find((x) => x.id === v.id)) byDate[key].visits.push(v);
      cur = addDays(cur, 1);
    }
  }
  for (const r of requests) {
    if (!byDate[r.date]) byDate[r.date] = { visits: [], requests: [] };
    byDate[r.date].requests.push(r);
  }

  const selectedDayData = selectedDay ? byDate[selectedDay] : null;
  const selectedDayVisits   = selectedDayData?.visits   ?? [];
  const selectedDayRequests = selectedDayData?.requests ?? [];

  const daysInMonth    = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const handleDeleteVisit = (id: string) => {
    if (!accessToken || !confirm("Delete this visit?")) return;
    setDeleteError(null);
    deleteMutation.mutate(id);
  };

  const handleIcalDownload = () => {
    const url = CalendarService.getIcalUrl(year, month);
    const a = document.createElement("a");
    a.href = `${url}&token=${accessToken}`;
    // Token passed via query isn't supported by the API (uses Bearer).
    // Instead, trigger via fetch + blob so the auth header is sent.
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `visits-${year}-${String(month).padStart(2, "0")}.ics`;
        link.click();
      });
  };

  const allRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE];

  return (
    <ProtectedRoute allowedRoles={allRoles}>
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your schedule, meetings, company events, and training
          </p>
        </div>

        {/* Main tab switcher */}
        <div className="flex items-center gap-1 border-b border-slate-200 pb-0">
          {MAIN_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
                mainTab === tab.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {tab.icon}
              {tab.key === "consultancy" && isAdmin ? "Client Visit Plan" : tab.label}
            </button>
          ))}
        </div>

        {/* Personal / Company / Training tabs */}
        {mainTab !== "consultancy" && (
          <EventsCalendarTab tab={mainTab} />
        )}

        {/* Consultancy Visits tab */}
        {mainTab === "consultancy" && adminOrgResolved === undefined && (
          <div className="flex items-center justify-center min-h-[60vh] text-slate-400 gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {mainTab === "consultancy" && adminOrgResolved === null && (
          <div className="max-w-lg mx-auto mt-24 text-center space-y-5 px-4">
            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <ShieldAlert className="h-8 w-8 text-amber-400" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{isAdmin ? "Client Visit Plan" : "Consultancy Visits"} not configured</h2>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                The {isAdmin ? "Client Visit Plan" : "Consultancy Visits"} tab requires a platform company to be designated.
                {isAdmin
                  ? " Head to Platform Settings to configure this."
                  : " Please contact your administrator."}
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
        )}

        {mainTab === "consultancy" && adminOrgResolved !== undefined && adminOrgResolved !== null && (<>

        {/* Consultancy header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-slate-500">{isAdmin ? "Manage client visit plans across all clients" : "Your upcoming visits and availability"}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
              {(["month", "week", "analytics", "year"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    if (v === "year") setVisitViewYear(year);
                    setViewMode(v);
                    setSelectedDay(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === v
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {v === "month"     ? <><Calendar className="h-3.5 w-3.5 inline mr-1" />Month</>
                    : v === "week"   ? <><ChevronRight className="h-3.5 w-3.5 inline mr-1" />Week</>
                    : v === "year"   ? <><LayoutGrid className="h-3.5 w-3.5 inline mr-1" />Year</>
                    : <><BarChart3 className="h-3.5 w-3.5 inline mr-1" />Analytics</>}
                </button>
              ))}
            </div>

            {isAdmin && viewMode !== "analytics" && viewMode !== "year" && (
              <select
                value={activeFilter}
                onChange={(e) => { setActiveFilter(e.target.value); setSelectedDay(null); }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all min-w-[160px]"
              >
                <option value="">All</option>
                {orgs.length > 0 && (
                  <optgroup label="By Client">
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Availability">
                  <option value="HOLIDAY">Public Holidays</option>
                  <option value="BUSY_DAY">Busy Days</option>
                </optgroup>
              </select>
            )}

            {viewMode !== "analytics" && viewMode !== "year" && (
              <button
                onClick={handleIcalDownload}
                title="Export to iCal"
                className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                <Download className="h-4 w-4" /> Export
              </button>
            )}

            {isAdmin && viewMode !== "analytics" && viewMode !== "year" && (
              <button
                onClick={() => { setShowCreate(true); setEditingVisit(null); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                <Plus className="h-4 w-4" /> Schedule Visit
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {/* Analytics view */}
        {viewMode === "analytics" && (
          <AnalyticsPanel
            analytics={analyticsData}
            loading={analyticsLoading}
            year={analyticsYear}
            onYearChange={setAnalyticsYear}
            isAdmin={isAdmin}
          />
        )}

        {/* Year view */}
        {viewMode === "year" && (
          <YearViewVisits
            year={visitViewYear}
            byDate={byDateVisitYear}
            blockByDate={yearBlockByDate}
            todayStr={todayStr}
            isLoading={yearVisitLoading}
            onSelectDay={(dateStr, m, y) => {
              setYear(y);
              setMonth(m);
              setViewMode("month");
              setSelectedDay(dateStr);
            }}
            prevYear={() => setVisitViewYear(y => y - 1)}
            nextYear={() => setVisitViewYear(y => y + 1)}
          />
        )}

        {/* Week view */}
        {viewMode === "week" && !isFiltered && (
          <WeekView
            weekStart={weekStart}
            byDate={byDate}
            blockByDate={blockByDate}
            todayStr={todayStr}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            isAdmin={isAdmin}
            prevWeek={prevWeek}
            nextWeek={nextWeek}
            weekEndDate={weekEndDate}
          />
        )}

        {/* Month view */}
        {viewMode === "month" && !isFiltered && (
          <>
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
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Confirmed visit</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Tentative</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" />Completed</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-400" />Your request</span>
                </>
              )}
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-red-200" />Public Holiday</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-amber-200" />Busy Day</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {/* Calendar grid */}
              <div className="xl:col-span-2 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronLeft className="h-4 w-4 text-slate-500" />
                  </button>
                  <h2 className="text-base font-bold text-slate-800">{MONTHS[month - 1]} {year}</h2>
                  <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>
                </div>

                <div className="grid grid-cols-7 border-b border-slate-100">
                  {DAYS.map((d) => (
                    <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">{d}</div>
                  ))}
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="grid grid-cols-7">
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-slate-50" />
                    ))}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const dateStr     = toYMD(year, month, day);
                      const dayData     = byDate[dateStr];
                      const dayVisits   = dayData?.visits   ?? [];
                      const dayRequests = dayData?.requests ?? [];
                      const isToday     = dateStr === todayStr;
                      const isSelected  = dateStr === selectedDay;
                      const block       = blockByDate[dateStr];
                      const isOtherBusy = !isAdmin && busyDates.has(dateStr) && dayVisits.length === 0;
                      const colIndex    = (firstDayOfWeek + day - 1) % 7;
                      const isLastCol   = colIndex === 6;

                      const blockBg = block
                        ? block.type === "HOLIDAY"
                          ? isSelected ? "bg-red-100" : "bg-red-50 hover:bg-red-100"
                          : isSelected ? "bg-amber-100" : "bg-amber-50 hover:bg-amber-100"
                        : isOtherBusy
                          ? isSelected ? "bg-slate-100" : "bg-slate-50 hover:bg-slate-100"
                          : isSelected ? "bg-blue-50" : "hover:bg-slate-50";

                      return (
                        <div
                          key={day}
                          onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                          className={`min-h-[80px] p-2 border-b border-r border-slate-50 cursor-pointer transition-all ${isLastCol ? "border-r-0" : ""} ${blockBg}`}
                        >
                          <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 ${
                            isToday
                              ? "bg-blue-600 text-white"
                              : isSelected && !block && !isOtherBusy
                                ? "bg-blue-100 text-blue-700"
                                : block?.type === "HOLIDAY"
                                  ? "text-red-600"
                                  : block?.type === "BUSY_DAY" || isOtherBusy
                                    ? "text-slate-400"
                                    : "text-slate-600"
                          }`}>
                            {day}
                          </div>
                          {block && (
                            <div className={`text-[9px] font-bold truncate leading-tight mt-0.5 ${block.type === "HOLIDAY" ? "text-red-500" : "text-amber-600"}`}>
                              {block.type === "HOLIDAY" ? "🏖 " : "🚫 "}
                              {block.label ?? (block.type === "HOLIDAY" ? "Holiday" : "Busy")}
                            </div>
                          )}
                          {!block && isOtherBusy && (
                            <div className="text-[9px] font-bold text-slate-400 mt-0.5">Unavailable</div>
                          )}
                          {!block && !isOtherBusy && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {isAdmin
                                ? dayVisits.map((v) => (
                                    <span key={v.id} className={`h-2 w-2 rounded-full ${VISIT_DOT_COLOR[v.status]}`} title={v.title} />
                                  ))
                                : dayVisits.map((v) => (
                                    <span key={v.id} className={`h-2 w-2 rounded-full ${VISIT_DOT_COLOR[v.status]}`} />
                                  ))
                              }
                              {dayRequests.length > 0 && <span className="h-2 w-2 rounded-full bg-purple-400" />}
                            </div>
                          )}
                          {isAdmin && !block && dayVisits.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {dayVisits.slice(0, 2).map((v) => (
                                <p key={v.id} className="text-[9px] text-slate-500 truncate leading-tight">{v.clientOrgName}</p>
                              ))}
                              {dayVisits.length > 2 && <p className="text-[9px] text-slate-400">+{dayVisits.length - 2} more</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right panel */}
              <div className="xl:col-span-1">
                {selectedDay ? (() => {
                  const selectedBlock     = blockByDate[selectedDay];
                  const isDayOtherBusy    = !isAdmin && busyDates.has(selectedDay);
                  return (
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden sticky top-6">
                      <div className={`px-5 py-4 border-b flex items-center justify-between ${
                        selectedBlock?.type === "HOLIDAY" ? "border-red-100 bg-red-50"
                        : selectedBlock?.type === "BUSY_DAY" || isDayOtherBusy ? "border-slate-200 bg-slate-50"
                        : "border-slate-100 bg-slate-50"
                      }`}>
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            {new Date(selectedDay + "T00:00:00").toLocaleDateString("en-GB", {
                              weekday: "long", day: "numeric", month: "long",
                            })}
                          </p>
                          {selectedDay === todayStr && <span className="text-[10px] font-bold text-blue-600">Today</span>}
                        </div>
                        <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="p-4 space-y-3 max-h-[calc(100vh-14rem)] overflow-y-auto">
                        {selectedBlock && (
                          <div className={`rounded-xl p-3 flex items-start gap-3 ${
                            selectedBlock.type === "HOLIDAY" ? "bg-red-50 border border-red-100" : "bg-amber-50 border border-amber-100"
                          }`}>
                            <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${selectedBlock.type === "HOLIDAY" ? "bg-red-100" : "bg-amber-100"}`}>
                              {selectedBlock.type === "HOLIDAY"
                                ? <CalendarX2 className="h-3.5 w-3.5 text-red-500" />
                                : <BanIcon className="h-3.5 w-3.5 text-amber-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-bold ${selectedBlock.type === "HOLIDAY" ? "text-red-700" : "text-amber-700"}`}>
                                {selectedBlock.type === "HOLIDAY" ? "Public Holiday" : "Busy Day"}
                              </p>
                              <p className={`text-xs mt-0.5 ${selectedBlock.type === "HOLIDAY" ? "text-red-600" : "text-amber-600"}`}>
                                {selectedBlock.label ?? "No visits can be scheduled on this day."}
                              </p>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => unblockMutation.mutate(selectedBlock.id)}
                                disabled={unblockMutation.isPending}
                                className="shrink-0 text-xs text-slate-400 hover:text-red-500 transition-colors"
                              >
                                {unblockMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Busy notice for client users when another company occupies the day */}
                        {isDayOtherBusy && !selectedBlock && selectedDayVisits.length === 0 && (
                          <div className="rounded-xl p-3 flex items-start gap-3 bg-slate-50 border border-slate-200">
                            <div className="mt-0.5 p-1.5 rounded-lg bg-slate-200 shrink-0">
                              <Lock className="h-3.5 w-3.5 text-slate-500" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-600">Date unavailable</p>
                              <p className="text-xs text-slate-500 mt-0.5">This date is already booked. Please choose another date to request a visit.</p>
                            </div>
                          </div>
                        )}

                        {selectedDayVisits.length === 0 && selectedDayRequests.length === 0 && !selectedBlock && !isDayOtherBusy ? (
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
                        ) : !isDayOtherBusy || selectedDayVisits.length > 0 || selectedDayRequests.length > 0 ? (
                          <>
                            {selectedDayVisits.map((v) => (
                              <VisitCard key={v.id} visit={v} isAdmin={isAdmin} onEdit={setEditingVisit} onDelete={handleDeleteVisit} />
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
                                {r.preferredTime && <p className="text-xs text-purple-600">Preferred time: {r.preferredTime}</p>}
                                {r.message && <p className="text-xs text-slate-500">{r.message}</p>}
                                {r.responseNote && (
                                  <p className="text-xs text-slate-500 border-t border-purple-100 pt-1.5">Response: {r.responseNote}</p>
                                )}
                                {isAdmin && r.status === "PENDING" && (
                                  <RequestActions
                                    requestId={r.id}
                                    token={accessToken!}
                                    onDone={() => queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] })}
                                  />
                                )}
                              </div>
                            ))}
                            {!isAdmin && !selectedBlock && !isDayOtherBusy && selectedDayVisits.every((v) => !v.isOwn) && (
                              <button
                                onClick={() => setShowRequest(true)}
                                className="w-full mt-1 flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors py-2"
                              >
                                <Plus className="h-3.5 w-3.5" /> Request a visit on this day
                              </button>
                            )}
                          </>
                        ) : null}

                        {isAdmin && !selectedBlock && (
                          <div className="border-t border-slate-100 pt-3">
                            <button
                              onClick={() => setShowBlockForm(true)}
                              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-amber-600 transition-colors py-1.5"
                            >
                              <BanIcon className="h-3.5 w-3.5" /> Mark day as unavailable
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })() : isAdmin && orgs.length > 0 ? (
                  <VisitMonthPlanPanel
                    orgs={orgs}
                    token={accessToken!}
                    year={year}
                    month={month}
                  />
                ) : (
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 text-center text-slate-400 text-sm">
                    <p className="text-slate-300 text-4xl mb-3">📅</p>
                    <p className="font-medium text-slate-500">Select a day</p>
                    <p className="text-xs mt-1">Click any date to view or manage visits</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Filtered agenda view */}
        {(viewMode === "month" || viewMode === "week") && isFiltered && (
          <AgendaView
            activeFilter={activeFilter}
            filterLabel={
              activeFilter === "HOLIDAY" ? "Public Holidays"
              : activeFilter === "BUSY_DAY" ? "Busy Days"
              : orgs.find((o) => o.id === activeFilter)?.name ?? ""}
            visits={visits}
            requests={requests}
            blocks={blocks}
            isAdmin={isAdmin}
            loading={loading}
            year={year}
            month={month}
            onEdit={setEditingVisit}
            onDelete={handleDeleteVisit}
            onClearFilter={() => setActiveFilter("")}
            token={accessToken!}
            onRequestDone={() => queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] })}
          />
        )}

      {/* Create / Edit Visit modal */}
      {(showCreate || editingVisit) && isAdmin && (
        <VisitFormModal
          orgs={orgs}
          token={accessToken!}
          editing={editingVisit}
          defaultDate={selectedDay ?? undefined}
          year={year}
          month={month}
          onClose={() => { setShowCreate(false); setEditingVisit(null); }}
          onSaved={() => {
            setShowCreate(false); setEditingVisit(null);
            queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] });
          }}
        />
      )}

      {/* Visit Request modal */}
      {showRequest && !isAdmin && (
        <RequestModal
          token={accessToken!}
          defaultDate={selectedDay ?? undefined}
          busyDates={busyDates}
          onClose={() => setShowRequest(false)}
          onSaved={() => { setShowRequest(false); queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] }); }}
        />
      )}

      {/* Block day modal */}
      {showBlockForm && isAdmin && selectedDay && (
        <BlockDayModal
          token={accessToken!}
          date={selectedDay}
          onClose={() => setShowBlockForm(false)}
          onSaved={() => {
            setShowBlockForm(false);
            queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] });
          }}
        />
      )}

        </>)}
      </div>
    </ProtectedRoute>
  );
}

// ── Year View (Consultancy) ───────────────────────────────────────────────────

function MiniVisitMonth({
  year, month, byDate, blockByDate, todayStr, onSelectDay,
}: {
  year: number;
  month: number;
  byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
  blockByDate: Record<string, CalendarBlock>;
  todayStr: string;
  onSelectDay: (dateStr: string, month: number, year: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDayOfWeek(year, month);

  return (
    <div className="bg-white p-4">
      <h3 className="text-xs font-bold text-slate-700 mb-3">{MONTHS[month - 1]}</h3>
      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[8px] font-bold text-slate-300">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dateStr     = toYMD(year, month, day);
          const dayData     = byDate[dateStr];
          const dayVisits   = dayData?.visits   ?? [];
          const dayRequests = dayData?.requests ?? [];
          const block       = blockByDate[dateStr];
          const isToday     = dateStr === todayStr;
          const hasActivity = dayVisits.length > 0 || dayRequests.length > 0 || !!block;

          let dotColor = "bg-slate-300";
          if (block?.type === "HOLIDAY")    dotColor = "bg-red-400";
          else if (block?.type === "BUSY_DAY") dotColor = "bg-amber-400";
          else if (dayRequests.length > 0 && dayVisits.length === 0) dotColor = "bg-purple-400";
          else if (dayVisits.length > 0) {
            const s = dayVisits[0].status;
            dotColor = s === "CONFIRMED" ? "bg-emerald-500"
                     : s === "COMPLETED" ? "bg-blue-400"
                     : s === "CANCELLED" ? "bg-slate-300"
                     : "bg-amber-400";
          }

          return (
            <button
              key={day}
              onClick={() => onSelectDay(dateStr, month, year)}
              className={`relative flex items-center justify-center rounded text-[9px] font-medium py-0.5 transition-colors ${
                isToday                         ? "bg-blue-600 text-white"
                : block?.type === "HOLIDAY"     ? "text-red-600 hover:bg-red-50"
                : block?.type === "BUSY_DAY"    ? "text-amber-600 hover:bg-amber-50"
                : hasActivity                   ? "text-slate-700 font-semibold hover:bg-blue-50"
                : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {day}
              {hasActivity && !isToday && (
                <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${dotColor}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YearViewVisits({
  year, byDate, blockByDate, todayStr, isLoading, onSelectDay, prevYear, nextYear,
}: {
  year: number;
  byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
  blockByDate: Record<string, CalendarBlock>;
  todayStr: string;
  isLoading: boolean;
  onSelectDay: (dateStr: string, month: number, year: number) => void;
  prevYear: () => void;
  nextYear: () => void;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button onClick={prevYear} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <h2 className="text-base font-bold text-slate-800">{year}</h2>
        <button onClick={nextYear} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap px-5 py-3 border-b border-slate-50">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Tentative</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" />Completed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-400" />Request</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Holiday</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Busy Day</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-px bg-slate-100">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <MiniVisitMonth
                key={m}
                year={year}
                month={m}
                byDate={byDate}
                blockByDate={blockByDate}
                todayStr={todayStr}
                onSelectDay={onSelectDay}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({
  weekStart, weekEndDate, byDate, blockByDate, todayStr, selectedDay, setSelectedDay,
  isAdmin, prevWeek, nextWeek,
}: {
  weekStart: Date;
  weekEndDate: Date;
  byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
  blockByDate: Record<string, CalendarBlock>;
  todayStr: string;
  selectedDay: string | null;
  setSelectedDay: (d: string | null) => void;
  isAdmin: boolean;
  prevWeek: () => void;
  nextWeek: () => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekLabel = weekStart.getMonth() === weekEndDate.getMonth()
    ? `${weekStart.getDate()}–${weekEndDate.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()} ${MONTH_SHORT[weekStart.getMonth()]} – ${weekEndDate.getDate()} ${MONTH_SHORT[weekEndDate.getMonth()]} ${weekEndDate.getFullYear()}`;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button onClick={prevWeek} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <h2 className="text-base font-bold text-slate-800">{weekLabel}</h2>
        <button onClick={nextWeek} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100">
        {days.map((d) => {
          const key = dateToYMD(d);
          const isToday = key === todayStr;
          const isSelected = key === selectedDay;
          const block = blockByDate[key];
          const dayVisits   = byDate[key]?.visits   ?? [];
          const dayRequests = byDate[key]?.requests ?? [];

          return (
            <div
              key={key}
              onClick={() => setSelectedDay(isSelected ? null : key)}
              className={`min-h-[120px] p-2 border-r border-slate-100 last:border-r-0 cursor-pointer transition-all ${
                block?.type === "HOLIDAY" ? isSelected ? "bg-red-100" : "bg-red-50 hover:bg-red-100"
                : block?.type === "BUSY_DAY" ? isSelected ? "bg-amber-100" : "bg-amber-50 hover:bg-amber-100"
                : isSelected ? "bg-blue-50" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex flex-col items-center mb-2">
                <p className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? "text-blue-500" : "text-slate-400"}`}>
                  {d.toLocaleDateString("en-GB", { weekday: "short" })}
                </p>
                <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-bold ${
                  isToday ? "bg-blue-600 text-white" : isSelected ? "bg-blue-100 text-blue-700" : "text-slate-700"
                }`}>
                  {d.getDate()}
                </div>
              </div>
              {block && (
                <div className={`text-[8px] font-bold text-center truncate ${block.type === "HOLIDAY" ? "text-red-500" : "text-amber-600"}`}>
                  {block.label ?? (block.type === "HOLIDAY" ? "Holiday" : "Busy")}
                </div>
              )}
              <div className="space-y-0.5">
                {dayVisits.slice(0, 3).map((v) => (
                  <div key={v.id} className={`text-[8px] font-semibold px-1 py-0.5 rounded truncate ${VISIT_STATUS_COLOR[v.status]}`}>
                    {v.clientOrgName ?? v.title}
                  </div>
                ))}
                {dayVisits.length > 3 && <p className="text-[8px] text-slate-400 text-center">+{dayVisits.length - 3}</p>}
                {dayRequests.length > 0 && (
                  <div className="text-[8px] font-semibold px-1 py-0.5 rounded truncate bg-purple-100 text-purple-700">
                    {dayRequests.length} request{dayRequests.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Analytics Panel ───────────────────────────────────────────────────────────

function AnalyticsPanel({
  analytics, loading, year, onYearChange, isAdmin,
}: {
  analytics: any;
  loading: boolean;
  year: number;
  onYearChange: (y: number) => void;
  isAdmin: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
      </div>
    );
  }

  const maxMonthTotal = analytics
    ? Math.max(...analytics.byMonth.map((m: any) => m.total), 1)
    : 1;

  return (
    <div className="space-y-5">
      {/* Year picker */}
      <div className="flex items-center gap-3">
        <button onClick={() => onYearChange(year - 1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <span className="text-base font-bold text-slate-800 min-w-[60px] text-center">{year}</span>
        <button onClick={() => onYearChange(year + 1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {!analytics ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-14 text-center text-slate-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium text-slate-500">No data for {year}</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: "Total Visits", value: analytics.totalVisits, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Completed", value: analytics.completedVisits, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Pending Requests", value: analytics.pendingRequests, color: "text-amber-600", bg: "bg-amber-50" },
              {
                label: "Completion Rate",
                value: analytics.totalVisits > 0
                  ? `${Math.round((analytics.completedVisits / analytics.totalVisits) * 100)}%`
                  : "—",
                color: "text-indigo-600", bg: "bg-indigo-50",
              },
              {
                label: "Date Changes",
                value: analytics.totalReschedules ?? 0,
                color: "text-rose-600", bg: "bg-rose-50",
              },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Monthly bar chart */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Visits by Month</h3>
            <div className="flex items-end gap-2 h-40">
              {analytics.byMonth.map((m: any) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: "120px" }}>
                    <div
                      className="w-full bg-blue-500 rounded-sm transition-all duration-300"
                      style={{ height: `${Math.round((m.total / maxMonthTotal) * 100)}%`, minHeight: m.total > 0 ? "4px" : "0" }}
                      title={`${m.total} visits`}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium">{MONTH_SHORT[m.month - 1]}</p>
                  {m.total > 0 && <p className="text-[9px] text-blue-500 font-bold">{m.total}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* By org (admin only) */}
          {isAdmin && analytics.byOrg && analytics.byOrg.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Visits by Client</h3>
              <div className="space-y-3">
                {analytics.byOrg.map((row: any) => (
                  <div key={row.orgId}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-700">{row.orgName}</p>
                      <p className="text-xs text-slate-500">{row.completed}/{row.total}</p>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.round((row.total / analytics.totalVisits) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Agenda (list) view ────────────────────────────────────────────────────────

type AgendaItem =
  | { kind: "VISIT";    date: string; data: CalendarVisit }
  | { kind: "REQUEST";  date: string; data: CalendarRequest }
  | { kind: "BLOCK";    date: string; data: CalendarBlock };

function AgendaView({
  activeFilter, filterLabel, visits, requests, blocks,
  isAdmin, loading, year, month, onEdit, onDelete, onClearFilter, token, onRequestDone,
}: {
  activeFilter: string; filterLabel: string;
  visits: CalendarVisit[]; requests: CalendarRequest[]; blocks: CalendarBlock[];
  isAdmin: boolean; loading: boolean; year: number; month: number;
  onEdit: (v: CalendarVisit) => void; onDelete: (id: string) => void;
  onClearFilter: () => void; token: string; onRequestDone: () => void;
}) {
  const isBlockFilter = activeFilter === "HOLIDAY" || activeFilter === "BUSY_DAY";

  const items: AgendaItem[] = isBlockFilter
    ? blocks.filter((b) => b.type === activeFilter).map((b) => ({ kind: "BLOCK" as const, date: b.date, data: b }))
    : [
        ...visits.map((v) => ({ kind: "VISIT" as const, date: v.date, data: v })),
        ...requests.map((r) => ({ kind: "REQUEST" as const, date: r.date, data: r })),
      ];

  const byDate: Record<string, AgendaItem[]> = {};
  for (const item of items) {
    if (!byDate[item.date]) byDate[item.date] = [];
    byDate[item.date].push(item);
  }
  const dates = Object.keys(byDate).sort();

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
            const d = new Date(date + "T00:00:00");
            const isToday = date === today();
            return (
              <div key={date} className={`flex min-h-[72px] ${idx < dates.length - 1 ? "border-b border-slate-100" : ""}`}>
                <div className={`w-[72px] shrink-0 flex flex-col items-center justify-center py-4 border-r border-slate-100 ${isToday ? "bg-blue-50" : "bg-slate-50/60"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-blue-500" : "text-slate-400"}`}>
                    {d.toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                  <p className={`text-2xl font-light leading-none mt-0.5 ${isToday ? "text-blue-600" : "text-slate-700"}`}>{d.getDate()}</p>
                  <p className={`text-[10px] mt-0.5 ${isToday ? "text-blue-400" : "text-slate-400"}`}>
                    {d.toLocaleDateString("en-GB", { month: "short" })}
                  </p>
                </div>
                <div className="flex-1 px-4 py-3 space-y-2">
                  {byDate[date].map((item) => {
                    if (item.kind === "VISIT") return <AgendaVisitRow key={item.data.id} visit={item.data} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} />;
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

function AgendaVisitRow({ visit, isAdmin, onEdit, onDelete }: { visit: CalendarVisit; isAdmin: boolean; onEdit: (v: CalendarVisit) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${VISIT_DOT_COLOR[visit.status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{visit.title}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {visit.clientOrgName && <span className="flex items-center gap-1 text-xs text-slate-500"><Building2 className="h-3 w-3" /> {visit.clientOrgName}</span>}
          {(visit.startTime || visit.endTime) && <span className="flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" />{visit.startTime ?? ""}{visit.endTime ? ` – ${visit.endTime}` : ""}</span>}
          {visit.endDate && visit.endDate !== visit.date && <span className="text-xs text-indigo-500 font-medium">→ {visit.endDate}</span>}
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

function AgendaRequestRow({ request, isAdmin, token, onDone }: { request: CalendarRequest; isAdmin: boolean; token: string; onDone: () => void }) {
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-purple-400 shrink-0" />
        <p className="text-sm font-semibold text-purple-700 flex-1">{request.isOwn ? "Your visit request" : request.organizationName}</p>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${REQUEST_STATUS_COLOR[request.status]}`}>{request.status}</span>
      </div>
      {request.preferredTime && <p className="text-xs text-purple-600">Preferred: {request.preferredTime}</p>}
      {request.message && <p className="text-xs text-slate-500">{request.message}</p>}
      {request.responseNote && <p className="text-xs text-slate-500 border-t border-purple-100 pt-1.5">Response: {request.responseNote}</p>}
      {isAdmin && request.status === "PENDING" && <RequestActions requestId={request.id} token={token} onDone={onDone} />}
    </div>
  );
}

function AgendaBlockRow({ block }: { block: CalendarBlock }) {
  const isHoliday = block.type === "HOLIDAY";
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isHoliday ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
      {isHoliday ? <CalendarX2 className="h-4 w-4 text-red-500 shrink-0" /> : <BanIcon className="h-4 w-4 text-amber-500 shrink-0" />}
      <p className={`text-sm font-medium ${isHoliday ? "text-red-700" : "text-amber-700"}`}>
        {block.label ?? (isHoliday ? "Public Holiday" : "Busy Day")}
      </p>
    </div>
  );
}

// ── Visit Form Modal ──────────────────────────────────────────────────────────

function VisitFormModal({
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
  // ── Edit mode: single visit ────────────────────────────────────────────────
  const [clientOrgId,    setClientOrgId]    = useState(editing?.clientOrgId ?? "");
  const [editDate,       setEditDate]       = useState(editing?.date ?? defaultDate ?? "");
  const [editAgenda,     setEditAgenda]     = useState(editing?.notes ?? "");
  const [status,         setStatus]         = useState<VisitStatus>(editing?.status ?? "TENTATIVE");
  const [completionNote, setCompletionNote] = useState(editing?.completionNote ?? "");

  // ── Create mode: multi-visit ───────────────────────────────────────────────
  const [visitCount, setVisitCount] = useState<number>(1);
  const [slots, setSlots] = useState<{ date: string; agenda: string }[]>([{ date: defaultDate ?? "", agenda: "" }]);

  // Keep slots in sync when visitCount changes
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

  // ── Attendees (edit only) ──────────────────────────────────────────────────
  const [showAttendees, setShowAttendees] = useState(false);
  const queryClient = useQueryClient();

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

  // ── Submit ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const selectedOrg = orgs.find((o) => o.id === clientOrgId);

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
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

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
            <select
              className={`${inputCls} bg-white`}
              value={clientOrgId}
              onChange={(e) => setClientOrgId(e.target.value)}
            >
              <option value="">— Select client —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* ── CREATE MODE ── */}
          {!editing && clientOrgId && (
            <>
              {/* Number of visits */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Number of visits — <span className="font-normal text-slate-400">{MONTHS[month - 1]} {year}</span>
                </label>
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden w-fit bg-white">
                  <button
                    type="button"
                    onClick={() => handleCountChange(visitCount - 1)}
                    className="h-9 w-9 flex items-center justify-center hover:bg-slate-50 transition-colors border-r border-slate-100"
                  >
                    <Minus className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={visitCount}
                    onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
                    className="w-12 text-center text-sm font-bold text-slate-800 outline-none py-2"
                  />
                  <button
                    type="button"
                    onClick={() => handleCountChange(visitCount + 1)}
                    className="h-9 w-9 flex items-center justify-center hover:bg-slate-50 transition-colors border-l border-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Visit slots */}
              <div className="space-y-3">
                {slots.map((slot, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl p-3.5 space-y-2.5 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">Visit {i + 1}</span>
                    </div>
                    <input
                      type="date"
                      value={slot.date}
                      min={`${monthPrefix}-01`}
                      max={`${monthPrefix}-31`}
                      onChange={(e) => updateSlot(i, "date", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    />
                    <textarea
                      rows={2}
                      placeholder="Agenda for this visit…"
                      value={slot.agenda}
                      onChange={(e) => updateSlot(i, "agenda", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-300"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
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

          {/* Completion summary — only when COMPLETED */}
          {status === "COMPLETED" && (
            <div>
              <label className="text-xs font-semibold text-blue-500 block mb-1">Completion Summary</label>
              <textarea rows={2} className={`${inputCls} resize-none border-blue-200 focus:border-blue-400 focus:ring-blue-500/20`} value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} placeholder="What was accomplished during this visit?" />
            </div>
          )}

          {/* Attendees — only when editing */}
          {editing && clientOrgId && (
            <div className="border border-slate-100 rounded-xl p-3 space-y-3">
              <button
                type="button"
                onClick={() => setShowAttendees((s) => !s)}
                className="flex items-center gap-2 w-full text-xs font-semibold text-slate-500"
              >
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
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Visit Request modal ───────────────────────────────────────────────────────

function RequestModal({ token, defaultDate, busyDates, onClose, onSaved }: { token: string; defaultDate?: string; busyDates: Set<string>; onClose: () => void; onSaved: () => void }) {
  const [date,          setDate]          = useState(defaultDate ?? "");
  const [preferredTime, setPreferredTime] = useState("");
  const [message,       setMessage]       = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const dateIsBusy = !!date && busyDates.has(date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setError("Please select a date."); return; }
    if (dateIsBusy) { setError("This date is unavailable. Please choose another date."); return; }
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
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Requested Date</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} />
          </div>
          {dateIsBusy && (
            <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <Lock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600">This date is already booked. Please select a different date.</p>
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
            <button type="submit" disabled={saving || dateIsBusy} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
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

// ── Block Day Modal ───────────────────────────────────────────────────────────

function BlockDayModal({ token, date, onClose, onSaved }: { token: string; date: string; onClose: () => void; onSaved: () => void }) {
  const [type,  setType]  = useState<CalendarBlockType>("BUSY_DAY");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await CalendarService.createBlock({ date, type, label: label.trim() || undefined }, token);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to block day");
    } finally { setSaving(false); }
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Mark Day Unavailable</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">{displayDate}</p>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-2">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["BUSY_DAY", "HOLIDAY"] as CalendarBlockType[]).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    type === t
                      ? t === "HOLIDAY" ? "bg-red-50 border-red-300 text-red-700" : "bg-amber-50 border-amber-300 text-amber-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}>
                  {t === "HOLIDAY" ? "🏖 Public Holiday" : "🚫 Busy Day"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Label <span className="font-normal text-slate-400">(optional)</span></label>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={type === "HOLIDAY" ? "e.g. Eid al-Fitr" : "e.g. Team offsite"} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BanIcon className="h-4 w-4" />}
              {saving ? "Saving…" : "Block This Day"}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Inline request approval ───────────────────────────────────────────────────

function RequestActions({ requestId, token, onDone }: { requestId: string; token: string; onDone: () => void }) {
  const [note, setNote] = useState("");
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
