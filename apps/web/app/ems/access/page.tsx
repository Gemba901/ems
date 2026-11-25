"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { EmsAccessService, type AccessResult } from "@/services/ems-access.service";
import { accessLabel } from "@/components/ems/ChangeAccessDialog";

/**
 * Access suggestions: people an import suggested for access above Employee. Everyone registered as Employee;
 * an Admin approves (gives the suggested access) or declines here. HR can see the list.
 */
export default function AccessSuggestionsPage() {
  const { accessToken, user } = useAuthStore();
  const client = useQueryClient();
  const [batchId, setBatchId] = useState<string | undefined>();
  useEffect(() => { setBatchId(new URLSearchParams(window.location.search).get("batch") || undefined); }, []);
  const query = useQuery({
    queryKey: ["ems-access-suggestions", user?.organizationId, batchId ?? "all"],
    queryFn: () => EmsAccessService.suggestions(accessToken!, batchId), enabled: !!accessToken,
  });
  const rows = useMemo(() => query.data?.suggestions ?? [], [query.data]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState(""), [result, setResult] = useState<{ decision: string; value: AccessResult } | null>(null);
  useEffect(() => { setPicked(previous => new Set([...previous].filter(id => rows.some(r => r.employeeId === id)))); }, [rows]);
  const decide = useMutation({
    mutationFn: (decision: "APPROVE" | "DECLINE") => EmsAccessService.decide({
      employeeIds: [...picked], decision, reason: reason.trim() || undefined,
      expectedRevisions: Object.fromEntries(rows.filter(r => picked.has(r.employeeId)).map(r => [r.employeeId, r.revision])),
    }, accessToken!),
    onSuccess: (value, decision) => {
      setResult({ decision, value }); setReason(""); setPicked(new Set());
      void client.invalidateQueries({ queryKey: ["ems-access-suggestions"] });
      void client.invalidateQueries({ queryKey: ["ems-access"] });
    },
  });
  const canDecide = !!query.data?.canDecide, busy = decide.isPending;
  const all = rows.length > 0 && rows.every(r => picked.has(r.employeeId));
  const toggle = (id: string) => setPicked(p => { const next = new Set(p); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/ems/employees" aria-label="Back to Employees" className="text-slate-500 hover:text-purple-800"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Access suggestions</h1>
          <p className="text-sm text-slate-500">Everyone registers as Employee. An Admin approves or declines anything higher that an import or HR suggested.</p>
        </div>
      </div>
      {batchId && <p className="text-sm text-slate-600">From one import only. <Link href="/ems/access" onClick={() => setBatchId(undefined)} className="font-medium text-purple-900 underline">Show all imports</Link></p>}

      {result && <div role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
        {result.value.changed} {result.decision === "APPROVE" ? "approved" : "declined"}.
        {result.value.skipped.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">
          {result.value.skipped.map(s => <li key={s.employeeId}><strong>{s.name}</strong>: {s.reason}</li>)}</ul>}
      </div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {canDecide && picked.size > 0 && <div className="flex flex-wrap items-end gap-2 border-b border-purple-100 bg-purple-50/60 px-4 py-3 text-xs text-purple-950">
          <span className="font-semibold">{picked.size} selected</span>
          <label className="min-w-48 flex-1">Reason (optional, kept in each person's access history)
            <input value={reason} maxLength={500} disabled={busy} onChange={e => setReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800" /></label>
          <button type="button" disabled={busy} onClick={() => decide.mutate("APPROVE")} className="rounded-lg bg-purple-900 px-3 py-2 font-semibold text-white hover:bg-purple-950 disabled:opacity-50">Approve</button>
          <button type="button" disabled={busy} onClick={() => decide.mutate("DECLINE")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Decline</button>
        </div>}
        {decide.error && <p role="alert" className="px-4 py-2 text-sm text-red-700">{(decide.error as Error).message}</p>}
        {query.isPending ? <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
          : query.error ? <p role="alert" className="px-4 py-6 text-sm text-red-700">{(query.error as Error).message}</p>
          : !rows.length ? <p className="py-12 text-center text-sm text-slate-500">No suggestions waiting.</p>
          : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500"><tr>
              {canDecide && <th scope="col" className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all" checked={all}
                onChange={() => setPicked(all ? new Set() : new Set(rows.map(r => r.employeeId)))} /></th>}
              {["Name", "Department", "Job title", "Now", "Suggested", "From"].map(h => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.employeeId} className="align-top">
              {canDecide && <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.has(r.employeeId)} onChange={() => toggle(r.employeeId)} /></td>}
              <td className="min-w-40 px-4 py-3"><Link href={`/ems/employees/${encodeURIComponent(r.employeeId)}`} className="font-semibold text-purple-900 underline underline-offset-2">{r.name}</Link>
                {r.employeeCode && <span className="block font-mono text-xs text-slate-500">{r.employeeCode}</span>}</td>
              <td className="px-4 py-3 text-slate-600">{r.department ?? "—"}</td>
              <td className="px-4 py-3 text-slate-600">{r.jobTitle ?? "—"}</td>
              <td className="px-4 py-3 text-slate-600">{accessLabel(r.role)}{!r.accountLinked && <span className="block text-xs text-amber-800">No account linked yet</span>}</td>
              <td className="px-4 py-3"><span className="font-semibold text-slate-900">{accessLabel(r.suggestedAccess)}</span>
                {r.source !== 'HR' && r.sheetValue && <span className="block text-xs text-slate-500">Sheet: “{r.sheetValue}”</span>}</td>
              <td className="min-w-48 px-4 py-3 text-xs text-slate-600">{r.source === 'HR'
                ? <><span className="font-semibold text-slate-800">{r.suggestedBy ?? 'HR'}</span><span className="block break-words">“{r.suggestionReason}”</span></>
                : 'Import'}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
      {!canDecide && rows.length > 0 && <p className="text-xs text-slate-500">Only an Admin can approve or decline.</p>}
    </div>
  </ProtectedRoute>;
}
