"use client";

import { useEffect, useId, useState } from "react";
import type { SuggestedHod } from "./onboarding-hod-bulk";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
  if (!open) return null;
  const toggle = (key: string) => setPicked(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return (
    <Dialog open onOpenChange={(next) => { if (!next && !running) onClose(); }}>
      <DialogContent showCloseButton={false} role="dialog" aria-labelledby={titleId} data-hod-bulk-dialog className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-card p-5 shadow-xl sm:max-w-lg gap-0 ring-0">
        <h2 id={titleId} className="text-base font-semibold text-foreground">Confirm suggested HODs</h2>
        <p className="mt-1 text-sm text-muted-foreground">Every record in these departments names the same HOD. Confirming sets the shared HOD for the department and branch; people still waiting to register are linked once they register.</p>
        <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {suggestions.map(s => <li key={s.key}>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2 text-sm hover:bg-muted">
              <Checkbox checked={picked.has(s.key)} disabled={running} onCheckedChange={() => toggle(s.key)} className="mt-1 shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{s.departmentName} · {s.branchLabel}</span>
                <span className="block break-words text-foreground">{s.person.name}{s.person.designation ? ` · ${s.person.designation}` : ""}</span>
                <span className="block text-xs text-muted-foreground">{s.count} of {s.total} records name them{s.target.startsWith("record:") ? " · pending registration" : ""}</span>
              </span>
            </label>
          </li>)}
        </ul>
        {individual > 0 && <p className="mt-2 text-xs text-warning">{individual} {individual === 1 ? "department needs" : "departments need"} an individual choice (records disagree, some are blank, or the person is based in another branch).</p>}
        {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" type="button" disabled={running} onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 h-auto whitespace-normal">Close</Button>
          <Button variant="ghost" type="button" disabled={running || picked.size === 0} onClick={() => onConfirm(suggestions.filter(s => picked.has(s.key)).map(s => s.key))}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary disabled:opacity-50 h-auto whitespace-normal">
            {running ? `Confirming… ${progress ?? ""}` : `Confirm ${picked.size} ${picked.size === 1 ? "HOD" : "HODs"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
