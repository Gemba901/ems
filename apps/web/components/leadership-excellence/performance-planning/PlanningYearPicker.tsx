"use client";

import { useState } from "react";
import { CalendarDays, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanning } from "./PlanningProvider";
import { control, ErrorList, Field, Modal } from "./PlanningUi";

export function PlanningYearPicker({
  value,
  years,
  onChange,
}: {
  value: string;
  years: string[];
  onChange: (year: string, created?: boolean) => void;
}) {
  const { data, run, busy } = usePlanning();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const canCreate = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(
    data.actor.role,
  );
  const cleanedYear = year.trim();
  // Years come from the one plan register. Reuse an existing year instead of
  // creating a second calendar master or another company assessment.
  const existing = data.documents.some((plan) => plan.cycle === cleanedYear);

  async function save() {
    if (busy || !canCreate) return;
    if (
      !/^\d{4}$/.test(cleanedYear) ||
      Number(cleanedYear) < 2000 ||
      Number(cleanedYear) > 2200
    ) {
      setError("Enter a four-digit year between 2000 and 2200.");
      return;
    }
    setError("");
    try {
      if (!existing) {
        await run("CREATE_PLAN", {
          kind: "SWOT",
          cycle: cleanedYear,
          title: `Company SWOT · ${cleanedYear}`,
        });
      }
      onChange(cleanedYear, !existing);
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add the planning year. Try again.",
      );
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <CalendarDays size={18} className="shrink-0" />
        <label>
          <span className="block text-[10px]">Planning year</span>
          <select
            aria-label="Planning year"
            className="max-w-36 bg-transparent py-1 text-sm font-semibold text-gemba-navy outline-offset-2"
            value={value}
            disabled={busy}
            onChange={(event) => onChange(event.target.value)}
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {canCreate && (
          <button
            type="button"
            aria-label="Add planning year"
            title="Add planning year"
            disabled={busy}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-gemba-navy hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gemba-navy disabled:opacity-50"
            onClick={() => {
              setYear("");
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
          title="Add planning year"
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
            <p className="text-sm leading-6 text-muted-foreground">
              Enter a year to start its draft SWOT assessment. You can complete
              the findings and plan details later.
            </p>
            <Field
              label="New planning year"
              hint="Use a four-digit year, for example 2031."
            >
              <input
                className={control}
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={year}
                disabled={busy}
                aria-invalid={!!error}
                placeholder={String(Math.min(2200, Number(value) + 1))}
                onChange={(event) => {
                  setYear(event.target.value);
                  setError("");
                }}
              />
            </Field>
            {existing && (
              <p role="status" className="text-sm text-muted-foreground">
                This year already has a plan. Select it to continue.
              </p>
            )}
            <ErrorList error={error} />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : existing ? "Select year" : "Create year"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
