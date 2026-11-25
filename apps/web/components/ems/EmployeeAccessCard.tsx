"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmsAccessService, type AccessChange } from "@/services/ems-access.service";
import ChangeAccessDialog, { accessLabel } from "./ChangeAccessDialog";

const ROLE_TONE: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-900", ADMIN: "bg-purple-100 text-purple-900", MANAGEMENT: "bg-blue-100 text-blue-800",
  HR: "bg-teal-100 text-teal-800", HOD: "bg-amber-100 text-amber-800", EMPLOYEE: "bg-slate-100 text-slate-700",
};
const when = (value: string) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function historyLine(change: AccessChange) {
  if (change.kind === "DECLINED") return `Declined suggested ${accessLabel(change.suggestedRole)}`;
  if (change.kind === "SUGGESTED") return `Suggested ${accessLabel(change.suggestedRole)}`;
  const move = change.fromRole === change.toRole ? accessLabel(change.toRole) : `${accessLabel(change.fromRole)} → ${accessLabel(change.toRole)}`;
  return change.kind === "APPROVED" ? `Approved suggestion: ${move}` : move;
}

/**
 * Access on a profile: the person's actual company role (read-only here), what their import suggested, and the access
 * history. Admins can Change access and approve or decline a suggestion; HR sees it all read-only.
 */
export default function EmployeeAccessCard({ employeeId, name, token }: { employeeId: string; name: string; token: string }) {
  const client = useQueryClient();
  const key = ["ems-access", employeeId];
  const access = useQuery({ queryKey: key, queryFn: () => EmsAccessService.employee(employeeId, token) });
  const [changing, setChanging] = useState(false), [showAll, setShowAll] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: ["employee", employeeId] });
    void client.invalidateQueries({ queryKey: ["ems-access-suggestions"] });
  };
  const decide = useMutation({
    mutationFn: (decision: "APPROVE" | "DECLINE") => EmsAccessService.decide({ employeeIds: [employeeId], decision,
      expectedRevisions: { [employeeId]: access.data!.revision } }, token),
    onSuccess: (result, decision) => {
      setNotice(result.skipped[0]?.reason ?? (decision === "APPROVE" ? "Suggestion approved." : "Suggestion declined."));
      refresh();
    },
  });

  if (access.isPending) return <p className="text-xs text-slate-500" role="status">Loading access…</p>;
  if (access.error || !access.data) return <p role="alert" className="text-xs text-red-700">{(access.error as Error)?.message ?? "Access could not load."}</p>;
  const data = access.data;
  const pending = data.suggestedAccessState === "PENDING" && data.suggestedAccess;
  const history = showAll ? data.history : data.history.slice(0, 3);

  return <div className="space-y-3" data-access-card>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={`inline-block rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${ROLE_TONE[data.role ?? ""] ?? "bg-slate-100 text-slate-600"}`}>{accessLabel(data.role)}</span>
      {data.canChange && data.accountLinked && <button type="button" onClick={() => { setNotice(null); setChanging(true); }}
        className="rounded-lg border border-purple-900 px-2.5 py-1 text-xs font-semibold text-purple-900 hover:bg-purple-50">Change access</button>}
      {data.canSuggest && <button type="button" onClick={() => { setNotice(null); setChanging(true); }}
        className="rounded-lg border border-purple-900 px-2.5 py-1 text-xs font-semibold text-purple-900 hover:bg-purple-50">Suggest a change</button>}
    </div>
    {!data.accountLinked && <p className="text-xs text-slate-500">No BEES account linked yet. Access can be changed once they have one.</p>}

    {pending && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" data-access-suggestion>
      {data.suggestedBy
        ? <p>{data.suggestedBy.by ?? "HR"} suggested <strong>{accessLabel(data.suggestedAccess)}</strong>: “{data.suggestedBy.reason}”. Waiting for an Admin.</p>
        : <p>Their import suggested <strong>{accessLabel(data.suggestedAccess)}</strong>{data.sheetValue ? ` (“${data.sheetValue}”)` : ""}. Waiting for an Admin.</p>}
      {data.canChange && <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={decide.isPending || !data.accountLinked} onClick={() => decide.mutate("APPROVE")}
          className="rounded-lg bg-purple-900 px-2.5 py-1 font-semibold text-white hover:bg-purple-950 disabled:opacity-50">Approve {accessLabel(data.suggestedAccess)}</button>
        <button type="button" disabled={decide.isPending} onClick={() => decide.mutate("DECLINE")}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Decline</button>
      </div>}
    </div>}
    {!pending && data.suggestedAccessState && <p className="text-xs text-slate-500">Suggested {accessLabel(data.suggestedAccess)} · {data.suggestedAccessState === "APPROVED" ? "approved" : "declined"}</p>}
    {(notice || decide.error) && <p role="status" className="text-xs text-slate-700">{notice ?? (decide.error as Error).message}</p>}

    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">Access history</p>
      {data.history.length ? <ol className="space-y-1.5">
        {history.map(change => <li key={change.id} className="text-xs text-slate-700">
          <span className="font-semibold">{historyLine(change)}</span>
          <span className="block text-slate-500">{when(change.changedAt)} · {change.actorName ?? "An Admin"} · {change.reason}</span>
        </li>)}
      </ol> : <p className="text-xs text-slate-500">No changes since registration.</p>}
      {data.history.length > 3 && <button type="button" onClick={() => setShowAll(v => !v)} className="mt-1 text-xs font-medium text-purple-900 underline">
        {showAll ? "Show fewer" : `Show all ${data.history.length}${data.hasMoreHistory ? "+" : ""}`}</button>}
    </div>

    {changing && <ChangeAccessDialog token={token} people={[{ id: employeeId, name, role: data.role, revision: data.revision }]}
      mode={data.canChange ? "change" : "suggest"} onClose={() => setChanging(false)}
      onDone={result => { setNotice(result.changed ? (data.canChange ? "Access changed." : "Suggestion sent to the Admins.") : null); refresh(); }} />}
  </div>;
}
