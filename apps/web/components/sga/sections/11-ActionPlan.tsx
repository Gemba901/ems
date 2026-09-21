"use client";

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

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(token),
    enabled: !!token && access.editable,
  });
  const { data: colleagues } = useQuery({
    queryKey: ["employee-colleagues"],
    queryFn: () => EmployeeService.getMyColleagues(token),
    enabled: !!token && access.editable && !!me?.departmentId,
  });

  const personOptions = me ? [{ id: me.id, firstName: me.firstName, lastName: me.lastName }, ...(colleagues ?? [])] : (colleagues ?? []);

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
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
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

  const nameFor = (id?: string | null) => {
    if (!id) return "Unassigned";
    const person = personOptions.find((p) => p.id === id);
    return person ? `${person.firstName} ${person.lastName}` : "Unassigned";
  };

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="4.1">Confirmed Causes &amp; Action Plan</SectionLabel>
        {sga.actionItems.length === 0 ? (
          <p className="text-sm text-slate-400">No action items recorded.</p>
        ) : (
          <div className="space-y-3">
            {sga.actionItems.map((a) => (
              <div key={a.id} className="border border-slate-100 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-700">{a.confirmedRootCause}</p>
                <p className="text-sm text-slate-600 mt-1">{a.improvementAction}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {a.responsiblePerson ? `${a.responsiblePerson.firstName} ${a.responsiblePerson.lastName}` : "Unassigned"}
                  {a.dueDate ? ` · Due ${a.dueDate.slice(0, 10)}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="4.1">Confirmed Causes &amp; Action Plan</SectionLabel>
      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-600">Action {index + 1}</p>
              <button type="button" onClick={() => removeRow(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Confirmed root cause</label>
              <input
                type="text"
                value={row.confirmedRootCause}
                onChange={(e) => updateRow(index, { confirmedRootCause: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Improvement action</label>
              <input
                type="text"
                value={row.improvementAction}
                onChange={(e) => updateRow(index, { improvementAction: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Responsible person</label>
                <select
                  value={row.responsiblePersonId ?? ""}
                  onChange={(e) => updateRow(index, { responsiblePersonId: e.target.value || undefined })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value="">Unassigned</option>
                  {personOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Due date</label>
                <input
                  type="date"
                  value={row.dueDate ?? ""}
                  onChange={(e) => updateRow(index, { dueDate: e.target.value || undefined })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add action item
        </button>

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default ActionPlanSection;
