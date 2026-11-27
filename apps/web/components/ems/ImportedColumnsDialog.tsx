"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { EmsService, type OnboardingBatchDetail } from "@/services/ems.service";
import { EXTRA_PROFILE_FIELDS, excelColumn } from "./onboarding-extra-fields";
import { destinationLabel, summariseImportedColumns, type ColumnSummary } from "./imported-columns";

/**
 * Where each extra column goes, decided once for the whole import. Applies to every
 * unregistered, non-excluded record, re-validates them, and is remembered for future imports.
 */
export default function ImportedColumnsDialog({ batch, accessToken, onClose, onDone }: {
  batch: OnboardingBatchDetail; accessToken: string; onClose: () => void;
  onDone: (updated: OnboardingBatchDetail, message: string) => void;
}) {
  const titleId = useId();
  const columns = useMemo(() => summariseImportedColumns(batch), [batch]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const apply = useMutation({
    mutationFn: (row: ColumnSummary) => EmsService.setOnboardingColumnDestination(batch.id,
      { column: row.column, heading: row.heading, target: choices[row.key] || null }, accessToken),
    onSuccess: (updated, row) => onDone(updated, `${excelColumn(row.column)} · ${row.heading || "Untitled column"} now goes to ${destinationLabel(choices[row.key] || null)}`),
  });
  const busy = apply.isPending;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // A profile field can be filled by one column only; flag a choice another open column already uses.
  const usedBy = (target: string, except: string) => columns.find(row => row.key !== except && row.open > 0
    && row.targets.size === 1 && row.targets.has(target));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={event => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white text-sm shadow-xl">
        <div className="border-b border-slate-100 p-5 pb-3">
          <h2 id={titleId} className="text-base font-bold text-slate-900">Imported columns</h2>
          <p className="mt-1 text-xs text-slate-500">Choose once where each extra column goes. It applies to every record not yet registered or excluded, re-checks them, and is remembered for this organisation’s next imports.</p>
        </div>
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto px-5">
          {!columns.length && <p className="py-6 text-center text-slate-500">This import has no extra columns.</p>}
          {columns.map(row => {
            const current = row.targets.size === 1 ? [...row.targets][0] : undefined;
            const chosen = choices[row.key] ?? (current === undefined ? "" : current ?? "");
            const changed = row.open > 0 && (current === undefined || chosen !== (current ?? ""));
            const clash = chosen ? usedBy(chosen, row.key) : undefined;
            const selectId = `column-destination-${row.column}`;
            return (
              <div key={row.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_15rem_auto] sm:items-start">
                <div className="min-w-0">
                  <label htmlFor={selectId} className="block break-words text-xs font-semibold text-slate-800">{excelColumn(row.column)} · {row.heading || "Untitled column"}</label>
                  <p className="mt-0.5 break-words text-[11px] text-slate-500">
                    {row.withValue} of {row.total} {row.total === 1 ? "record has" : "records have"} a value{row.samples.length ? ` · e.g. ${row.samples.join(" · ")}` : ""}
                  </p>
                  {row.open === 0 && <p className="mt-0.5 text-[11px] text-slate-500">All its records are registered or excluded, so it can’t change here.</p>}
                  {current === undefined && row.open > 0 && <p className="mt-0.5 text-[11px] text-amber-700">Mixed: records currently go to different places.</p>}
                  {clash && <p className="mt-0.5 text-[11px] text-amber-700">{excelColumn(clash.column)} · {clash.heading} already goes to {destinationLabel(chosen)}. Only one column can fill a field.</p>}
                </div>
                <select id={selectId} value={chosen} disabled={busy || row.open === 0}
                  onChange={event => setChoices(prev => ({ ...prev, [row.key]: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs disabled:opacity-60">
                  <option value="">Reference only</option>
                  {EXTRA_PROFILE_FIELDS.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
                </select>
                <button type="button" disabled={busy || !changed} onClick={() => apply.mutate(row)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                  {busy && apply.variables?.key === row.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Apply{row.open > 0 ? ` to ${row.open}` : ""}
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-100 p-4">
          {apply.error && <p role="alert" className="mb-2 text-xs text-red-600">{(apply.error as Error).message}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={onClose} disabled={busy}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
