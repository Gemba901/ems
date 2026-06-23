"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarService, CalendarVisit, CalendarRequest, CalendarBlock,
  AdminOrg, ClientOrg, VISIT_DOT_COLOR, REQUEST_STATUS_COLOR,
} from "@/services/calendar.service";
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2,
  FileText, Lock, BanIcon, CalendarX2,
  ShieldAlert, Settings, Download,
  BarChart3, Calendar, LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import { VisitMonthPlanPanel } from "./VisitMonthPlanPanel";
import { VisitCard } from "./VisitCard";
import { RequestActions } from "./AgendaView";
import { WeekView } from "./WeekView";
import { YearViewVisits } from "./YearView";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { AgendaView } from "./AgendaView";
import { VisitFormModal } from "./VisitFormModal";
import { RequestModal } from "./RequestModal";
import { BlockDayModal } from "./BlockDayModal";
import {
  DAYS, MONTHS,
  getDaysInMonth, getFirstDayOfWeek, toYMD, today, getWeekStart, addDays, dateToYMD,
} from "./calendarUtils";

type ViewMode = "month" | "week" | "analytics" | "year";

export function ConsultancyCalendarTab({
  accessToken,
  isAdmin,
}: {
  accessToken: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();

  const now = new Date();
  const [year,          setYear]          = useState(now.getFullYear());
  const [month,         setMonth]         = useState(now.getMonth() + 1);
  const [viewMode,      setViewMode]      = useState<ViewMode>("month");
  const [weekStart,     setWeekStart]     = useState(() => getWeekStart(now));
  const [selectedDay,   setSelectedDay]   = useState<string | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [editingVisit,  setEditingVisit]  = useState<CalendarVisit | null>(null);
  const [showRequest,   setShowRequest]   = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [activeFilter,  setActiveFilter]  = useState<string>("");
  const [analyticsYear, setAnalyticsYear] = useState(now.getFullYear());
  const [visitViewYear, setVisitViewYear] = useState(now.getFullYear());

  const isFiltered   = activeFilter !== "";
  const filterOrgId  = activeFilter !== "HOLIDAY" && activeFilter !== "BUSY_DAY"
    ? (activeFilter || undefined) : undefined;
  const todayStr = today();

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: adminOrg, isLoading: adminOrgLoading } = useQuery({
    queryKey: ["calendar-admin-org"],
    queryFn: () => CalendarService.getAdminOrg(accessToken).catch(() => null),
    enabled: !!accessToken,
  });
  const adminOrgResolved: AdminOrg | null | undefined = adminOrgLoading ? undefined : (adminOrg ?? null);

  const { data: monthData, isLoading: loading, error: monthError } = useQuery({
    queryKey: ["calendar-month", year, month, activeFilter],
    queryFn: () => CalendarService.getMonthVisits(year, month, accessToken, filterOrgId),
    enabled: !!accessToken && viewMode !== "analytics",
  });

  const weekEndDate = addDays(weekStart, 6);
  const weekYear    = weekStart.getFullYear();
  const weekMonth   = weekStart.getMonth() + 1;
  useQuery({
    queryKey: ["calendar-month", weekYear, weekMonth, ""],
    queryFn: () => CalendarService.getMonthVisits(weekYear, weekMonth, accessToken),
    enabled: !!accessToken && viewMode === "week",
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["calendar-analytics", analyticsYear],
    queryFn: () => CalendarService.getAnalytics(analyticsYear, accessToken),
    enabled: !!accessToken && viewMode === "analytics",
  });

  const yearVisitResults = useQueries({
    queries: viewMode === "year"
      ? Array.from({ length: 12 }, (_, i) => ({
          queryKey: ["calendar-month", visitViewYear, i + 1, ""] as const,
          queryFn: () => CalendarService.getMonthVisits(visitViewYear, i + 1, accessToken),
          enabled: !!accessToken,
        }))
      : [],
  });
  const yearVisitLoading = yearVisitResults.some((q) => q.isLoading);

  const { data: orgs = [] } = useQuery({
    queryKey: ["calendar-client-orgs"],
    queryFn: () => CalendarService.getClientOrganizations(accessToken),
    enabled: !!accessToken && isAdmin,
  });

  // ── Derived data ─────────────────────────────────────────────────────────────

  const byDateVisitYear = useMemo(() => {
    if (viewMode !== "year") return {} as Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }>;
    const map: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }> = {};
    for (const q of yearVisitResults) {
      if (!q.data) continue;
      for (const v of q.data.visits) {
        let cur = new Date(v.date + "T00:00:00");
        const endD = new Date((v.endDate ?? v.date) + "T00:00:00");
        while (cur <= endD) {
          const key = dateToYMD(cur);
          if (!map[key]) map[key] = { visits: [], requests: [] };
          if (!map[key].visits.find((x) => x.id === v.id)) map[key].visits.push(v);
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

  const byDate: Record<string, { visits: CalendarVisit[]; requests: CalendarRequest[] }> = {};
  for (const v of visits) {
    let cur = new Date(v.date + "T00:00:00");
    const endD = new Date((v.endDate ?? v.date) + "T00:00:00");
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

  const selectedDayData     = selectedDay ? byDate[selectedDay] : null;
  const selectedDayVisits   = selectedDayData?.visits   ?? [];
  const selectedDayRequests = selectedDayData?.requests ?? [];
  const daysInMonth    = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => CalendarService.deleteVisit(id, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] });
      setSelectedDay(null);
    },
    onError: (e: unknown) => setDeleteError(e instanceof Error ? e.message : "Delete failed"),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => CalendarService.deleteBlock(id, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1);
    setSelectedDay(null);
  };
  const prevWeek = () => setWeekStart((ws) => addDays(ws, -7));
  const nextWeek = () => setWeekStart((ws) => addDays(ws, 7));

  const handleDeleteVisit = (id: string) => {
    if (!confirm("Delete this visit?")) return;
    setDeleteError(null);
    deleteMutation.mutate(id);
  };

  const handleIcalDownload = () => {
    const url = CalendarService.getIcalUrl(year, month);
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `visits-${year}-${String(month).padStart(2, "0")}.ics`;
        link.click();
      });
  };

  // ── Not configured state ──────────────────────────────────────────────────────

  if (adminOrgResolved === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (adminOrgResolved === null) {
    return (
      <div className="max-w-lg mx-auto mt-24 text-center space-y-5 px-4">
        <div className="flex items-center justify-center">
          <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-amber-400" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {isAdmin ? "Client Visit Plan" : "Consultancy Visits"} not configured
          </h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            The {isAdmin ? "Client Visit Plan" : "Consultancy Visits"} tab requires a platform company to be designated.
            {isAdmin ? " Head to Platform Settings to configure this." : " Please contact your administrator."}
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
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
        <p className="hidden sm:block text-sm text-slate-500">
          {isAdmin ? "Manage client visit plans across all clients" : "Your upcoming visits and availability"}
        </p>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
            {(["month", "week", "analytics", "year"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => { if (v === "year") setVisitViewYear(year); setViewMode(v); setSelectedDay(null); }}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v === "month"     ? <Calendar      className="h-3.5 w-3.5" />
                  : v === "week"   ? <ChevronRight  className="h-3.5 w-3.5" />
                  : v === "year"   ? <LayoutGrid    className="h-3.5 w-3.5" />
                  : <BarChart3 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">
                  {v === "month" ? "Month" : v === "week" ? "Week" : v === "year" ? "Year" : "Analytics"}
                </span>
              </button>
            ))}
          </div>

          {isAdmin && viewMode !== "analytics" && viewMode !== "year" && (
            <select
              value={activeFilter}
              onChange={(e) => { setActiveFilter(e.target.value); setSelectedDay(null); }}
              className="border border-slate-200 rounded-xl px-2 sm:px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all min-w-0 flex-1 sm:flex-none sm:min-w-[140px]"
            >
              <option value="">All clients</option>
              {orgs.length > 0 && (
                <optgroup label="By Client">
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </optgroup>
              )}
              <optgroup label="Availability">
                <option value="HOLIDAY">Public Holidays</option>
                <option value="BUSY_DAY">Busy Days</option>
              </optgroup>
            </select>
          )}

          <div className="flex items-center gap-2 ml-auto sm:ml-0">
            {viewMode !== "analytics" && viewMode !== "year" && (
              <button
                onClick={handleIcalDownload}
                title="Export to iCal"
                className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-2.5 sm:px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            {isAdmin && viewMode !== "analytics" && viewMode !== "year" && (
              <button
                onClick={() => { setShowCreate(true); setEditingVisit(null); }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Schedule Visit</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* Analytics */}
      {viewMode === "analytics" && (
        <AnalyticsPanel
          analytics={analyticsData}
          loading={analyticsLoading}
          year={analyticsYear}
          onYearChange={setAnalyticsYear}
          isAdmin={isAdmin}
        />
      )}

      {/* Year */}
      {viewMode === "year" && (
        <YearViewVisits
          year={visitViewYear}
          byDate={byDateVisitYear}
          blockByDate={yearBlockByDate}
          todayStr={todayStr}
          isLoading={yearVisitLoading}
          onSelectDay={(dateStr, m, y) => { setYear(y); setMonth(m); setViewMode("month"); setSelectedDay(dateStr); }}
          prevYear={() => setVisitViewYear((y) => y - 1)}
          nextYear={() => setVisitViewYear((y) => y + 1)}
        />
      )}

      {/* Week */}
      {viewMode === "week" && !isFiltered && (
        <WeekView
          weekStart={weekStart}
          weekEndDate={weekEndDate}
          byDate={byDate}
          blockByDate={blockByDate}
          todayStr={todayStr}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          isAdmin={isAdmin}
          prevWeek={prevWeek}
          nextWeek={nextWeek}
        />
      )}

      {/* Month */}
      {viewMode === "month" && !isFiltered && (
        <>
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
                            {dayVisits.map((v) => (
                              <span key={v.id} className={`h-2 w-2 rounded-full ${VISIT_DOT_COLOR[v.status]}`} title={isAdmin ? v.title : undefined} />
                            ))}
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
                const selectedBlock  = blockByDate[selectedDay];
                const isDayOtherBusy = !isAdmin && busyDates.has(selectedDay);
                return (
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden sticky top-6">
                    <div className={`px-5 py-4 border-b flex items-center justify-between ${
                      selectedBlock?.type === "HOLIDAY"  ? "border-red-100 bg-red-50"
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
                              : <BanIcon    className="h-3.5 w-3.5 text-amber-500" />}
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
                              {unblockMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BanIcon className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      )}

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
                                  token={accessToken}
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
                <VisitMonthPlanPanel orgs={orgs} token={accessToken} year={year} month={month} />
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

      {/* Filtered agenda */}
      {(viewMode === "month" || viewMode === "week") && isFiltered && (
        <AgendaView
          activeFilter={activeFilter}
          filterLabel={
            activeFilter === "HOLIDAY"  ? "Public Holidays"
            : activeFilter === "BUSY_DAY" ? "Busy Days"
            : orgs.find((o) => o.id === activeFilter)?.name ?? ""
          }
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
          token={accessToken}
          onRequestDone={() => queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] })}
        />
      )}

      {/* Modals */}
      {(showCreate || editingVisit) && isAdmin && (
        <VisitFormModal
          orgs={orgs}
          token={accessToken}
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

      {showRequest && !isAdmin && (
        <RequestModal
          token={accessToken}
          defaultDate={selectedDay ?? undefined}
          busyDates={busyDates}
          onClose={() => setShowRequest(false)}
          onSaved={() => {
            setShowRequest(false);
            queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] });
          }}
        />
      )}

      {showBlockForm && isAdmin && selectedDay && (
        <BlockDayModal
          token={accessToken}
          date={selectedDay}
          onClose={() => setShowBlockForm(false)}
          onSaved={() => {
            setShowBlockForm(false);
            queryClient.invalidateQueries({ queryKey: ["calendar-month", year, month] });
          }}
        />
      )}
    </>
  );
}
