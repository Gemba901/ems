"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ChevronLeft, ChevronRight, Search, Download, BarChart3, CalendarClock, X, Bell,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  CalendarService, AgendaItem, AgendaItemKind, HolisticCalendarEvent, CalendarVisit, CalendarFilterDto,
} from "@/services/calendar.service";
import { MONTHS, getWeekStart, addDays, dateToYMD, toYMD, today as todayYMD } from "@/components/calendar/calendarUtils";
import { AGENDA_KIND_FILTERS, CalendarViewMode, groupAgendaByDate } from "@/components/calendar/types";
import { MiniMonthNav } from "@/components/calendar/MiniMonthNav";
import { DayQuickPopover } from "@/components/calendar/DayQuickPopover";
import { EventPopover } from "@/components/calendar/EventPopover";
import { EventFormModal } from "@/components/calendar/EventFormModal";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarYearView } from "@/components/calendar/CalendarYearView";
import { CalendarScheduleView } from "@/components/calendar/CalendarScheduleView";
import { VisitFormModal } from "@/components/calendar/VisitFormModal";
import { RequestModal } from "@/components/calendar/RequestModal";
import { BlockDayModal } from "@/components/calendar/BlockDayModal";
import { AnalyticsPanel } from "@/components/calendar/AnalyticsPanel";
import { VisitMonthPlanPanel } from "@/components/calendar/VisitMonthPlanPanel";
import { CustomFilterForm } from "@/components/calendar/CustomFilterForm";

const ALL_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE];
const ORG_MANAGER_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR];
const VIEW_MODES: { key: CalendarViewMode; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "schedule", label: "Schedule" },
];

function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { accessToken, user } = useAuthStore();
  const token = accessToken ?? "";
  const isAdmin = user?.isAdminOrg === true;
  const isOrgManager = ORG_MANAGER_ROLES.includes(user?.roleLevel ?? "");
  const queryClient = useQueryClient();
  const todayStr = todayYMD();
  const now = new Date();

  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(now));
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);
  const [search, setSearch] = useState("");
  const [kindFilters, setKindFilters] = useState<Set<AgendaItemKind>>(new Set(["EVENT", "VISIT", "REQUEST", "BLOCK", "CLIENT_VISIT", "BIRTHDAY"]));
  const [activeCustomFilterIds, setActiveCustomFilterIds] = useState<Set<string>>(new Set());
  const [quickCreateProspect, setQuickCreateProspect] = useState(false);

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HolisticCalendarEvent | null>(null);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [editingVisit, setEditingVisit] = useState<CalendarVisit | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [popoverItem, setPopoverItem] = useState<AgendaItem | null>(null);
  const [dayPopoverDate, setDayPopoverDate] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showVisitPlan, setShowVisitPlan] = useState(false);
  const [analyticsYear, setAnalyticsYear] = useState(now.getFullYear());

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: adminOrg } = useQuery({
    queryKey: ["calendar-admin-org"],
    queryFn: () => CalendarService.getAdminOrg(token).catch(() => null),
    enabled: !!token,
  });
  const adminOrgConfigured = !!adminOrg;

  const { data: orgs = [] } = useQuery({
    queryKey: ["calendar-partner-orgs"],
    queryFn: () => CalendarService.getPartnerOrganizations(token),
    enabled: !!token && isAdmin,
  });

  const { data: customFilters = [] } = useQuery({
    queryKey: ["calendar-filters"],
    queryFn: () => CalendarService.getFilters(token),
    enabled: !!token,
  });

  const { data: primaryData, isLoading: primaryLoading } = useQuery({
    queryKey: ["calendar-agenda", year, month],
    queryFn: () => CalendarService.getAgenda(year, month, token),
    enabled: !!token,
  });

  const scheduleMonths = useMemo(() => {
    if (viewMode !== "schedule") return [];
    return [1, 2].map(offset => {
      const d = new Date(year, month - 1 + offset, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }, [viewMode, year, month]);

  const scheduleResults = useQueries({
    queries: scheduleMonths.map(({ year: y, month: m }) => ({
      queryKey: ["calendar-agenda", y, m] as const,
      queryFn: () => CalendarService.getAgenda(y, m, token),
      enabled: !!token,
    })),
  });
  const scheduleLoading = scheduleResults.some(q => q.isLoading);

  const yearResults = useQueries({
    queries: viewMode === "year"
      ? Array.from({ length: 12 }, (_, i) => ({
          queryKey: ["calendar-agenda", viewYear, i + 1] as const,
          queryFn: () => CalendarService.getAgenda(viewYear, i + 1, token),
          enabled: !!token,
        }))
      : [],
  });
  const yearLoading = yearResults.some(q => q.isLoading);

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["calendar-analytics", analyticsYear],
    queryFn: () => CalendarService.getAnalytics(analyticsYear, token),
    enabled: !!token && showAnalytics,
  });

  const invalidateAgenda = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["calendar-agenda"] });
  }, [queryClient]);

  const deleteVisitMutation = useMutation({
    mutationFn: (id: string) => CalendarService.deleteVisit(id, token),
    onSuccess: invalidateAgenda,
  });
  const unblockMutation = useMutation({
    mutationFn: (id: string) => CalendarService.deleteBlock(id, token),
    onSuccess: invalidateAgenda,
  });

  const invalidateFilters = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["calendar-filters"] });
  }, [queryClient]);

  const createFilterMutation = useMutation({
    mutationFn: (data: { name: string; kinds?: string[]; orgIds?: string[]; colors?: string[] }) =>
      CalendarService.createFilter(data, token),
    onSuccess: invalidateFilters,
  });
  const deleteFilterMutation = useMutation({
    mutationFn: (id: string) => CalendarService.deleteFilter(id, token),
    onSuccess: (_data, id) => {
      invalidateFilters();
      setActiveCustomFilterIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  // ── Filtering ─────────────────────────────────────────────────────────────

  const customFilterMatches = useCallback((filter: CalendarFilterDto, item: AgendaItem) => {
    if (filter.kinds.length && !filter.kinds.includes(item.kind)) return false;
    if (filter.orgIds.length) {
      const orgId = (item.detail as { clientOrgId?: string }).clientOrgId;
      if (!orgId || !filter.orgIds.includes(orgId)) return false;
    }
    if (filter.colors.length && !filter.colors.includes(item.color)) return false;
    return true;
  }, []);

  const matchesFilters = useCallback((item: AgendaItem) => {
    const kindMatch = kindFilters.has(item.kind);
    const customMatch = customFilters.some(f => activeCustomFilterIds.has(f.id) && customFilterMatches(f, item));
    if (!kindMatch && !customMatch) return false;
    if (search.trim() && !item.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }, [kindFilters, search, customFilters, activeCustomFilterIds, customFilterMatches]);

  const byDatePrimary = useMemo(
    () => groupAgendaByDate((primaryData?.items ?? []).filter(matchesFilters)),
    [primaryData, matchesFilters],
  );

  const byDateSchedule = useMemo(() => {
    const all = [...(primaryData?.items ?? [])];
    for (const q of scheduleResults) if (q.data) all.push(...q.data.items);
    return groupAgendaByDate(all.filter(matchesFilters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryData, scheduleLoading, matchesFilters]);

  const byDateYear = useMemo(() => {
    if (viewMode !== "year") return {};
    const all: AgendaItem[] = [];
    for (const q of yearResults) if (q.data) all.push(...q.data.items);
    return groupAgendaByDate(all.filter(matchesFilters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, viewYear, yearLoading, matchesFilters]);

  const pendingCount = primaryData?.pendingInvitationsCount ?? 0;
  const busyDates = useMemo(() => new Set(primaryData?.busyDates ?? []), [primaryData]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const toggleKindFilter = (key: AgendaItemKind) => {
    setKindFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleCustomFilter = (id: string) => {
    setActiveCustomFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectDate = (dateStr: string) => {
    const [y, m] = dateStr.split("-").map(Number);
    if (y !== year || m !== month) { setYear(y); setMonth(m); }
    setSelectedDate(dateStr);
  };

  const handleDayClick = (dateStr: string) => {
    handleSelectDate(dateStr);
    setDayPopoverDate(dateStr);
  };

  const prevMonth = () => {
    setSelectedDate(null);
    if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDate(null);
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  };
  const prevWeek = () => {
    const nw = addDays(weekStart, -7);
    setWeekStart(nw); setSelectedDate(null);
    if (nw.getMonth() + 1 !== month || nw.getFullYear() !== year) { setMonth(nw.getMonth() + 1); setYear(nw.getFullYear()); }
  };
  const nextWeek = () => {
    const nw = addDays(weekStart, 7);
    setWeekStart(nw); setSelectedDate(null);
    if (nw.getMonth() + 1 !== month || nw.getFullYear() !== year) { setMonth(nw.getMonth() + 1); setYear(nw.getFullYear()); }
  };
  const prevDay = () => {
    const nd = addDays(new Date(`${selectedDate ?? todayStr}T00:00:00`), -1);
    const ds = dateToYMD(nd);
    setSelectedDate(ds);
    if (nd.getMonth() + 1 !== month || nd.getFullYear() !== year) { setMonth(nd.getMonth() + 1); setYear(nd.getFullYear()); }
  };
  const nextDay = () => {
    const nd = addDays(new Date(`${selectedDate ?? todayStr}T00:00:00`), 1);
    const ds = dateToYMD(nd);
    setSelectedDate(ds);
    if (nd.getMonth() + 1 !== month || nd.getFullYear() !== year) { setMonth(nd.getMonth() + 1); setYear(nd.getFullYear()); }
  };

  const goToday = () => {
    const n = new Date();
    setYear(n.getFullYear()); setMonth(n.getMonth() + 1);
    setWeekStart(getWeekStart(n));
    setSelectedDate(todayStr);
    setViewYear(n.getFullYear());
  };

  const goPrev = () => {
    if (viewMode === "week") prevWeek();
    else if (viewMode === "day") prevDay();
    else if (viewMode === "year") setViewYear(y => y - 1);
    else prevMonth();
  };
  const goNext = () => {
    if (viewMode === "week") nextWeek();
    else if (viewMode === "day") nextDay();
    else if (viewMode === "year") setViewYear(y => y + 1);
    else nextMonth();
  };

  const handleViewMode = (vm: CalendarViewMode) => {
    if (vm === "week" && (weekStart.getMonth() + 1 !== month || weekStart.getFullYear() !== year)) {
      setWeekStart(getWeekStart(new Date(year, month - 1, 1)));
    }
    if (vm === "day" && !selectedDate) {
      setSelectedDate(toYMD(year, month, 1));
    }
    if (vm === "year") setViewYear(year);
    setViewMode(vm);
  };

  const rangeLabel = useMemo(() => {
    if (viewMode === "year") return `${viewYear}`;
    if (viewMode === "week") {
      const end = addDays(weekStart, 6);
      return weekStart.getMonth() === end.getMonth()
        ? `${weekStart.getDate()}–${end.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
        : `${weekStart.getDate()} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
    }
    if (viewMode === "day") {
      return new Date(`${selectedDate ?? todayStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    return `${MONTHS[month - 1]} ${year}`;
  }, [viewMode, viewYear, weekStart, selectedDate, month, year, todayStr]);

  const handleIcalDownload = async () => {
    try {
      const url = CalendarService.getIcalUrl(year, month);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `calendar-${year}-${String(month).padStart(2, "0")}.ics`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      // ignore export failures — non-critical convenience action
    }
  };

  const handleOpenItem = (item: AgendaItem) => setPopoverItem(item);
  const handleEditEvent = (event: HolisticCalendarEvent) => { setPopoverItem(null); setEditingEvent(event); setShowEventForm(true); };
  const handleEditVisit = (visit: CalendarVisit) => { setEditingVisit(visit); setShowVisitForm(true); };
  const handleDeleteVisit = (id: string) => { if (confirm("Delete this visit?")) deleteVisitMutation.mutate(id); };
  const handleUnblock = (id: string) => { if (confirm("Remove this block?")) unblockMutation.mutate(id); };

  const createMenuDate = selectedDate ?? todayStr;

  return (
    <ProtectedRoute allowedRoles={ALL_ROLES}>
      <div className="mx-auto max-w-400 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
            <p className="mt-0.5 text-sm text-slate-500">Manage your schedule, meetings, and consultancy visits in one place</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && adminOrgConfigured && (
              <button
                onClick={() => setShowVisitPlan(true)}
                title="Visit planning"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
              >
                <CalendarClock className="h-4 w-4" />
              </button>
            )}
            {isAdmin && adminOrgConfigured && (
              <button
                onClick={() => setShowAnalytics(true)}
                title="Analytics"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
              >
                <BarChart3 className="h-4 w-4" />
              </button>
            )}
            {adminOrgConfigured && viewMode !== "year" && (
              <button
                onClick={handleIcalDownload}
                title="Export to iCal"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-700">
            <Bell className="h-4 w-4 shrink-0" />
            You have {pendingCount} pending invitation{pendingCount > 1 ? "s" : ""} this month.
          </div>
        )}

        <div className="flex gap-5">
          <div className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
            <div className="relative">
              <button
                onClick={() => setShowCreateMenu(s => !s)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Create
              </button>
              {showCreateMenu && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
                  <button
                    onClick={() => { setEditingEvent(null); setQuickCreateProspect(false); setShowEventForm(true); setShowCreateMenu(false); }}
                    className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Event
                  </button>
                  {isAdmin && adminOrgConfigured && (
                    <button
                      onClick={() => { setEditingEvent(null); setQuickCreateProspect(true); setShowEventForm(true); setShowCreateMenu(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      New Client Visit
                    </button>
                  )}
                  {isAdmin && adminOrgConfigured && (
                    <button
                      onClick={() => { setEditingVisit(null); setShowVisitForm(true); setShowCreateMenu(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Scheduled Partner Visit
                    </button>
                  )}
                  {!isAdmin && adminOrgConfigured && (
                    <button
                      onClick={() => { setShowRequestModal(true); setShowCreateMenu(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Request a visit
                    </button>
                  )}
                  {isAdmin && adminOrgConfigured && (
                    <button
                      onClick={() => { setShowBlockModal(true); setShowCreateMenu(false); }}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Block a day
                    </button>
                  )}
                </div>
              )}
            </div>

            <MiniMonthNav
              year={year}
              month={month}
              selectedDate={selectedDate}
              todayStr={todayStr}
              markedDates={new Set(Object.keys(byDatePrimary).filter(d => byDatePrimary[d].length > 0))}
              onPrev={prevMonth}
              onNext={nextMonth}
              onSelectDate={handleSelectDate}
            />

            <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Show</p>
              {AGENDA_KIND_FILTERS.map(f => (
                <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={kindFilters.has(f.key)} onChange={() => toggleKindFilter(f.key)} className="rounded accent-blue-600" />
                  {f.label}
                </label>
              ))}
            </div>

            <CustomFilterForm
              filters={customFilters}
              activeFilterIds={activeCustomFilterIds}
              orgs={orgs}
              onToggle={toggleCustomFilter}
              onCreate={data => createFilterMutation.mutate(data)}
              onDelete={id => deleteFilterMutation.mutate(id)}
              creating={createFilterMutation.isPending}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button onClick={goToday} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
                  Today
                </button>
                <div className="flex items-center gap-0.5">
                  <button onClick={goPrev} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
                    <ChevronLeft className="h-4 w-4 text-slate-500" />
                  </button>
                  <button onClick={goNext} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>
                </div>
                <h2 className="ml-1 text-base font-bold text-slate-800">{rangeLabel}</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative hidden md:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-48 rounded-xl border border-slate-200 py-1.5 pl-8 pr-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-1">
                  {VIEW_MODES.map(vm => (
                    <button
                      key={vm.key}
                      onClick={() => handleViewMode(vm.key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        viewMode === vm.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {vm.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-150">
              {viewMode === "month" && (
                <CalendarMonthView
                  year={year} month={month} byDate={byDatePrimary} todayStr={todayStr} selectedDate={selectedDate}
                  isLoading={primaryLoading} onSelectDate={handleDayClick} onOpenItem={handleOpenItem}
                  onPrev={prevMonth} onNext={nextMonth}
                />
              )}
              {viewMode === "week" && (
                <CalendarWeekView
                  weekStart={weekStart} byDate={byDatePrimary} todayStr={todayStr} selectedDate={selectedDate}
                  isLoading={primaryLoading} onSelectDate={handleDayClick} onOpenItem={handleOpenItem}
                  onPrev={prevWeek} onNext={nextWeek}
                />
              )}
              {viewMode === "day" && (
                <CalendarDayView
                  dateStr={selectedDate ?? todayStr}
                  items={byDatePrimary[selectedDate ?? todayStr] ?? []}
                  isLoading={primaryLoading}
                  isToday={(selectedDate ?? todayStr) === todayStr}
                  onPrev={prevDay} onNext={nextDay} onOpenItem={handleOpenItem}
                />
              )}
              {viewMode === "year" && (
                <CalendarYearView
                  year={viewYear} byDate={byDateYear} todayStr={todayStr} isLoading={yearLoading}
                  onSelectDay={(dateStr, m, y) => { setYear(y); setMonth(m); setSelectedDate(dateStr); setViewMode("month"); }}
                  onPrev={() => setViewYear(y => y - 1)} onNext={() => setViewYear(y => y + 1)}
                />
              )}
              {viewMode === "schedule" && (
                <CalendarScheduleView
                  year={year} month={month} byDate={byDateSchedule} isLoading={primaryLoading || scheduleLoading}
                  selectedDate={selectedDate} onSelectDate={handleSelectDate} onOpenItem={handleOpenItem}
                  onPrev={prevMonth} onNext={nextMonth}
                />
              )}
            </div>
          </div>
        </div>

        {showEventForm && (
          <EventFormModal
            token={token}
            defaultDate={createMenuDate}
            editing={editingEvent}
            isOrgManager={isOrgManager}
            quickCreateProspect={quickCreateProspect}
            onClose={() => { setShowEventForm(false); setEditingEvent(null); setQuickCreateProspect(false); }}
            onSaved={() => { setShowEventForm(false); setEditingEvent(null); setQuickCreateProspect(false); invalidateAgenda(); }}
          />
        )}

        {(showVisitForm || editingVisit) && isAdmin && (
          <VisitFormModal
            orgs={orgs}
            token={token}
            editing={editingVisit}
            defaultDate={createMenuDate}
            year={year}
            month={month}
            onClose={() => { setShowVisitForm(false); setEditingVisit(null); }}
            onSaved={() => { setShowVisitForm(false); setEditingVisit(null); invalidateAgenda(); }}
          />
        )}

        {showRequestModal && !isAdmin && (
          <RequestModal
            token={token}
            defaultDate={createMenuDate}
            busyDates={busyDates}
            onClose={() => setShowRequestModal(false)}
            onSaved={() => { setShowRequestModal(false); invalidateAgenda(); }}
          />
        )}

        {showBlockModal && isAdmin && (
          <BlockDayModal
            token={token}
            date={createMenuDate}
            currentEmployeeId={primaryData?.employeeId}
            onClose={() => setShowBlockModal(false)}
            onSaved={() => { setShowBlockModal(false); invalidateAgenda(); }}
          />
        )}

        {dayPopoverDate && (
          <DayQuickPopover
            dateStr={dayPopoverDate}
            items={byDatePrimary[dayPopoverDate] ?? []}
            isLoading={primaryLoading}
            isAdmin={isAdmin}
            adminOrgConfigured={adminOrgConfigured}
            onClose={() => setDayPopoverDate(null)}
            onOpenItem={handleOpenItem}
            onCreateEvent={() => { setEditingEvent(null); setShowEventForm(true); }}
            onCreateVisit={() => { setEditingVisit(null); setShowVisitForm(true); }}
            onCreateRequest={() => setShowRequestModal(true)}
            onCreateBlock={() => setShowBlockModal(true)}
          />
        )}

        {popoverItem && (
          <EventPopover
            item={popoverItem}
            token={token}
            isAdmin={isAdmin}
            onClose={() => setPopoverItem(null)}
            onChanged={invalidateAgenda}
            onEditEvent={handleEditEvent}
            onEditVisit={handleEditVisit}
            onDeleteVisit={handleDeleteVisit}
            onUnblock={handleUnblock}
          />
        )}

        {showAnalytics && (
          <ModalWrap title="Analytics" onClose={() => setShowAnalytics(false)}>
            <AnalyticsPanel analytics={analytics} loading={analyticsLoading} year={analyticsYear} onYearChange={setAnalyticsYear} isAdmin={isAdmin} />
          </ModalWrap>
        )}

        {showVisitPlan && (
          <ModalWrap title="Monthly Visit Plan" onClose={() => setShowVisitPlan(false)}>
            <VisitMonthPlanPanel orgs={orgs} token={token} year={year} month={month} />
          </ModalWrap>
        )}
      </div>
    </ProtectedRoute>
  );
}
