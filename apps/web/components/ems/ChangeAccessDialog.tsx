"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { EmsAccessService, type AccessResult, type AccessRole } from "@/services/ems-access.service";
import { ACCESS_ROLE_LABELS, ASSIGNABLE_ROLES } from "./onboarding-access";

export const accessLabel = (role?: string | null) =>
  role ? ACCESS_ROLE_LABELS[role as keyof typeof ACCESS_ROLE_LABELS] ?? (role === "SUPER_ADMIN" ? "Super Admin" : role) : "No access yet";

const primary = "rounded-lg bg-purple-900 px-3 py-2 text-sm font-medium text-white hover:bg-purple-950 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

/**
 * Change access for one person (profile) or several (Employees list): Admins only, a reason is kept in the history.
 * mode "suggest" is HR's version: the same choice and reason, saved as a suggestion an Admin approves or declines.
 */
export default function ChangeAccessDialog({ people, token, onClose, onDone, mode = "change" }: {
  people: { id: string; name: string; role?: string | null; revision?: number }[];
  token: string; onClose: () => void; onDone: (result: AccessResult) => void; mode?: "change" | "suggest";
}) {
  const suggesting = mode === "suggest";
  const [showNames, setShowNames] = useState(false);
  const single = people.length === 1 ? people[0] : null;
  const [role, setRole] = useState<AccessRole | "">(""), [reason, setReason] = useState("");
  const [result, setResult] = useState<AccessResult | null>(null);
  const save = useMutation({
    mutationFn: () => (suggesting ? EmsAccessService.suggest : EmsAccessService.change)({
      employeeIds: people.map(p => p.id), role: role as AccessRole, reason: reason.trim(),
      expectedRevisions: Object.fromEntries(people.filter(p => p.revision !== undefined).map(p => [p.id, p.revision!])),
    }, token),
    onSuccess: value => { onDone(value); if (value.skipped.length) setResult(value); else onClose(); },
  });
  const busy = save.isPending;
  const ready = !!role && reason.trim().length >= 3 && (!single || role !== single.role);

  const box = useRef<HTMLDivElement>(null), latest = useRef({ busy, onClose });
  useEffect(() => { latest.current = { busy, onClose }; });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !latest.current.busy) latest.current.onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={box} role="dialog" aria-modal="true" aria-labelledby="change-access-title" tabIndex={-1}
      className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl focus:outline-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="change-access-title" className="text-lg font-bold text-slate-900">{suggesting ? "Suggest access change" : "Change access"}</h2>
          <p className="break-words text-sm text-slate-600">{single ? `${single.name} · now ${accessLabel(single.role)}` : <>{people.length} people{" "}
            <button type="button" onClick={() => setShowNames(v => !v)} className="text-xs font-medium text-purple-900 underline">{showNames ? "Hide names" : "Show names"}</button></>}</p>
          {!single && showNames && <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2 text-xs text-slate-700" data-access-names>
            {people.map(p => <li key={p.id}>{p.name}{p.role !== undefined ? ` · ${accessLabel(p.role)}` : ""}</li>)}</ul>}
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>

      {result ? <div className="space-y-2 text-sm" role="status">
        <p className="text-slate-800">{result.changed ? `${result.changed} ${suggesting ? "suggested" : "changed"}.` : "Nothing changed."} {result.skipped.length} skipped:</p>
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
          {result.skipped.map(s => <li key={s.employeeId}><strong>{s.name}</strong>: {s.reason}</li>)}
        </ul>
      </div> : <>
        <label className="block text-xs font-medium text-slate-600">{suggesting ? "Suggested access" : "New access"}
          <select value={role} disabled={busy} onChange={event => setRole(event.target.value as AccessRole)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500">
            <option value="">Choose…</option>
            {ASSIGNABLE_ROLES.map(r => <option key={r} value={r} disabled={!!single && single.role === r}>{accessLabel(r)}{single?.role === r ? " (current)" : ""}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">Reason (kept in the access history)
          <textarea value={reason} disabled={busy} maxLength={500} rows={3} onChange={event => setReason(event.target.value)}
            placeholder="e.g. Appointed HOD of Stores from 1 December"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </label>
        <p className="text-xs text-slate-500">{suggesting
          ? "Nothing changes yet: an Admin approves or declines it on Access suggestions, and sees your reason."
          : "Takes effect on their next page load. You can't change your own access, and the company keeps at least one Admin."}</p>
        {save.error && <p role="alert" className="text-sm text-red-700">{(save.error as Error).message}</p>}
      </>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        {result ? <button type="button" className={primary} onClick={onClose}>Close</button> : <>
          <button type="button" className={secondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={primary} disabled={busy || !ready} onClick={() => save.mutate()}>{busy ? "Saving…" : suggesting ? "Send suggestion" : "Change access"}</button>
        </>}
      </div>
    </div>
  </div>;
}
