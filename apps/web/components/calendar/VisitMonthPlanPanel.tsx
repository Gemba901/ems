"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarService, PartnerOrg, VisitPlanSlot,
} from "@/services/calendar.service";
import {
  Loader2, Save, Plus, Minus, CalendarDays, CheckCircle2, Building2,
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface VisitMonthPlanPanelProps {
  orgs: PartnerOrg[];
  token: string;
  year: number;
  month: number;
}

export function VisitMonthPlanPanel({ orgs, token, year, month }: VisitMonthPlanPanelProps) {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string>(orgs[0]?.id ?? "");
  const [pendingDays, setPendingDays]     = useState<number | null>(null);

  const planQueryKey = ["visit-month-plan", selectedOrgId, year, month];

  const { data: plan, isLoading } = useQuery({
    queryKey: planQueryKey,
    queryFn: () => selectedOrgId
      ? CalendarService.getVisitMonthPlan(selectedOrgId, year, month, token)
      : Promise.resolve(null),
    enabled: !!token && !!selectedOrgId,
  });

  // Reset pending days when plan or org changes
  useEffect(() => { setPendingDays(null); }, [selectedOrgId, year, month]);

  const upsertMutation = useMutation({
    mutationFn: (data: { clientOrgId: string; year: number; month: number; plannedDays: number }) =>
      CalendarService.upsertVisitMonthPlan(data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueryKey });
      setPendingDays(null);
    },
  });

  const slotMutation = useMutation({
    mutationFn: ({ planId, slotIndex, data }: {
      planId: string; slotIndex: number; data: { date?: string; agenda?: string };
    }) => CalendarService.updateVisitPlanSlot(planId, slotIndex, data, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planQueryKey }),
  });

  const displayedDays = pendingDays ?? plan?.plannedDays ?? 1;
  const isDirty = pendingDays !== null && pendingDays !== plan?.plannedDays;
  const isNew   = !plan;

  const handleSavePlan = () => {
    if (!selectedOrgId) return;
    upsertMutation.mutate({ clientOrgId: selectedOrgId, year, month, plannedDays: displayedDays });
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden sticky top-6">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Monthly Visit Plan · {MONTHS[month - 1]} {year}
        </p>

        {/* Org selector */}
        <select
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        {/* Planned days row */}
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-xs text-slate-500 flex-1">Planned visits:</span>
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setPendingDays(Math.max(1, displayedDays - 1))}
              className="h-7 w-7 flex items-center justify-center hover:bg-slate-50 transition-colors border-r border-slate-100"
            >
              <Minus className="h-3 w-3 text-slate-500" />
            </button>
            <input
              type="number"
              min={1}
              max={31}
              value={displayedDays}
              onChange={(e) => setPendingDays(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
              className="w-8 text-center text-sm font-bold text-slate-800 outline-none"
            />
            <button
              onClick={() => setPendingDays(Math.min(31, displayedDays + 1))}
              className="h-7 w-7 flex items-center justify-center hover:bg-slate-50 transition-colors border-l border-slate-100"
            >
              <Plus className="h-3 w-3 text-slate-500" />
            </button>
          </div>
          <button
            onClick={handleSavePlan}
            disabled={upsertMutation.isPending || (!isDirty && !isNew)}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            {upsertMutation.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Save className="h-3 w-3" />}
            {isNew ? "Create" : "Update"}
          </button>
        </div>
      </div>

      {/* Slot list */}
      <div className="max-h-[calc(100vh-22rem)] overflow-y-auto divide-y divide-slate-50">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : !plan ? (
          <div className="py-10 text-center text-slate-400 px-4">
            <Building2 className="h-7 w-7 mx-auto mb-2 text-slate-200" />
            <p className="text-xs font-medium text-slate-500">No plan for this month</p>
            <p className="text-[11px] mt-0.5 text-slate-400">Set the number of visits above and click Create</p>
          </div>
        ) : plan.slots.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">No slots — update the plan to add visits</div>
        ) : (
          plan.slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              index={slot.slotIndex}
              month={month}
              year={year}
              saving={slotMutation.isPending && (slotMutation.variables as any)?.slotIndex === slot.slotIndex}
              onSave={(data) => slotMutation.mutate({ planId: plan.id, slotIndex: slot.slotIndex, data })}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Slot row ──────────────────────────────────────────────────────────────────

function SlotRow({
  slot, index, month, year, saving, onSave,
}: {
  slot: VisitPlanSlot;
  index: number;
  month: number;
  year: number;
  saving: boolean;
  onSave: (data: { date?: string; agenda?: string }) => void;
}) {
  const savedDate   = slot.date ? slot.date.slice(0, 10) : "";
  const savedAgenda = slot.agenda ?? "";

  const [date,    setDate]    = useState(savedDate);
  const [agenda,  setAgenda]  = useState(savedAgenda);
  const [dirty,   setDirty]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Sync if slot prop changes (after save)
  useEffect(() => { setDate(savedDate); setAgenda(savedAgenda); setDirty(false); }, [slot.id, savedDate, savedAgenda]);

  const hasDate   = !!date;
  const hasAgenda = !!agenda.trim();
  const isComplete = hasDate && hasAgenda;

  const handleSave = () => {
    onSave({ date: date || undefined, agenda: agenda.trim() || undefined });
    setDirty(false);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2.5">
        {/* Badge */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
            isComplete
              ? "bg-emerald-100 text-emerald-700"
              : hasDate
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {isComplete ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
        </button>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Date row */}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3 w-3 text-slate-400 shrink-0" />
            <input
              type="date"
              value={date}
              min={`${year}-${String(month).padStart(2, "0")}-01`}
              max={`${year}-${String(month).padStart(2, "0")}-31`}
              onChange={(e) => { setDate(e.target.value); setDirty(true); setExpanded(true); }}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-white"
            />
            {date && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">
                {new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" })}
              </span>
            )}
          </div>

          {/* Agenda — shown when expanded or has content */}
          {(expanded || hasAgenda) && (
            <textarea
              rows={2}
              placeholder="Agenda for this visit…"
              value={agenda}
              onChange={(e) => { setAgenda(e.target.value); setDirty(true); }}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-300 bg-white"
            />
          )}

          {/* Save / status */}
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors"
              >
                {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
                Save
              </button>
            )}
            {!dirty && !hasAgenda && hasDate && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors"
              >
                {expanded ? "Hide agenda" : "+ Add agenda"}
              </button>
            )}
            {!dirty && isComplete && (
              <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                <CheckCircle2 className="h-2.5 w-2.5" /> Set
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
