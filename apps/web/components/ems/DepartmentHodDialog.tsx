"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { EmsOrganisationService, type DepartmentHodChoices } from "@/services/ems-organisation.service";
import { HodAppointmentReview, HodChooser, hodBranchNeedsConfirmation } from "./OnboardingHodChooser";
import { PersonSummary } from "./OnboardingPeopleLinks";
import type { DepartmentBranch, DepartmentDirectoryRow } from "./department-directory";

const primary = "rounded-lg bg-purple-900 px-3 py-2 text-sm font-medium text-white hover:bg-purple-950 disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

/**
 * Choose HOD, in place, for one department at one branch (Organisation → Departments).
 * Registered employees only; a person based at another branch needs a tick to confirm. Same save rules as the profile's HOD.
 */
export function DepartmentHodDialog({ department, branches, initialBranch, company, token, onClose, onSaved }: {
  department: DepartmentDirectoryRow; branches: DepartmentBranch[]; initialBranch?: string; company?: string | null; token: string;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const client = useQueryClient();
  const [branch, setBranch] = useState(initialBranch ?? branches[0]?.key ?? "");
  const queryKey = ["ems-department-hod", company, department.id, branch];
  // Loaded once per branch: a refetch would wipe a half-made choice. The save's version check catches anything that changed meanwhile.
  const choices = useQuery({ queryKey, queryFn: () => EmsOrganisationService.hod(department.id, branch, token), staleTime: Infinity, refetchOnWindowFocus: false });
  const data = choices.data;
  const [hod, setHod] = useState(""), [choosing, setChoosing] = useState(true), [confirmed, setConfirmed] = useState(false);

  // A new branch, or fresh choices from the server: start from what is saved now.
  function start(next: DepartmentHodChoices) {
    setHod(next.hod.target ?? (next.hasHodAssignment ? "NONE" : ""));
    setChoosing(!next.hasHodAssignment || next.hod.state === "NEEDS_ATTENTION");
    setConfirmed(false);
  }
  useEffect(() => { if (data) start(data); }, [data]);
  useEffect(() => { setConfirmed(false); }, [hod]);

  const save = useMutation({
    mutationFn: () => EmsOrganisationService.saveHod(department.id, { branch, target: hod, expectedVersion: data!.hodVersion }, token),
    onSuccess: updated => {
      client.setQueryData(queryKey, updated);
      void client.invalidateQueries({ queryKey: ["ems-department-directory"] });
      void client.invalidateQueries({ queryKey: ["ems-people-links"] });
      onSaved(`HOD saved for ${department.name}${updated.branchLabel ? ` · ${updated.branchLabel}` : ""}.`);
      onClose();
    },
  });
  const busy = save.isPending;

  // Escape closes (not while saving); focus moves into the dialog, and back to the button that opened it afterwards.
  const box = useRef<HTMLDivElement>(null), latest = useRef({ busy, onClose });
  useEffect(() => { latest.current = { busy, onClose }; });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !latest.current.busy) latest.current.onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; opener?.focus?.(); };
  }, []);

  const branchText = data?.branchLabel ?? "";
  const scope = `${department.name} · ${branchText || "Branch not recorded"}`;
  const person = data?.hodOptions.find(p => p.target === hod) ?? (data?.hod.target === hod ? data?.hod.person ?? undefined : undefined);
  const changed = !!data && !!hod && (hod !== (data.hod.target ?? "NONE") || !data.hasHodAssignment || data.hod.state === "NEEDS_ATTENTION");
  const allowed = !hodBranchNeedsConfirmation(person, branchText) || confirmed;
  const stale = save.error && /changed/i.test(save.error.message);

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={box} role="dialog" aria-modal="true" aria-labelledby="choose-hod-title" tabIndex={-1}
      className="w-full max-w-xl space-y-4 rounded-xl bg-white p-5 shadow-xl focus:outline-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="choose-hod-title" className="text-lg font-bold text-slate-900">Choose HOD</h2>
          <p className="text-sm text-slate-600">{department.name}</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>

      {branches.length > 1 && <label className="block text-xs font-medium text-slate-600">Branch
        <select value={branch} disabled={busy} onChange={event => { setBranch(event.target.value); save.reset(); }}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500">
          {branches.map(b => <option key={b.key} value={b.key}>{b.label}{b.hod.state === "NOT_RECORDED" ? " · no HOD" : ""}</option>)}
        </select></label>}

      {choices.isPending ? <p role="status" className="text-sm text-slate-600">Loading people…</p>
        : choices.error ? <p role="alert" className="text-sm text-red-700">{(choices.error as Error).message}</p>
        : data && <div className="space-y-3">
          <p className="text-xs text-slate-600"><strong>HOD for:</strong> {scope}</p>
          {choosing ? <HodChooser id={`department-hod-${department.id}`} value={hod} options={data.hodOptions}
              directory={data.hodDirectory} suggestions={data.recordedHodSuggestions} departmentId={data.departmentId}
              department={data.departmentName} branch={branchText} disabled={busy}
              onChoose={target => { setHod(target); setChoosing(!target); }} />
            : <div className="space-y-1.5">
              {person ? <PersonSummary person={person} /> : <p className="text-sm text-slate-700">{hod === "NONE" ? "No HOD (by choice)" : "Current choice kept"}</p>}
              <button type="button" disabled={busy} onClick={() => setChoosing(true)} className="text-xs font-semibold text-purple-900 underline">Change choice</button>
            </div>}
          {changed && !choosing && <HodAppointmentReview scope={scope} person={person} unassigned={hod === "NONE"} branch={branchText}
            confirmed={confirmed} onConfirm={setConfirmed} disabled={busy} />}
          {!choosing && hod === "NONE" && <p className="text-xs text-slate-500">“Not assigned” records that this branch has no HOD on purpose; it stops showing as needing attention.</p>}
          {save.error && <div role="alert" className="text-sm text-red-700">{save.error.message}
            {stale && <button type="button" className="ml-2 font-medium underline" onClick={() => { save.reset(); void choices.refetch(); }}>Reload</button>}</div>}
        </div>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" className={secondary} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={primary} disabled={busy || !data || choosing || !changed || !allowed}
          onClick={() => { if (changed && allowed) save.mutate(); }}>{busy ? "Saving…" : "Save HOD"}</button>
      </div>
    </div>
  </div>;
}
