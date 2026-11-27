"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { PageHeader } from "@/components/patterns/PageHeader";
import { ConfirmDialog } from "@/components/patterns/ConfirmDialog";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { apiClient } from "@/lib/api-client";


import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ChevronLeft, ChevronRight, Search, Download, BarChart3, CalendarClock, X, Bell,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  CalendarService, AgendaItem, AgendaItemKind, HolisticCalendarEvent, CalendarFilterDto,
} from "@/services/calendar.service";
import { MONTHS, getWeekStart, addDays, dateToYMD, toYMD, today as todayYMD, isSundayDate } from "@/components/calendar/calendarUtils";
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
import { CreateFlowType } from "@/components/calendar/CreateTypeTabs";

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-4xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <DialogTitle className="text-base font-bold text-foreground">{title}</DialogTitle>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose} className="text-muted-foreground hover:text-muted-foreground"><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-6">{children}</div>
      </DialogContent>
    </Dialog>
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

  const [pendingRemoval, setPendingRemoval] = useState<{ kind: "visit" | "block"; id: string } | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(now));
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);
  const [search, setSearch] = useState("");
  const [kindFilters, setKindFilters] = useState<Set<AgendaItemKind>>(new Set(["EVENT", "VISIT", "REQUEST", "BLOCK", "CLIENT_VISIT", "BIRTHDAY", "HOLIDAY"]));
  const [activeCustomFilterIds, setActiveCustomFilterIds] = useState<Set<string>>(new Set());
  const [quickCreateProspect, setQuickCreateProspect] = useState(false);

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HolisticCalendarEvent | null>(null);
  const [showVisitForm, setShowVisitForm] = useState(false);
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

  const visibleKindFilters = useMemo(
    () => AGENDA_KIND_FILTERS.filter(f => !("adminOnly" in f && f.adminOnly) || isAdmin),
    [isAdmin],
  );

  const allKindsSelected = visibleKindFilters.every(f => kindFilters.has(f.key));

  const toggleAllKindFilters = () => {
    setKindFilters(prev => (prev.size === visibleKindFilters.length ? new Set() : new Set(visibleKindFilters.map(f => f.key))));
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

  const openCreateFlow = (type: CreateFlowType) => {
    setShowCreateMenu(false);
    setDayPopoverDate(null);
    setShowEventForm(false); setShowVisitForm(false); setShowRequestModal(false); setShowBlockModal(false);
    setEditingEvent(null);
    switch (type) {
      case "EVENT": setQuickCreateProspect(false); setShowEventForm(true); break;
      case "CLIENT_VISIT": setQuickCreateProspect(true); setShowEventForm(true); break;
      case "VISIT": setShowVisitForm(true); break;
      case "REQUEST": setShowRequestModal(true); break;
      case "BLOCK": setShowBlockModal(true); break;
    }
  };

  const handleDayClick = (dateStr: string) => {
    handleSelectDate(dateStr);
    const hasItems = (byDatePrimary[dateStr]?.length ?? 0) > 0;
    if (hasItems) {
      setDayPopoverDate(dateStr);
    } else {
      openCreateFlow("EVENT");
    }
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
      const res = await apiClient(url, { headers: { Authorization: `Bearer ${token}` } }, token);
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

  const createMenuDate = selectedDate ?? todayStr;
  const createMenuIsSunday = isSundayDate(createMenuDate);

  return (
    <ProtectedRoute allowedRoles={ALL_ROLES}>
      <div className="mx-auto max-w-400 space-y-4">
        <PageHeader
          title="Calendar"
          description="Manage your schedule, meetings, and consultancy visits."
          actions={<>
            <Button className="lg:hidden" onClick={() => openCreateFlow("EVENT")}><Plus /> Create</Button>
            {isAdmin && adminOrgConfigured && (
              <Button variant="ghost"
                onClick={() => setShowVisitPlan(true)}
                aria-label="Visit planning" title="Visit planning"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted"
              >
                <CalendarClock className="h-4 w-4" />
              </Button>
            )}
            {isAdmin && adminOrgConfigured && (
              <Button variant="ghost"
                onClick={() => setShowAnalytics(true)}
                aria-label="Analytics" title="Analytics"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted"
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
            )}
            {adminOrgConfigured && viewMode !== "year" && (
              <Button variant="ghost"
                onClick={handleIcalDownload}
                aria-label="Export to iCal" title="Export to iCal"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </>}
        />

        {pendingCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm text-primary">
            <Bell className="h-4 w-4 shrink-0" />
            You have {pendingCount} pending invitation{pendingCount > 1 ? "s" : ""} this month.
          </div>
        )}

        <div className="flex gap-5">
          <div className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
            <div className="relative">
              <Button variant="ghost"
                aria-expanded={showCreateMenu} onClick={() => setShowCreateMenu(s => !s)}
                className="h-auto min-w-0 whitespace-normal flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Create
              </Button>
              {showCreateMenu && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  <Button variant="ghost"
                    onClick={() => openCreateFlow("EVENT")}
                    className="h-auto min-w-0 whitespace-normal block w-full px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Event
                  </Button>
                  {isAdmin && adminOrgConfigured && !createMenuIsSunday && (
                    <Button variant="ghost"
                      onClick={() => openCreateFlow("CLIENT_VISIT")}
                      className="h-auto min-w-0 whitespace-normal block w-full px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      New Client Visit
                    </Button>
                  )}
                  {isAdmin && adminOrgConfigured && !createMenuIsSunday && (
                    <Button variant="ghost"
                      onClick={() => openCreateFlow("VISIT")}
                      className="h-auto min-w-0 whitespace-normal block w-full px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Scheduled Partner Visit
                    </Button>
                  )}
                  {!isAdmin && adminOrgConfigured && !createMenuIsSunday && (
                    <Button variant="ghost"
                      onClick={() => openCreateFlow("REQUEST")}
                      className="h-auto min-w-0 whitespace-normal block w-full px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Request a visit
                    </Button>
                  )}
                  {isAdmin && adminOrgConfigured && !createMenuIsSunday && (
                    <Button variant="ghost"
                      onClick={() => openCreateFlow("BLOCK")}
                      className="h-auto min-w-0 whitespace-normal block w-full px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Out of Office
                    </Button>
                  )}
                  {createMenuIsSunday && (
                    <p className="px-4 py-2 text-[11px] text-muted-foreground">
                      Sundays only allow personal events.
                    </p>
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

            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Show</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                <Input
                  type="checkbox"
                  checked={allKindsSelected}
                  ref={el => { if (el) el.indeterminate = !allKindsSelected && kindFilters.size > 0; }}
                  onChange={toggleAllKindFilters}
                  className="size-4 shrink-0 p-0 rounded accent-info"
                />
                Select all
              </label>
              <div className="my-1 border-t border-border" />
              {visibleKindFilters.map(f => (
                <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Input type="checkbox" checked={kindFilters.has(f.key)} onChange={() => toggleKindFilter(f.key)} className="size-4 shrink-0 p-0 rounded accent-info" />
                  {!isAdmin && "clientLabel" in f ? f.clientLabel : f.label}
                </label>
              ))}
            </div>

            <CustomFilterForm
              filters={customFilters}
              activeFilterIds={activeCustomFilterIds}
              orgs={orgs}
              isAdmin={isAdmin}
              onToggle={toggleCustomFilter}
              onCreate={data => createFilterMutation.mutate(data)}
              onDelete={id => deleteFilterMutation.mutate(id)}
              creating={createFilterMutation.isPending}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={goToday} className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted">
                  Today
                </Button>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" aria-label="Previous period" onClick={goPrev} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted">
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" aria-label="Next period" onClick={goNext} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                <h2 className="ml-1 text-base font-bold text-foreground">{rangeLabel}</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative hidden md:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search calendar" placeholder="Search…"
                    className="w-48 rounded-xl border border-border py-1.5 pl-8 pr-3 text-sm transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-0.5 rounded-xl bg-muted p-1">
                  {VIEW_MODES.map(vm => (
                    <Button variant="ghost"
                      key={vm.key} aria-pressed={viewMode === vm.key}
                      onClick={() => handleViewMode(vm.key)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        viewMode === vm.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {vm.label}
                    </Button>
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
                  isAdmin={isAdmin} adminOrgConfigured={adminOrgConfigured} busyDates={busyDates}
                />
              )}
              {viewMode === "week" && (
                <CalendarWeekView
                  weekStart={weekStart} byDate={byDatePrimary} todayStr={todayStr} selectedDate={selectedDate}
                  isLoading={primaryLoading} onSelectDate={handleDayClick} onOpenItem={handleOpenItem}
                  onPrev={prevWeek} onNext={nextWeek}
                  isAdmin={isAdmin} adminOrgConfigured={adminOrgConfigured} busyDates={busyDates}
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
                  token={token} isAdmin={isAdmin} onChanged={invalidateAgenda}
                  onEditEvent={handleEditEvent}
                  onDeleteVisit={(id) => { setPopoverItem(null); setPendingRemoval({ kind: "visit", id }); }} onUnblock={(id) => { setPopoverItem(null); setPendingRemoval({ kind: "block", id }); }}
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
            isAdmin={isAdmin}
            adminOrgConfigured={adminOrgConfigured}
            onSwitchType={openCreateFlow}
            onClose={() => { setShowEventForm(false); setEditingEvent(null); setQuickCreateProspect(false); }}
            onSaved={() => { setShowEventForm(false); setEditingEvent(null); setQuickCreateProspect(false); invalidateAgenda(); }}
          />
        )}

        {showVisitForm && isAdmin && (
          <VisitFormModal
            orgs={orgs}
            token={token}
            defaultDate={createMenuDate}
            year={year}
            month={month}
            isAdmin={isAdmin}
            adminOrgConfigured={adminOrgConfigured}
            onSwitchType={openCreateFlow}
            onClose={() => setShowVisitForm(false)}
            onSaved={() => { setShowVisitForm(false); invalidateAgenda(); }}
          />
        )}

        {showRequestModal && !isAdmin && (
          <RequestModal
            token={token}
            defaultDate={createMenuDate}
            busyDates={busyDates}
            isAdmin={isAdmin}
            adminOrgConfigured={adminOrgConfigured}
            onSwitchType={openCreateFlow}
            onClose={() => setShowRequestModal(false)}
            onSaved={() => { setShowRequestModal(false); invalidateAgenda(); }}
          />
        )}

        {showBlockModal && isAdmin && (
          <BlockDayModal
            token={token}
            date={createMenuDate}
            currentEmployeeId={primaryData?.employeeId}
            isAdmin={isAdmin}
            adminOrgConfigured={adminOrgConfigured}
            onSwitchType={openCreateFlow}
            onClose={() => setShowBlockModal(false)}
            onSaved={() => { setShowBlockModal(false); invalidateAgenda(); }}
          />
        )}

        {dayPopoverDate && (
          <DayQuickPopover
            dateStr={dayPopoverDate}
            items={byDatePrimary[dayPopoverDate] ?? []}
            isLoading={primaryLoading}
            onClose={() => setDayPopoverDate(null)}
            onOpenItem={handleOpenItem}
            onCreate={() => openCreateFlow("EVENT")}
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
            onDeleteVisit={(id) => { setPopoverItem(null); setPendingRemoval({ kind: "visit", id }); }}
            onUnblock={(id) => { setPopoverItem(null); setPendingRemoval({ kind: "block", id }); }}
          />
        )}

        <ConfirmDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => { if (!open) setPendingRemoval(null); }}
          title={pendingRemoval?.kind === "visit" ? "Delete visit" : "Remove out-of-office block"}
          description={pendingRemoval?.kind === "visit"
            ? "Remove this visit from the calendar?"
            : "Make this time available again?"}
          confirmLabel={pendingRemoval?.kind === "visit" ? "Delete visit" : "Remove block"}
          destructive={pendingRemoval?.kind === "visit"}
          onConfirm={async () => {
            if (!pendingRemoval) return;
            const mutation = pendingRemoval.kind === "visit" ? deleteVisitMutation : unblockMutation;
            await mutation.mutateAsync(pendingRemoval.id);
          }}
        />

        {showAnalytics && (
          <ModalWrap aria-label="Analytics" title="Analytics" onClose={() => setShowAnalytics(false)}>
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
