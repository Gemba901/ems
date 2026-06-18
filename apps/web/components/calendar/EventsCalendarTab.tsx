"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  CalendarService,
  HolisticCalendarEvent, OrgEmployeeForInvite,
  CalendarEventType, EventRecurrencePattern, EVENT_TYPE_CONFIG,
  CreateCalendarEventPayload,
} from "@/services/calendar.service";
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Check, CheckCircle2,
  RefreshCw, Users, AlertTriangle, Calendar, LayoutGrid, CalendarDays, List,
} from "lucide-react";

// ── Date helpers ───────────────────────────────────────────────────────────────

const DAYS        = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }
function getFirstDayOfWeek(year: number, month: number) { return new Date(year, month - 1, 1).getDay(); }
function toYMD(y: number, m: number, d: number) { return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function todayYMD() { const d = new Date(); return toYMD(d.getFullYear(), d.getMonth()+1, d.getDate()); }
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}
function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function dateToYMD(date: Date): string {
  return toYMD(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarTabType = "personal" | "company" | "training";
type ViewMode = "month" | "week" | "agenda";

// ── Tab-aware type options ─────────────────────────────────────────────────────

function getTypeOptions(tab: CalendarTabType, isOrgManager: boolean, isAuditor: boolean) {
  const personal: { value: CalendarEventType; label: string }[] = [
    { value: "PERSONAL_EVENT",    label: "Personal Event" },
    { value: "PERSONAL_REMINDER", label: "Reminder" },
    { value: "BIRTHDAY",          label: "Birthday Reminder" },
    { value: "PERSONAL_TRAINING", label: "Personal Training" },
    { value: "MEETING",           label: "Meeting (invite others)" },
  ];
  if (tab === "personal") return personal;
  if (tab === "company" && isOrgManager) return [
    { value: "COMPANY_EVENT"    as CalendarEventType, label: "Company Event" },
    { value: "COMPANY_HOLIDAY"  as CalendarEventType, label: "Public Holiday" },
    { value: "COMPANY_TRAINING" as CalendarEventType, label: "Company Training" },
    ...(isAuditor ? [{ value: "AUDIT" as CalendarEventType, label: "Audit" }] : []),
  ];
  if (tab === "training" && isOrgManager) return [
    { value: "TRAINING_SESSION" as CalendarEventType, label: "Training Session" },
    { value: "COMPANY_TRAINING" as CalendarEventType, label: "Company Training" },
  ];
  return [];
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EventsCalendarTab({ tab }: { tab: CalendarTabType }) {
  const { accessToken, user } = useAuthStore();
  const isOrgManager = ["MANAGEMENT","ADMIN","HR","SUPER_ADMIN"].includes(user?.roleLevel ?? "");
  const isAuditor    = ["ADMIN","MANAGEMENT","SUPER_ADMIN"].includes(user?.roleLevel ?? "");
  const queryClient  = useQueryClient();

  const now = new Date();
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [selectedDay,setSelectedDay]= useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode,   setViewMode]   = useState<ViewMode>("month");
  const [weekStart,  setWeekStart]  = useState<Date>(() => getWeekStart(now));

  const { data, isLoading } = useQuery({
    queryKey: ["calendar-events", year, month],
    queryFn: () => CalendarService.getEvents(year, month, accessToken!),
    enabled: !!accessToken,
  });

  const todayStr = todayYMD();

  const tabEvents: HolisticCalendarEvent[] = useMemo(() => {
    if (!data) return [];
    if (tab === "personal") return data.personal;
    if (tab === "company")  return data.company;
    return data.training;
  }, [data, tab]);

  const byDate = useMemo(() => {
    const map: Record<string, HolisticCalendarEvent[]> = {};
    for (const e of tabEvents) {
      const key = e.startAt.split("T")[0];
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [tabEvents]);

  const selectedEvents = selectedDay ? (byDate[selectedDay] ?? []) : [];

  // Month grid state
  const daysInMonth    = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Week navigation — syncs month/year so the API fetches the right data
  const prevWeek = () => {
    const nw = addDays(weekStart, -7);
    setWeekStart(nw);
    setSelectedDay(null);
    const nm = nw.getMonth() + 1;
    const ny = nw.getFullYear();
    if (nm !== month || ny !== year) { setMonth(nm); setYear(ny); }
  };
  const nextWeek = () => {
    const nw = addDays(weekStart, 7);
    setWeekStart(nw);
    setSelectedDay(null);
    const nm = nw.getMonth() + 1;
    const ny = nw.getFullYear();
    if (nm !== month || ny !== year) { setMonth(nm); setYear(ny); }
  };

  // When switching to week view, snap weekStart into the current month if it's out of range
  const handleViewMode = (vm: ViewMode) => {
    if (vm === "week" && (weekStart.getMonth() + 1 !== month || weekStart.getFullYear() !== year)) {
      setWeekStart(getWeekStart(new Date(year, month - 1, 1)));
    }
    setViewMode(vm);
    setSelectedDay(null);
  };

  const typeOptions = getTypeOptions(tab, isOrgManager, isAuditor);
  const canCreate   = typeOptions.length > 0;
  const pendingCount = data?.pendingInvitationsCount ?? 0;

  const rightPanel = (
    <div className="xl:col-span-1">
      {selectedDay ? (
        <DayPanel
          dateStr={selectedDay}
          events={selectedEvents}
          todayStr={todayStr}
          token={accessToken!}
          onClose={() => setSelectedDay(null)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["calendar-events", year, month] })}
          canCreate={canCreate}
          onCreateClick={() => setShowCreate(true)}
        />
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 text-center text-slate-400 text-sm">
          <p className="text-slate-300 text-4xl mb-3">
            {tab === "personal" ? "📅" : tab === "company" ? "🏢" : "📚"}
          </p>
          <p className="font-medium text-slate-500">Select a day</p>
          <p className="text-xs mt-1">Click any date to view events</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Pending invitations banner (personal tab only) */}
      {tab === "personal" && pendingCount > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-violet-500 shrink-0" />
          <p className="text-sm text-violet-700 font-medium flex-1">
            You have <span className="font-bold">{pendingCount}</span> pending meeting invitation{pendingCount > 1 ? "s" : ""}.
            Click a day to find them.
          </p>
        </div>
      )}

      {/* View toggle + New event */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
          {(["month","week","agenda"] as const).map(vm => {
            const Icon = vm === "month" ? LayoutGrid : vm === "week" ? CalendarDays : List;
            return (
              <button
                key={vm}
                onClick={() => handleViewMode(vm)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  viewMode === vm ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {vm.charAt(0).toUpperCase() + vm.slice(1)}
              </button>
            );
          })}
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Event
          </button>
        )}
      </div>

      {/* ── Month view ── */}
      {viewMode === "month" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              </button>
              <h2 className="text-base font-bold text-slate-800">{MONTHS[month-1]} {year}</h2>
              <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-100">
              {DAYS.map(d => (
                <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">{d}</div>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-slate-50" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i+1).map(day => {
                  const dateStr  = toYMD(year, month, day);
                  const dayEvts  = byDate[dateStr] ?? [];
                  const isToday  = dateStr === todayStr;
                  const isSel    = dateStr === selectedDay;
                  const colIdx   = (firstDayOfWeek + day - 1) % 7;
                  const isLast   = colIdx === 6;
                  const hasPending = dayEvts.some(e => e.myInvitationStatus === "PENDING");

                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(isSel ? null : dateStr)}
                      className={`min-h-20 p-2 border-b border-r border-slate-50 cursor-pointer transition-all ${isLast ? "border-r-0" : ""} ${isSel ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    >
                      <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 relative ${
                        isToday ? "bg-blue-600 text-white"
                        : isSel  ? "bg-blue-100 text-blue-700"
                        : "text-slate-600"
                      }`}>
                        {day}
                        {hasPending && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-violet-500 rounded-full" />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {dayEvts.slice(0, 4).map(e => {
                          const cfg = EVENT_TYPE_CONFIG[e.type];
                          return <span key={e.id} className={`h-2 w-2 rounded-full ${cfg?.dot ?? "bg-slate-400"}`} title={e.title} />;
                        })}
                        {dayEvts.length > 4 && <span className="text-[8px] text-slate-400">+{dayEvts.length-4}</span>}
                      </div>
                      {dayEvts.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {dayEvts.slice(0,2).map(e => (
                            <p key={e.id} className="text-[8px] text-slate-500 truncate leading-tight">{e.title}</p>
                          ))}
                          {dayEvts.length > 2 && <p className="text-[8px] text-slate-400">+{dayEvts.length-2} more</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {rightPanel}
        </div>
      )}

      {/* ── Week view ── */}
      {viewMode === "week" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2">
            <EventsWeekView
              weekStart={weekStart}
              byDate={byDate}
              todayStr={todayStr}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              prevWeek={prevWeek}
              nextWeek={nextWeek}
              isLoading={isLoading}
            />
          </div>
          {rightPanel}
        </div>
      )}

      {/* ── Agenda view ── */}
      {viewMode === "agenda" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2">
            <EventsAgendaView
              year={year}
              month={month}
              byDate={byDate}
              todayStr={todayStr}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              isLoading={isLoading}
              prevMonth={prevMonth}
              nextMonth={nextMonth}
            />
          </div>
          {rightPanel}
        </div>
      )}

      {/* Create event modal */}
      {showCreate && (
        <CreateEventModal
          tab={tab}
          typeOptions={typeOptions}
          defaultDate={selectedDay ?? undefined}
          token={accessToken!}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ["calendar-events", year, month] });
          }}
        />
      )}
    </div>
  );
}

// ── Week view component ────────────────────────────────────────────────────────

function EventsWeekView({
  weekStart, byDate, todayStr, selectedDay, onSelectDay, prevWeek, nextWeek, isLoading,
}: {
  weekStart: Date;
  byDate: Record<string, HolisticCalendarEvent[]>;
  todayStr: string;
  selectedDay: string | null;
  onSelectDay: (d: string | null) => void;
  prevWeek: () => void;
  nextWeek: () => void;
  isLoading: boolean;
}) {
  const days    = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()}–${weekEnd.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()} ${MONTH_SHORT[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

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

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {days.map(day => {
            const key        = dateToYMD(day);
            const isToday    = key === todayStr;
            const isSel      = key === selectedDay;
            const dayEvts    = byDate[key] ?? [];
            const hasPending = dayEvts.some(e => e.myInvitationStatus === "PENDING");

            return (
              <div
                key={key}
                onClick={() => onSelectDay(isSel ? null : key)}
                className={`min-h-35 p-2 border-r border-slate-100 last:border-r-0 cursor-pointer transition-all ${
                  isSel ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex flex-col items-center mb-2">
                  <p className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? "text-blue-500" : "text-slate-400"}`}>
                    {day.toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                  <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-bold relative ${
                    isToday ? "bg-blue-600 text-white" : isSel ? "bg-blue-100 text-blue-700" : "text-slate-700"
                  }`}>
                    {day.getDate()}
                    {hasPending && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-violet-500 rounded-full" />
                    )}
                  </div>
                </div>
                <div className="space-y-0.5">
                  {dayEvts.slice(0, 4).map(e => {
                    const cfg = EVENT_TYPE_CONFIG[e.type];
                    return (
                      <div
                        key={e.id}
                        className={`text-[8px] font-semibold px-1 py-0.5 rounded truncate ${cfg?.badge ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {e.title}
                      </div>
                    );
                  })}
                  {dayEvts.length > 4 && (
                    <p className="text-[8px] text-slate-400 text-center">+{dayEvts.length - 4} more</p>
                  )}
                  {dayEvts.length === 0 && (
                    <p className="text-[8px] text-slate-200 text-center mt-2">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Agenda view component ──────────────────────────────────────────────────────

function EventsAgendaView({
  year, month, byDate, todayStr, selectedDay, onSelectDay, isLoading, prevMonth, nextMonth,
}: {
  year: number;
  month: number;
  byDate: Record<string, HolisticCalendarEvent[]>;
  todayStr: string;
  selectedDay: string | null;
  onSelectDay: (d: string | null) => void;
  isLoading: boolean;
  prevMonth: () => void;
  nextMonth: () => void;
}) {
  const daysWithEvents = Object.keys(byDate).sort();

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Month navigation header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-500" />
        </button>
        <h2 className="text-base font-bold text-slate-800">{MONTHS[month-1]} {year}</h2>
        <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : daysWithEvents.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Calendar className="h-10 w-10 mx-auto text-slate-200 mb-3" />
          <p className="font-medium text-slate-500">No events this month</p>
          <p className="text-xs mt-1">Switch months or create a new event</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50 max-h-[calc(100vh-18rem)] overflow-y-auto">
          {daysWithEvents.map(dateStr => {
            const dayEvts = byDate[dateStr] ?? [];
            const date    = new Date(dateStr + "T00:00:00");
            const isToday = dateStr === todayStr;
            const isSel   = dateStr === selectedDay;

            return (
              <div
                key={dateStr}
                onClick={() => onSelectDay(isSel ? null : dateStr)}
                className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors ${
                  isSel ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                {/* Date stamp */}
                <div className={`text-center shrink-0 w-10 pt-0.5 ${isToday ? "text-blue-600" : "text-slate-500"}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wide leading-none mb-0.5">
                    {date.toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                  <p className={`text-xl font-bold leading-none ${isToday ? "text-blue-600" : "text-slate-800"}`}>
                    {date.getDate()}
                  </p>
                  {isToday && <p className="text-[8px] font-bold text-blue-500 mt-0.5">Today</p>}
                </div>

                {/* Event chips */}
                <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                  {dayEvts.map(e => {
                    const cfg = EVENT_TYPE_CONFIG[e.type];
                    const isPending = e.myInvitationStatus === "PENDING";
                    return (
                      <div key={e.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${cfg?.border ?? "border-slate-100"} bg-white`}>
                        <span className={`h-2 w-2 rounded-full shrink-0 ${cfg?.dot ?? "bg-slate-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{e.title}</p>
                          {!e.allDay && (
                            <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                              {new Date(e.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                              {" – "}
                              {new Date(e.endAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${cfg?.badge ?? "bg-slate-100 text-slate-500"}`}>
                          {cfg?.label ?? e.type}
                        </span>
                        {isPending && (
                          <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" title="Pending invitation" />
                        )}
                      </div>
                    );
                  })}
                </div>

                <ChevronRight className={`h-3.5 w-3.5 shrink-0 mt-2 transition-transform ${isSel ? "rotate-90 text-blue-500" : "text-slate-300"}`} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Day panel ─────────────────────────────────────────────────────────────────

function DayPanel({
  dateStr, events, todayStr, token, onClose, onRefresh, canCreate, onCreateClick,
}: {
  dateStr: string; events: HolisticCalendarEvent[]; todayStr: string; token: string;
  onClose: () => void; onRefresh: () => void;
  canCreate: boolean; onCreateClick: () => void;
}) {
  const displayDate = new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden sticky top-6">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">{displayDate}</p>
          {dateStr === todayStr && <span className="text-[10px] font-bold text-blue-600">Today</span>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>

      <div className="p-4 space-y-3 max-h-[calc(100vh-14rem)] overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400">No events on this day</p>
            {canCreate && (
              <button onClick={onCreateClick} className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mx-auto">
                <Plus className="h-3.5 w-3.5" /> Add event
              </button>
            )}
          </div>
        ) : (
          events.map(e => (
            <EventCard key={e.id} event={e} token={token} onRespond={onRefresh} />
          ))
        )}

        {canCreate && events.length > 0 && (
          <button
            onClick={onCreateClick}
            className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors py-2 border border-dashed border-slate-200 rounded-xl"
          >
            <Plus className="h-3 w-3" /> Add event on this day
          </button>
        )}
      </div>
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event, token, onRespond }: { event: HolisticCalendarEvent; token: string; onRespond: () => void }) {
  const cfg = EVENT_TYPE_CONFIG[event.type];
  const [responding, setResponding] = useState(false);

  const respond = async (status: "ACCEPTED" | "DECLINED") => {
    setResponding(true);
    try { await CalendarService.respondToInvitation(event.id, status, token); onRespond(); }
    catch { /* error handled by showing stale state */ }
    finally { setResponding(false); }
  };

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${cfg.border} bg-white`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-tight">{event.title}</p>
          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        {event.isOwner && (
          <span className="text-[9px] text-slate-400 shrink-0 mt-0.5">Owner</span>
        )}
      </div>

      {event.description && (
        <p className="text-xs text-slate-500 leading-relaxed pl-4">{event.description}</p>
      )}

      {!event.allDay && (
        <p className="text-xs text-slate-400 pl-4">
          {fmtDateTime(event.startAt)} – {new Date(event.endAt).toLocaleString("en-GB", { hour:"2-digit", minute:"2-digit" })}
        </p>
      )}

      {event.isRecurring && event.recurrencePattern && (
        <p className="text-[10px] text-violet-500 font-medium flex items-center gap-1 pl-4">
          <RefreshCw className="h-2.5 w-2.5" />
          {(() => {
            const n = event.recurrenceInterval ?? 1;
            const unit = event.recurrencePattern === "DAILY"
              ? (n === 1 ? "day" : "days")
              : event.recurrencePattern === "WEEKLY"
              ? (n === 1 ? "week" : "weeks")
              : (n === 1 ? "month" : "months");
            return n === 1 ? `Repeats every ${unit}` : `Repeats every ${n} ${unit}`;
          })()}
        </p>
      )}

      {event.createdBy && !event.isOwner && (
        <p className="text-xs text-slate-400 pl-4">From: {event.createdBy.name}</p>
      )}

      {event.invitations.length > 0 && (
        <div className="pl-4 pt-1 space-y-1">
          <p className="text-[10px] font-bold text-slate-400">INVITEES</p>
          <div className="flex flex-wrap gap-1">
            {event.invitations.map(inv => (
              <span key={inv.id} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                inv.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-700"
                : inv.status === "DECLINED" ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-500"
              }`}>
                {inv.invitee.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.participants.length > 0 && (
        <div className="pl-4 pt-1 space-y-1">
          <p className="text-[10px] font-bold text-slate-400">PARTICIPANTS</p>
          <div className="flex flex-wrap gap-1">
            {event.participants.map(p => (
              <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.type === "MEETING" && event.myInvitationStatus === "PENDING" && (
        <div className="pl-4 pt-2 border-t border-slate-100 flex gap-2">
          <button
            onClick={() => respond("ACCEPTED")}
            disabled={responding}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {responding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Accept
          </button>
          <button
            onClick={() => respond("DECLINED")}
            disabled={responding}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {responding ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            Decline
          </button>
        </div>
      )}

      {event.type === "MEETING" && event.myInvitationStatus === "ACCEPTED" && (
        <p className="pl-4 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> You accepted this meeting
        </p>
      )}
      {event.type === "MEETING" && event.myInvitationStatus === "DECLINED" && (
        <p className="pl-4 text-[11px] text-red-500 font-semibold flex items-center gap-1">
          <X className="h-3 w-3" /> You declined this meeting
        </p>
      )}
    </div>
  );
}

// ── Create Event Modal ────────────────────────────────────────────────────────

function CreateEventModal({
  tab, typeOptions, defaultDate, token, onClose, onSaved,
}: {
  tab: CalendarTabType;
  typeOptions: { value: CalendarEventType; label: string }[];
  defaultDate?: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const defaultStart = defaultDate
    ? `${defaultDate}T09:00`
    : `${toYMD(now.getFullYear(), now.getMonth()+1, now.getDate())}T09:00`;
  const defaultEnd   = defaultDate
    ? `${defaultDate}T10:00`
    : `${toYMD(now.getFullYear(), now.getMonth()+1, now.getDate())}T10:00`;

  const [type,          setType]         = useState<CalendarEventType>(typeOptions[0]?.value ?? "PERSONAL_EVENT");
  const [title,         setTitle]        = useState("");
  const [description,   setDescription]  = useState("");
  const [startAt,       setStartAt]      = useState(defaultStart);
  const [endAt,         setEndAt]        = useState(defaultEnd);
  const [allDay,        setAllDay]       = useState(false);
  const [isRecurring,   setIsRecurring]  = useState(false);
  const [recPattern,    setRecPattern]   = useState<EventRecurrencePattern>("WEEKLY");
  const [recInterval,   setRecInterval]  = useState(1);
  const [recEndAt,      setRecEndAt]     = useState("");
  const [inviteeIds,    setInviteeIds]   = useState<string[]>([]);
  const [participantIds,setParticipantIds] = useState<string[]>([]);
  const [onLeaveNames,  setOnLeaveNames] = useState<string[]>([]);
  const [saving,        setSaving]       = useState(false);
  const [error,         setError]        = useState<string | null>(null);

  const isMeeting         = type === "MEETING";
  const needsParticipants = ["TRAINING_SESSION","COMPANY_TRAINING","AUDIT"].includes(type);

  const { data: orgEmployees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["calendar-org-employees-invite"],
    queryFn: () => CalendarService.getOrgEmployeesForInvite(token),
    enabled: isMeeting || needsParticipants,
  });

  const checkLeaveForInvitee = async (employeeId: string) => {
    if (!startAt || !endAt) return;
    try {
      const result = await CalendarService.checkAvailability(employeeId, new Date(startAt).toISOString(), new Date(endAt).toISOString(), token);
      if (!result.available) {
        const emp = orgEmployees.find(e => e.id === employeeId);
        const name = emp ? `${emp.firstName} ${emp.lastName}` : "Someone";
        setOnLeaveNames(prev => prev.includes(name) ? prev : [...prev, name]);
      }
    } catch { /* silently ignore leave check errors */ }
  };

  const toggleInvitee = async (id: string) => {
    if (inviteeIds.includes(id)) {
      setInviteeIds(prev => prev.filter(i => i !== id));
    } else {
      setInviteeIds(prev => [...prev, id]);
      await checkLeaveForInvitee(id);
    }
  };

  const toggleParticipant = (id: string) => {
    setParticipantIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!startAt || !endAt) { setError("Start and end time are required."); return; }
    if (new Date(endAt) <= new Date(startAt)) { setError("End must be after start."); return; }
    if (isRecurring && !recEndAt) { setError("Repeat end date is required for recurring events."); return; }

    setSaving(true); setError(null);
    try {
      const payload: CreateCalendarEventPayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        startAt: new Date(startAt).toISOString(),
        endAt:   new Date(endAt).toISOString(),
        allDay,
        isRecurring,
        recurrencePattern:  isRecurring ? recPattern : undefined,
        recurrenceInterval: isRecurring ? recInterval : undefined,
        recurrenceEndAt:    isRecurring && recEndAt ? new Date(recEndAt + "T23:59").toISOString() : undefined,
        inviteeIds:         isMeeting ? inviteeIds : undefined,
        participantIds:     needsParticipants ? participantIds : undefined,
      };
      const result = await CalendarService.createEvent(payload, token);
      if (result.onLeaveWarnings.length > 0) {
        const names = result.onLeaveWarnings.map(w => w.name).join(", ");
        if (!confirm(`${names} ${result.onLeaveWarnings.length === 1 ? "is" : "are"} on approved leave during this time. Create the meeting anyway?`)) {
          setSaving(false); return;
        }
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally { setSaving(false); }
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-900">New Event</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Event Type</label>
            <select className={`${inputCls} bg-white`} value={type} onChange={e => setType(e.target.value as CalendarEventType)}>
              {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Title</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title…" />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea rows={2} className={`${inputCls} resize-none`} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setAllDay(a => !a)}
              className={`w-9 h-5 rounded-full transition-colors relative ${allDay ? "bg-blue-600" : "bg-slate-200"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${allDay ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-slate-600">All day</span>
          </label>

          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Start</label>
                <input type="datetime-local" className={inputCls} value={startAt} onChange={e => setStartAt(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">End</label>
                <input type="datetime-local" className={inputCls} value={endAt} min={startAt} onChange={e => setEndAt(e.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Date</label>
              <input type="date" className={inputCls} value={startAt.split("T")[0]} onChange={e => { setStartAt(e.target.value+"T00:00"); setEndAt(e.target.value+"T23:59"); }} />
            </div>
          )}

          {!["COMPANY_HOLIDAY","BIRTHDAY"].includes(type) && (
            <div className="border border-slate-100 rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setIsRecurring(r => !r)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${isRecurring ? "bg-violet-600" : "bg-slate-200"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isRecurring ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><RefreshCw className="h-3 w-3 text-violet-400" /> Repeat</span>
              </label>
              {isRecurring && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Repeat every</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        className="w-16 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        value={recInterval}
                        onChange={e => setRecInterval(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                      />
                      <select
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        value={recPattern}
                        onChange={e => setRecPattern(e.target.value as EventRecurrencePattern)}
                      >
                        <option value="DAILY">{recInterval === 1 ? "day" : "days"}</option>
                        <option value="WEEKLY">{recInterval === 1 ? "week" : "weeks"}</option>
                        <option value="MONTHLY">{recInterval === 1 ? "month" : "months"}</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Repeats every {recInterval} {recPattern === "DAILY" ? (recInterval === 1 ? "day" : "days") : recPattern === "WEEKLY" ? (recInterval === 1 ? "week" : "weeks") : (recInterval === 1 ? "month" : "months")}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Repeat until</label>
                    <input type="date" className={inputCls} value={recEndAt} min={startAt.split("T")[0]} onChange={e => setRecEndAt(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {isMeeting && (
            <PeoplePicker
              label="Invite People"
              employees={orgEmployees}
              loading={loadingEmployees}
              selected={inviteeIds}
              onToggle={toggleInvitee}
              onLeaveNames={onLeaveNames}
            />
          )}

          {needsParticipants && (
            <PeoplePicker
              label="Participants"
              employees={orgEmployees}
              loading={loadingEmployees}
              selected={participantIds}
              onToggle={toggleParticipant}
              onLeaveNames={[]}
            />
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Saving…" : "Create Event"}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── People picker ─────────────────────────────────────────────────────────────

function PeoplePicker({
  label, employees, loading, selected, onToggle, onLeaveNames,
}: {
  label: string;
  employees: OrgEmployeeForInvite[];
  loading: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onLeaveNames: string[];
}) {
  const [search, setSearch] = useState("");
  const filtered = employees.filter(e =>
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="border border-slate-100 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-indigo-400" />
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {selected.length > 0 && <span className="ml-auto text-xs text-slate-400">{selected.length} selected</span>}
      </div>

      {onLeaveNames.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">{onLeaveNames.join(", ")}</span> {onLeaveNames.length === 1 ? "is" : "are"} on approved leave during this time.
          </p>
        </div>
      )}

      <input
        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
        placeholder="Search by name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
      ) : (
        <div className="max-h-36 overflow-y-auto space-y-1">
          {filtered.map(emp => {
            const isSelected = selected.includes(emp.id);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => onToggle(emp.id)}
                className={`flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  isSelected ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                  isSelected ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  {isSelected ? <Check className="h-3 w-3" /> : emp.firstName.charAt(0)}
                </div>
                <span className="flex-1 text-left font-medium">{emp.firstName} {emp.lastName}</span>
                {emp.department && <span className="text-slate-400 text-[10px]">{emp.department.name}</span>}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No employees found</p>}
        </div>
      )}
    </div>
  );
}
