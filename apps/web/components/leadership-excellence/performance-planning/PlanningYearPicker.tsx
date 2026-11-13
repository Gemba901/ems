"use client";

import { useState } from "react";
import { CalendarDays, Pencil } from "lucide-react";
import {
  PLANNING_DATE_MIN,
  PLANNING_DATE_MAX,
  planningPeriodBounds,
  planningPeriodKey,
  planningPeriodLabel,
  planningPeriodValidation,
} from "@/services/leadership-excellence/performance-planning/planning-period";
import { usePlanning } from "./PlanningProvider";
import { Button, control, ErrorList, Field, Modal } from "./PlanningUi";

export function PlanningYearPicker({
  value,
  years,
  onChange,
}: {
  value: string;
  years: string[];
  onChange: (period: string, created?: boolean) => void;
}) {
  const { data, run, busy } = usePlanning();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const canCreate = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(
    data.actor.role,
  );
  const candidate = planningPeriodKey(from, to);
  // Reuse the single register's canonical period, including legacy year keys.
  const existing = candidate
    ? data.documents.find((plan) => {
        const bounds = planningPeriodBounds(plan.cycle);
        return (
          bounds &&
          planningPeriodKey(bounds.startDate, bounds.endDate) === candidate
        );
      })
    : undefined;

  async function save() {
    if (busy || !canCreate) return;
    const issues = planningPeriodValidation(from, to);
    if (!candidate || issues.length) {
      setError(issues.join("\n"));
      return;
    }
    setError("");
    try {
      if (!existing) {
        await run("CREATE_PLAN", {
          kind: "SWOT",
          cycle: candidate,
          startDate: from,
          endDate: to,
          title: `Company SWOT · ${planningPeriodLabel(candidate)}`,
        });
      }
      onChange(existing?.cycle || candidate, !existing);
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add the planning period. Try again.",
      );
    }
  }

  return (
    <>
      <div className="flex max-w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm">
        <CalendarDays size={18} className="shrink-0" />
        <label className="min-w-0">
          <span className="block text-[10px]">Planning period</span>
          <select
            aria-label="Planning period"
            className="max-w-64 rounded bg-transparent py-1 text-sm font-semibold text-slate-900 outline-offset-2 focus-visible:outline-indigo-500"
            value={value}
            disabled={busy}
            onChange={(event) => onChange(event.target.value)}
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {planningPeriodLabel(option)}
              </option>
            ))}
          </select>
        </label>
        {canCreate && (
          <button
            type="button"
            aria-label="Add planning period"
            title="Add planning period"
            disabled={busy}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50"
            onClick={() => {
              const bounds = planningPeriodBounds(value);
              setFrom(bounds?.startDate || "");
              setTo(bounds?.endDate || "");
              setError("");
              setOpen(true);
            }}
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      {open && (
        <Modal
          title="Add planning period"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            className="space-y-4"
          >
            <p className="text-sm leading-6 text-slate-500">
              Choose the dates your plan covers. This can be a calendar year, a
              financial year or several years. A new period starts with a draft
              SWOT assessment.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From">
                <input
                  className={control}
                  type="date"
                  min={PLANNING_DATE_MIN}
                  max={PLANNING_DATE_MAX}
                  autoFocus
                  value={from}
                  disabled={busy}
                  aria-invalid={!!error}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setError("");
                  }}
                />
              </Field>
              <Field label="To">
                <input
                  className={control}
                  type="date"
                  min={PLANNING_DATE_MIN}
                  max={PLANNING_DATE_MAX}
                  value={to}
                  disabled={busy}
                  aria-invalid={!!error}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setError("");
                  }}
                />
              </Field>
            </div>
            {existing ? (
              <p role="status" className="text-sm text-slate-500">
                This period already has a plan. Select it to continue.
              </p>
            ) : candidate ? (
              <p className="text-sm text-slate-500">
                Planning period: {planningPeriodLabel(candidate)}
              </p>
            ) : null}
            <ErrorList error={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : existing
                    ? "Select period"
                    : "Create period"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
