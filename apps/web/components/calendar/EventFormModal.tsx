"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarService, HolisticCalendarEvent, EventRecurrencePattern, EventColor, EventVisibility,
  EVENT_COLORS, EVENT_COLOR_CONFIG, CreateCalendarEventPayload, UpdateCalendarEventPayload,
  OrgEmployeeForInvite,
} from "@/services/calendar.service";
import {
  X, Loader2, CheckCircle2, RefreshCw, Users, AlertTriangle, Check, Globe2, Lock,
} from "lucide-react";
import { CreateTypeTabs, CreateFlowType } from "./CreateTypeTabs";
import { isSundayDate } from "./calendarUtils";

function toYMD(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventFormModal({
  token, defaultDate, editing, isOrgManager, quickCreateProspect, isAdmin, adminOrgConfigured, onSwitchType, onClose, onSaved,
}: {
  token: string;
  defaultDate?: string;
  editing: HolisticCalendarEvent | null;
  isOrgManager: boolean;
  quickCreateProspect?: boolean;
  isAdmin: boolean;
  adminOrgConfigured: boolean;
  onSwitchType: (type: CreateFlowType) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const baseDate = defaultDate ?? toYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const showProspectField = quickCreateProspect || !!editing?.prospectOrgName;

  const [title, setTitle] = useState(editing?.title ?? (quickCreateProspect ? "Initial Meeting" : ""));
  const [prospectOrgName, setProspectOrgName] = useState(editing?.prospectOrgName ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [color, setColor] = useState<EventColor>(editing?.color ?? "PEACOCK");
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [startAt, setStartAt] = useState(editing ? toLocalDatetimeInput(editing.startAt) : `${baseDate}T09:00`);
  const [endAt, setEndAt] = useState(editing ? toLocalDatetimeInput(editing.endAt) : `${baseDate}T10:00`);

  const [recPreset, setRecPreset] = useState<"none" | "daily" | "weekly" | "monthly" | "yearly" | "custom">("none");
  const [recPattern, setRecPattern] = useState<EventRecurrencePattern>("WEEKLY");
  const [recInterval, setRecInterval] = useState(1);
  const [recEnds, setRecEnds] = useState<"never" | "on">("never");
  const [recEndAt, setRecEndAt] = useState("");
  const isNewRecurring = recPreset !== "none";

  const initialInviteeIds = (editing?.invitations ?? []).map(i => i.invitee.id);
  const [inviteeIds, setInviteeIds] = useState<string[]>(initialInviteeIds);
  const [whoCanSee, setWhoCanSee] = useState<"ORG_WIDE" | "JUST_YOU" | "SELECTED">(
    editing?.visibility === "ORG_WIDE" ? "ORG_WIDE" : initialInviteeIds.length > 0 ? "SELECTED" : "JUST_YOU"
  );
  const selectWhoCanSee = (mode: "ORG_WIDE" | "JUST_YOU" | "SELECTED") => {
    setWhoCanSee(mode);
    if (mode === "JUST_YOU") setInviteeIds([]);
  };
  const [onLeaveNames, setOnLeaveNames] = useState<string[]>([]);
  const [updateScope, setUpdateScope] = useState<"THIS_ONLY" | "ALL_IN_SERIES">("THIS_ONLY");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: orgEmployees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["calendar-org-employees-invite"],
    queryFn: () => CalendarService.getOrgEmployeesForInvite(token),
  });

  const checkLeaveForInvitee = async (employeeId: string) => {
    if (!startAt || !endAt) return;
    try {
      const result = await CalendarService.checkAvailability(employeeId, new Date(startAt).toISOString(), new Date(endAt).toISOString(), token);
      if (!result.available) {
        const emp = orgEmployees.find(e => e.id === employeeId);
        const name = emp ? `${emp.firstName} ${emp.lastName}` : "Someone";
        setOnLeaveNames(prev => (prev.includes(name) ? prev : [...prev, name]));
      }
    } catch {
      // ignore availability-check failures — invitee is still added
    }
  };

  const toggleInvitee = async (id: string) => {
    if (inviteeIds.includes(id)) {
      setInviteeIds(prev => prev.filter(i => i !== id));
    } else {
      setInviteeIds(prev => [...prev, id]);
      await checkLeaveForInvitee(id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (quickCreateProspect && !prospectOrgName.trim()) { setError("Prospect / company name is required."); return; }
    if (!startAt || !endAt) { setError("Start and end time are required."); return; }
    if (new Date(endAt) <= new Date(startAt)) { setError("End must be after start."); return; }
    if (!editing && isNewRecurring && recEnds === "on" && !recEndAt) { setError("End date is required when 'On date' is selected."); return; }
    if (whoCanSee === "SELECTED" && inviteeIds.length === 0) { setError("Select at least one person who can see this event."); return; }
    if (showProspectField && isSundayDate(startAt.split("T")[0])) { setError("Client visits cannot be scheduled on Sundays."); return; }

    const visibility: EventVisibility = whoCanSee === "ORG_WIDE" ? "ORG_WIDE" : "PRIVATE";

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const added = inviteeIds.filter(id => !initialInviteeIds.includes(id));
        const removed = initialInviteeIds.filter(id => !inviteeIds.includes(id));
        const payload: UpdateCalendarEventPayload = {
          title: title.trim(),
          description: description.trim() || undefined,
          label: label.trim() || undefined,
          color,
          visibility,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          allDay,
          addInviteeIds: added.length ? added : undefined,
          removeInviteeIds: removed.length ? removed : undefined,
          updateMode: editing.isRecurring ? updateScope : undefined,
          prospectOrgName: showProspectField ? (prospectOrgName.trim() || undefined) : undefined,
        };
        await CalendarService.updateEvent(editing.id, payload, token);
      } else {
        const payload: CreateCalendarEventPayload = {
          title: title.trim(),
          description: description.trim() || undefined,
          label: label.trim() || undefined,
          color,
          visibility,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          allDay,
          isRecurring: isNewRecurring,
          recurrencePattern: isNewRecurring
            ? recPreset === "daily" ? "DAILY" : recPreset === "weekly" ? "WEEKLY" : recPreset === "monthly" ? "MONTHLY" : recPreset === "yearly" ? "YEARLY" : recPattern
            : undefined,
          recurrenceInterval: isNewRecurring ? (recPreset === "custom" ? recInterval : 1) : undefined,
          recurrenceEndAt: isNewRecurring && recEnds === "on" && recEndAt ? new Date(`${recEndAt}T23:59`).toISOString() : undefined,
          inviteeIds,
          prospectOrgName: quickCreateProspect ? prospectOrgName.trim() : undefined,
        };
        const result = await CalendarService.createEvent(payload, token);
        if (result.onLeaveWarnings.length > 0) {
          const names = result.onLeaveWarnings.map(w => w.name).join(", ");
          if (!confirm(`${names} ${result.onLeaveWarnings.length === 1 ? "is" : "are"} on approved leave during this time. Create the event anyway?`)) {
            setSaving(false);
            return;
          }
        }
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 fade-in">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">
            {quickCreateProspect ? "New Client Visit" : editing ? "Edit Event" : "New Event"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Title</label>
            <input autoFocus className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title…" />
          </div>

          {!editing && (
            <CreateTypeTabs
              active={quickCreateProspect ? "CLIENT_VISIT" : "EVENT"}
              isAdmin={isAdmin}
              adminOrgConfigured={adminOrgConfigured}
              dateStr={quickCreateProspect ? startAt.split("T")[0] : undefined}
              onSelect={onSwitchType}
            />
          )}

          {showProspectField && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Prospect / company name</label>
              <input
                className={inputCls}
                value={prospectOrgName}
                onChange={e => setProspectOrgName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={120}
              />
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-500">Color</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={EVENT_COLOR_CONFIG[c].label}
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform ${EVENT_COLOR_CONFIG[c].dot} ${
                    color === c ? "scale-105 ring-2 ring-slate-400 ring-offset-2" : "hover:scale-105"
                  }`}
                >
                  {color === c && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Label <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Training, Reminder, Birthday…" maxLength={40} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Description <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea rows={2} className={`${inputCls} resize-none`} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2">
            <div onClick={() => setAllDay(a => !a)} className={`relative h-5 w-9 rounded-full transition-colors ${allDay ? "bg-blue-600" : "bg-slate-200"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${allDay ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-slate-600">All day</span>
          </label>

          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Start</label>
                <input type="datetime-local" className={inputCls} value={startAt} onChange={e => setStartAt(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">End</label>
                <input type="datetime-local" className={inputCls} value={endAt} min={startAt} onChange={e => setEndAt(e.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Date</label>
              <input
                type="date"
                className={inputCls}
                value={startAt.split("T")[0]}
                onChange={e => { setStartAt(`${e.target.value}T00:00`); setEndAt(`${e.target.value}T23:59`); }}
              />
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-slate-100 p-3">
            <p className="text-xs font-semibold text-slate-500">Who can see</p>
            {isOrgManager && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="radio"
                  name="whoCanSee"
                  checked={whoCanSee === "ORG_WIDE"}
                  onChange={() => selectWhoCanSee("ORG_WIDE")}
                  className="accent-blue-600"
                />
                <Globe2 className="h-4 w-4 text-blue-500" />
                Whole organization
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="radio"
                name="whoCanSee"
                checked={whoCanSee === "JUST_YOU"}
                onChange={() => selectWhoCanSee("JUST_YOU")}
                className="accent-blue-600"
              />
              <Lock className="h-4 w-4 text-slate-400" />
              Just you
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="radio"
                name="whoCanSee"
                checked={whoCanSee === "SELECTED"}
                onChange={() => selectWhoCanSee("SELECTED")}
                className="accent-blue-600"
              />
              <Users className="h-4 w-4 text-indigo-400" />
              Select who can see
            </label>
          </div>

          {!editing && (
            <div className="space-y-3 rounded-xl border border-slate-100 p-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                <label className="text-xs font-semibold text-slate-500">Recurrence</label>
              </div>
              <select
                className={`${inputCls} bg-white`}
                value={recPreset}
                onChange={e => {
                  const v = e.target.value as typeof recPreset;
                  setRecPreset(v);
                  if (v === "daily") { setRecPattern("DAILY"); setRecInterval(1); }
                  if (v === "weekly") { setRecPattern("WEEKLY"); setRecInterval(1); }
                  if (v === "monthly") { setRecPattern("MONTHLY"); setRecInterval(1); }
                  if (v === "yearly") { setRecPattern("YEARLY"); setRecInterval(1); }
                  if (v === "none") { setRecEnds("never"); setRecEndAt(""); }
                }}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week on {startAt ? new Date(startAt).toLocaleDateString("en-GB", { weekday: "long" }) : "…"}</option>
                <option value="monthly">
                  Every month on the {startAt ? new Date(startAt).getDate() : "…"}
                  {startAt
                    ? (["th", "st", "nd", "rd"][[11, 12, 13].includes(new Date(startAt).getDate()) ? 0 : Math.min(new Date(startAt).getDate() % 10, 3)] ?? "th")
                    : ""}
                </option>
                <option value="yearly">
                  Every year on {startAt ? new Date(startAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "…"}
                </option>
                <option value="custom">Custom…</option>
              </select>

              {recPreset === "custom" && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500">Every</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    className="w-16 rounded-xl border border-slate-200 px-3 py-2 text-center text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={recInterval}
                    onChange={e => setRecInterval(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                  />
                  <select
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={recPattern}
                    onChange={e => setRecPattern(e.target.value as EventRecurrencePattern)}
                  >
                    <option value="DAILY">{recInterval === 1 ? "day" : "days"}</option>
                    <option value="WEEKLY">{recInterval === 1 ? "week" : "weeks"}</option>
                    <option value="MONTHLY">{recInterval === 1 ? "month" : "months"}</option>
                    <option value="YEARLY">{recInterval === 1 ? "year" : "years"}</option>
                  </select>
                </div>
              )}

              {isNewRecurring && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-500">Ends</label>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input type="radio" name="recEnds" checked={recEnds === "never"} onChange={() => { setRecEnds("never"); setRecEndAt(""); }} className="accent-violet-600" />
                      Never
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input type="radio" name="recEnds" checked={recEnds === "on"} onChange={() => setRecEnds("on")} className="accent-violet-600" />
                      On date
                      {recEnds === "on" && (
                        <input
                          type="date"
                          className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-xs transition-all focus:outline-none focus:ring-1 focus:ring-blue-300"
                          value={recEndAt}
                          min={startAt.split("T")[0]}
                          onChange={e => setRecEndAt(e.target.value)}
                        />
                      )}
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {editing?.isRecurring && (
            <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><RefreshCw className="h-3.5 w-3.5" /> This is a recurring event</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-xs text-amber-700">
                  <input type="radio" checked={updateScope === "THIS_ONLY"} onChange={() => setUpdateScope("THIS_ONLY")} className="accent-amber-600" />
                  This event only
                </label>
                <label className="flex items-center gap-1.5 text-xs text-amber-700">
                  <input type="radio" checked={updateScope === "ALL_IN_SERIES"} onChange={() => setUpdateScope("ALL_IN_SERIES")} className="accent-amber-600" />
                  All events in series
                </label>
              </div>
            </div>
          )}

          {whoCanSee !== "JUST_YOU" && (
            <PeoplePicker
              label={whoCanSee === "SELECTED" ? "Select who can see" : "Guests"}
              employees={orgEmployees}
              loading={loadingEmployees}
              selected={inviteeIds}
              onToggle={toggleInvitee}
              onLeaveNames={onLeaveNames}
            />
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Saving…" : editing ? "Save Changes" : quickCreateProspect ? "Create Client Visit" : "Create Event"}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const filtered = employees.filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-2 rounded-xl border border-slate-100 p-3">
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-indigo-400" />
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {selected.length > 0 && <span className="ml-auto text-xs text-slate-400">{selected.length} selected</span>}
      </div>

      {onLeaveNames.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">{onLeaveNames.join(", ")}</span> {onLeaveNames.length === 1 ? "is" : "are"} on approved leave during this time.
          </p>
        </div>
      )}

      <input
        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
        placeholder="Search by name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
      ) : (
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {filtered.map(emp => {
            const isSelected = selected.includes(emp.id);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => onToggle(emp.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  isSelected ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  isSelected ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  {isSelected ? <Check className="h-3 w-3" /> : emp.firstName.charAt(0)}
                </div>
                <span className="flex-1 text-left font-medium">{emp.firstName} {emp.lastName}</span>
                {emp.department && <span className="text-[10px] text-slate-400">{emp.department.name}</span>}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No employees found</p>}
        </div>
      )}
    </div>
  );
}
