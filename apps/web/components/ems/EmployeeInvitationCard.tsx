"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { EmsService } from "@/services/ems.service";
import InvitationDialog from "./InvitationDialog";
import { INVITATION_STATUS_TEXT } from "./ems-invitations";
import { Button } from "@/components/ui/button";

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
  const accountLink = data?.accountLink;
  const expired = !!invitation?.expiresAt && new Date(invitation.expiresAt) <= new Date();
  const pending = !!invitation && (invitation.status === "SENT" || invitation.status === "SHARED") && !expired;

  return <section className="rounded-2xl border border-border bg-card p-4 text-sm" aria-labelledby={`invite-${employeeId}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 id={`invite-${employeeId}`} className="flex items-center gap-1.5 font-semibold text-foreground"><Mail className="h-4 w-4 text-muted-foreground" /> Account invitation</h3>
        {isLoading ? <p className="mt-1 text-xs text-muted-foreground">Loading…</p>
          : error ? <p role="alert" className="mt-1 text-xs text-danger">{(error as Error).message}</p>
          : !invitation ? <p className="mt-1 text-xs text-muted-foreground">Not invited yet.</p>
          : <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{expired && (invitation.status === "SENT" || invitation.status === "SHARED") ? "Link expired" : INVITATION_STATUS_TEXT[invitation.status]}
                {invitation.kind === "CONTACT_NOTICE" && " · shared contact, set up in person"}</p>
              {accountLink && <div className="rounded border border-warning/30 bg-warning-subtle p-2 text-warning">
                <p>{accountLink.status === "ACCEPTED" ? "Employee accepted account linking." : accountLink.status === "DECLINED" ? "Employee declined. HR review is required." : accountLink.status === "CANCELLED" ? "Account link cancelled. New company access has not been granted." : expired ? "Verification link expired. Review the details before resending." : accountLink.verifiedAt ? "Existing email verified; company access still awaits acceptance." : "Existing-account verification required. This request has not granted new login access."}</p>
                {accountLink.contactMatches !== null && <p>{accountLink.contactMatches ? "Imported email matches the existing contact; verification is still required." : "Imported email differs from the existing contact. Verification uses the existing contact only."}</p>}
                <p>Verification is sent directly by email. HR cannot view the destination or copy the verification link.</p>
              </div>}
              {invitation.skipReason && <p>Reason: {invitation.skipReason}</p>}
              {invitation.lastError && <p className="text-danger">{invitation.lastError}</p>}
              {invitation.destination && <p>To {invitation.destination} by {invitation.channel === "EMAIL" ? "email" : "WhatsApp"}</p>}
              {invitation.sentAt && <p>Last sent {when(invitation.sentAt)}{invitation.sendCount > 1 ? ` · sent ${invitation.sendCount} times` : ""}</p>}
              {pending && invitation.expiresAt && <p>Link valid until {when(invitation.expiresAt)}</p>}
              {invitation.acceptedAt && <p>Accepted {when(invitation.acceptedAt)}</p>}
            </div>}
      </div>
      {!isLoading && !error && invitation?.status !== "ACCEPTED" && accountLink?.status !== "DECLINED" && <div className="flex gap-2">
        {pending && <Button variant="ghost" type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 h-auto whitespace-normal">
          {cancel.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Cancel link</Button>}
        <Button variant="ghost" type="button" onClick={() => setDialog(true)}
          className="rounded-lg bg-info px-3 py-1.5 text-xs font-semibold text-info-foreground hover:bg-info h-auto whitespace-normal">{invitation ? "Resend" : "Send invitation"}</Button>
      </div>}
    </div>
    {cancel.error && <p role="alert" className="mt-2 text-xs text-danger">{(cancel.error as Error).message}</p>}
    {dialog && <InvitationDialog title={`Invite ${employeeName}`} accessToken={token}
      selection={{ employeeIds: [employeeId], resend: !!invitation }} onClose={() => setDialog(false)} />}
  </section>;
}
