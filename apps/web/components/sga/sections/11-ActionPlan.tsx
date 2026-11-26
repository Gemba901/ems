"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { EmployeeService } from "@/services/employee.service";
import { SgaActionItemPayload, SgaService } from "@/services/sga.service";
import { SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

type Row = SgaActionItemPayload;

function toRows(sga: SgaSectionProps["sga"]): Row[] {
  return sga.actionItems.map((a) => ({
    id: a.id,
    confirmedRootCause: a.confirmedRootCause,
    improvementAction: a.improvementAction,
    responsiblePersonId: a.responsiblePersonId ?? undefined,
    dueDate: a.dueDate ? a.dueDate.slice(0, 10) : undefined,
  }));
}

const ActionPlanSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ActionPlanSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [rows, setRows] = useState<Row[]>(toRows(sga));
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(token),
    enabled: !!token && editable,
  });
  const { data: colleagues } = useQuery({
    queryKey: ["employee-colleagues"],
    queryFn: () => EmployeeService.getMyColleagues(token),
    enabled: !!token && editable && !!me?.departmentId,
  });

  const fetchedOptions = me ? [{ id: me.id, firstName: me.firstName, lastName: me.lastName }, ...(colleagues ?? [])] : (colleagues ?? []);
  // Fall back to the action items' own responsiblePerson records so names still
  // resolve correctly once this section is no longer editable (fetchedOptions is
  // then empty since the colleagues queries are disabled).
  const knownResponsibles = sga.actionItems
    .map((a) => a.responsiblePerson)
    .filter((p): p is NonNullable<typeof p> => !!p);
  const personOptions = editable ? fetchedOptions : knownResponsibles;

  const addRow = () => {
    setRows((prev) => [...prev, { confirmedRootCause: "", improvementAction: "" }]);
  };

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      for (const r of rows) {
        if (!r.confirmedRootCause.trim() || !r.improvementAction.trim()) {
          throw new Error("Every action item needs a confirmed root cause and an improvement action.");
        }
      }
      return SgaService.updateActionPlan(
        sga.id,
        {
          actionItems: rows.map((r) => ({
            ...r,
            confirmedRootCause: r.confirmedRootCause.trim(),
            improvementAction: r.improvementAction.trim(),
          })),
        },
        token,
      );
    },
    onSuccess: (updated) => {
      // Pick up the ids of newly created items so a later save keeps their progress.
      setRows(toRows(updated));
      setError(null);
      onSaved(updated);
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
  }));

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="4.1">Confirmed Causes &amp; Action Plan</SectionLabel>
      <div className="space-y-4">
        {rows.length === 0 && !editable && <p className="text-sm text-muted-foreground">No action items recorded.</p>}
        {rows.map((row, index) => (
          <div key={index} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary">Action {index + 1}</p>
              {editable && (
                <Button variant="ghost" type="button" onClick={() => removeRow(index)} className="text-muted-foreground hover:text-danger transition-colors">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Confirmed root cause</label>
              <Input
                type="text"
                value={row.confirmedRootCause}
                disabled={!editable}
                onChange={(e) => updateRow(index, { confirmedRootCause: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Improvement action</label>
              <Input
                type="text"
                value={row.improvementAction}
                disabled={!editable}
                onChange={(e) => updateRow(index, { improvementAction: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Responsible person</label>
                <NativeSelect
                  value={row.responsiblePersonId ?? ""}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, { responsiblePersonId: e.target.value || undefined })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                >
                  <option value="">Unassigned</option>
                  {personOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Due date</label>
                <Input
                  type="date"
                  value={row.dueDate ?? ""}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, { dueDate: e.target.value || undefined })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                />
              </div>
            </div>
          </div>
        ))}
        {editable && (
          <Button variant="ghost"
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add action item
          </Button>
        )}

        {error && <p className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default ActionPlanSection;
