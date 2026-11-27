"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { EmsOrganisationService, type DepartmentHodChoices } from "@/services/ems-organisation.service";
import { HodAppointmentReview, HodChooser, hodBranchNeedsConfirmation } from "./OnboardingHodChooser";
import { PersonSummary } from "./OnboardingPeopleLinks";
import type { DepartmentBranch, DepartmentDirectoryRow } from "./department-directory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

const primary = "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-50";
const secondary = "rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";

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


  const branchText = data?.branchLabel ?? "";
  const scope = `${department.name} · ${branchText || "Branch not recorded"}`;
  const person = data?.hodOptions.find(p => p.target === hod) ?? (data?.hod.target === hod ? data?.hod.person ?? undefined : undefined);
  const changed = !!data && !!hod && (hod !== (data.hod.target ?? "NONE") || !data.hasHodAssignment || data.hod.state === "NEEDS_ATTENTION");
  const allowed = !hodBranchNeedsConfirmation(person, branchText) || confirmed;
  const stale = save.error && /changed/i.test(save.error.message);

  // The kit Dialog handles Escape, focus and scroll locking; it stays open while saving.
  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <DialogContent showCloseButton={false} aria-labelledby="choose-hod-title"
      className="max-h-[calc(100dvh-2rem)] w-full max-w-xl gap-0 space-y-4 overflow-y-auto rounded-xl bg-card p-5 shadow-xl ring-0 focus:outline-none sm:max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="choose-hod-title" className="text-lg font-bold text-foreground">Choose HOD</h2>
          <p className="text-sm text-muted-foreground">{department.name}</p>
        </div>
        <Button variant="ghost" type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50 h-auto whitespace-normal"><X className="h-5 w-5" /></Button>
      </div>

      {branches.length > 1 && <label className="block text-xs font-medium text-muted-foreground">Branch
        <NativeSelect value={branch} disabled={busy} onChange={event => { setBranch(event.target.value); save.reset(); }}
          className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
          {branches.map(b => <option key={b.key} value={b.key}>{b.label}{b.hod.state === "NOT_RECORDED" ? " · no HOD" : ""}</option>)}
        </NativeSelect></label>}

      {choices.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading people…</p>
        : choices.error ? <p role="alert" className="text-sm text-danger">{(choices.error as Error).message}</p>
        : data && <div className="space-y-3">
          <p className="text-xs text-muted-foreground"><strong>HOD for:</strong> {scope}</p>
          {choosing ? <HodChooser id={`department-hod-${department.id}`} value={hod} options={data.hodOptions}
              directory={data.hodDirectory} suggestions={data.recordedHodSuggestions} departmentId={data.departmentId}
              department={data.departmentName} branch={branchText} disabled={busy}
              onChoose={target => { setHod(target); setChoosing(!target); }} />
            : <div className="space-y-1.5">
              {person ? <PersonSummary person={person} /> : <p className="text-sm text-foreground">{hod === "NONE" ? "No HOD (by choice)" : "Current choice kept"}</p>}
              <Button variant="ghost" type="button" disabled={busy} onClick={() => setChoosing(true)} className="text-xs font-semibold text-primary underline h-auto whitespace-normal">Change choice</Button>
            </div>}
          {changed && !choosing && <HodAppointmentReview scope={scope} person={person} unassigned={hod === "NONE"} branch={branchText}
            confirmed={confirmed} onConfirm={setConfirmed} disabled={busy} />}
          {!choosing && hod === "NONE" && <p className="text-xs text-muted-foreground">“Not assigned” records that this branch has no HOD on purpose; it stops showing as needing attention.</p>}
          {save.error && <div role="alert" className="text-sm text-danger">{save.error.message}
            {stale && <Button variant="ghost" type="button" className="ml-2 font-medium underline h-auto whitespace-normal" onClick={() => { save.reset(); void choices.refetch(); }}>Reload</Button>}</div>}
        </div>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" type="button" className={`${secondary} h-auto whitespace-normal`} onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="ghost" type="button" className={`${primary} h-auto whitespace-normal`} disabled={busy || !data || choosing || !changed || !allowed}
          onClick={() => { if (changed && allowed) save.mutate(); }}>{busy ? "Saving…" : "Save HOD"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
