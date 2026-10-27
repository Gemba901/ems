"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { EmsService } from "@/services/ems.service";
import InvitationDialog from "./InvitationDialog";
import { INVITATION_STATUS_TEXT } from "./ems-invitations";

const when = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

/** The employee's account invitation: current state, and Send / Resend / Cancel. */
export default function EmployeeInvitationCard({ employeeId, employeeName, token }: { employeeId: string; employeeName: string; token: string }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ems-employee-invitation", employeeId],
    queryFn: () => EmsService.getEmployeeInvitation(employeeId, token),
  });
  const cancel = useMutation({
    mutationFn: () => EmsService.cancelEmployeeInvitation(employeeId, token),
    onSuccess: updated => {
      queryClient.setQueryData(["ems-employee-invitation", employeeId], updated);
      queryClient.invalidateQueries({ queryKey: ["ems-employees"] });
    },
  });
  const invitation = data?.invitation;
  const expired = !!invitation?.expiresAt && new Date(invitation.expiresAt) <= new Date();
  const pending = !!invitation && (invitation.status === "SENT" || invitation.status === "SHARED") && !expired;

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm" aria-labelledby={`invite-${employeeId}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 id={`invite-${employeeId}`} className="flex items-center gap-1.5 font-semibold text-slate-800"><Mail className="h-4 w-4 text-slate-500" /> Account invitation</h3>
        {isLoading ? <p className="mt-1 text-xs text-slate-500">Loading…</p>
          : error ? <p role="alert" className="mt-1 text-xs text-red-600">{(error as Error).message}</p>
          : !invitation ? <p className="mt-1 text-xs text-slate-500">Not invited yet.</p>
          : <div className="mt-1 space-y-0.5 text-xs text-slate-600">
              <p className="font-medium text-slate-800">{expired && (invitation.status === "SENT" || invitation.status === "SHARED") ? "Link expired" : INVITATION_STATUS_TEXT[invitation.status]}
                {invitation.kind === "CONTACT_NOTICE" && " · shared contact, set up in person"}</p>
              {invitation.skipReason && <p>Reason: {invitation.skipReason}</p>}
              {invitation.lastError && <p className="text-red-700">{invitation.lastError}</p>}
              {invitation.destination && <p>To {invitation.destination} by {invitation.channel === "EMAIL" ? "email" : "WhatsApp"}</p>}
              {invitation.sentAt && <p>Last sent {when(invitation.sentAt)}{invitation.sendCount > 1 ? ` · sent ${invitation.sendCount} times` : ""}</p>}
              {pending && invitation.expiresAt && <p>Link valid until {when(invitation.expiresAt)}</p>}
              {invitation.acceptedAt && <p>Accepted {when(invitation.acceptedAt)}</p>}
            </div>}
      </div>
      {!isLoading && !error && invitation?.status !== "ACCEPTED" && <div className="flex gap-2">
        {pending && <button type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {cancel.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Cancel link</button>}
        <button type="button" onClick={() => setDialog(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">{invitation ? "Resend" : "Send invitation"}</button>
      </div>}
    </div>
    {cancel.error && <p role="alert" className="mt-2 text-xs text-red-600">{(cancel.error as Error).message}</p>}
    {dialog && <InvitationDialog title={`Invite ${employeeName}`} accessToken={token}
      selection={{ employeeIds: [employeeId], resend: !!invitation }} onClose={() => setDialog(false)} />}
  </section>;
}
