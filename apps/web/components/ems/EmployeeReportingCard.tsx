"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmsService, REPORTING_STATE_LABELS } from "@/services/ems.service";

/** HR/admin profile controls. Reporting changes save separately from the general profile form. */
export default function EmployeeReportingCard({ employeeId, token }: { employeeId: string; token: string }) {
  const [target, setTarget] = useState("");
  const client = useQueryClient();
  const queryKey = ["ems-employee-reporting", employeeId];
  const query = useQuery({ queryKey,
    queryFn: () => EmsService.getEmployeeReporting(employeeId, token),
    refetchInterval: q => q.state.data?.assignment.state === "PENDING" ? 10000 : false,
  });
  const save = useMutation({
    mutationFn: () => EmsService.updateEmployeeReporting(employeeId, target, token),
    onSuccess: data => {
      client.setQueryData(queryKey, data); setTarget("");
      client.invalidateQueries({ queryKey: ["ems-employee", employeeId] });
      client.invalidateQueries({ queryKey: ["employee", employeeId] });
      client.invalidateQueries({ queryKey: ["ems-employees-list"] });
      client.invalidateQueries({ queryKey: ["ems-onboarding-batch"] });
    },
  });
  const assignment = query.data?.assignment;
  return (
    <section id="reporting-manager" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-800">Reporting manager</h2>
        <button type="button" onClick={() => query.refetch()} disabled={query.isFetching || save.isPending} className="text-sm text-indigo-600 disabled:opacity-50">Refresh</button>
      </div>
      {query.isLoading && <p className="text-sm text-slate-500">Loading reporting assignment…</p>}
      {query.error && <p role="alert" className="text-sm text-red-600">{query.error.message}</p>}
      {assignment && <>
        <p className={`text-sm font-medium ${assignment.error ? 'text-red-700' : 'text-slate-700'}`}>{REPORTING_STATE_LABELS[assignment.state]}</p>
        {assignment.managerName && <p className="text-sm text-slate-600">{assignment.managerName}</p>}
        {assignment.error && <p role="alert" className="text-sm text-red-600">{assignment.error}</p>}
        {assignment.warning && <p className="text-sm text-amber-700">{assignment.warning}</p>}
        {assignment.depth !== null && <p className="text-xs text-slate-500">Confirmed hierarchy level: {assignment.depth}</p>}
        <label className="block text-sm font-medium text-slate-700" htmlFor={`reporting-choice-${employeeId}`}>Choose manager or confirm Board reporting</label>
        <select id={`reporting-choice-${employeeId}`} value={target} disabled={save.isPending} onChange={e => { setTarget(e.target.value); save.reset(); }}
          className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm">
          <option value="">Choose a new assignment</option>
          <option value="BOARD">Reports to Board — no individual manager</option>
          {query.data?.options.map(o => <option key={o.target} value={o.target}>{[o.name, o.designation, o.department, o.branch, o.employeeCode].filter(Boolean).join(' · ')}</option>)}
        </select>
        <p className="text-xs text-slate-500">Saving a new assignment replaces any pending selection. Board reporting is an explicit confirmation, not a blank manager field.</p>
        <button type="button" onClick={() => save.mutate()} disabled={!target || save.isPending} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save reporting assignment'}
        </button>
        {save.isSuccess && <p role="status" className="text-sm text-emerald-700">Reporting assignment saved.</p>}
        {save.error && <p role="alert" className="text-sm text-red-600">{save.error.message}</p>}
      </>}
    </section>
  );
}
