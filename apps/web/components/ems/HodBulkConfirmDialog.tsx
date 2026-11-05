"use client";

import { useEffect, useId, useState } from "react";
import type { SuggestedHod } from "./onboarding-hod-bulk";

/**
 * Review the HODs the import suggests and confirm several at once. Each is ticked by default; untick any
 * you're unsure of and confirm those individually on a record instead.
 */
export default function HodBulkConfirmDialog({ open, suggestions, individual, running, progress, error, onConfirm, onClose }: {
  open: boolean; suggestions: SuggestedHod[]; individual: number; running: boolean;
  /** e.g. "3 of 10" while saving. */
  progress?: string; error?: string | null;
  onConfirm: (keys: string[]) => void; onClose: () => void;
}) {
  const titleId = useId();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setPicked(new Set(suggestions.map(s => s.key))); }, [open, suggestions]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !running) { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, running, onClose]);
  if (!open) return null;
  const toggle = (key: string) => setPicked(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" onClick={() => { if (!running) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} data-hod-bulk-dialog
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
        <h2 id={titleId} className="text-base font-semibold text-slate-900">Confirm suggested HODs</h2>
        <p className="mt-1 text-sm text-slate-600">Every record in these departments names the same HOD. Confirming sets the shared HOD for the department and branch; people still waiting to register are linked once they register.</p>
        <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {suggestions.map(s => <li key={s.key}>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(s.key)} disabled={running} onChange={() => toggle(s.key)} className="mt-1 shrink-0 accent-purple-800" />
              <span className="min-w-0">
                <span className="block font-semibold text-slate-800">{s.departmentName} · {s.branchLabel}</span>
                <span className="block break-words text-slate-700">{s.person.name}{s.person.designation ? ` · ${s.person.designation}` : ""}</span>
                <span className="block text-xs text-slate-500">{s.count} of {s.total} records name them{s.target.startsWith("record:") ? " · pending registration" : ""}</span>
              </span>
            </label>
          </li>)}
        </ul>
        {individual > 0 && <p className="mt-2 text-xs text-amber-800">{individual} {individual === 1 ? "department needs" : "departments need"} an individual choice (records disagree, some are blank, or the person is based in another branch).</p>}
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={running} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close</button>
          <button type="button" disabled={running || picked.size === 0} onClick={() => onConfirm(suggestions.filter(s => picked.has(s.key)).map(s => s.key))}
            className="rounded-xl bg-purple-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-900 disabled:opacity-50">
            {running ? `Confirming… ${progress ?? ""}` : `Confirm ${picked.size} ${picked.size === 1 ? "HOD" : "HODs"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
