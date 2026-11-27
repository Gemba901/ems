"use client";

import { Suspense, useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { ErrorState } from "@/components/patterns/ErrorState";
import { FormField } from "@/components/patterns/FormField";
import { LoadingState } from "@/components/patterns/LoadingState";
import { SectionCard } from "@/components/patterns/SectionCard";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { TypePill } from "@/components/tickets/tickets-ui";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, moduleLabel, STATUS_LABELS, STATUS_OPTIONS, TYPE_LABELS } from "@/lib/tickets";
import { TicketsService, type TicketStatus, type UpdateTicketPayload } from "@/services/tickets.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

function TicketDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const canManage = user?.roleLevel === Role.SUPER_ADMIN || user?.roleLevel === Role.ADMIN;
  const fromQueue = params.get("support") === "1" && canManage;
  const system = fromQueue && params.get("queue") !== "company" &&
    user?.isAdminOrg === true && user.roleLevel === Role.SUPER_ADMIN;
  const previous = fromQueue ? { label: "Support Queue", href: "/settings/tickets" } : { label: "My Tickets", href: "/tickets" };

  const { data: ticket, isLoading, error, refetch } = useQuery({
    queryKey: ["ticket", id, system],
    queryFn: () => TicketsService.getById(id, accessToken!, system),
    enabled: !!accessToken && !!id,
  });

  const [statusChanged, setStatusChanged] = useState<TicketStatus | "">("");
  const [note, setNote] = useState("");
  const updating = useRef(false);

  const update = useMutation({
    mutationFn: (payload: UpdateTicketPayload) => TicketsService.update(id, payload, accessToken!, system),
    onSuccess: (updated, payload) => {
      queryClient.setQueryData(["ticket", id, system], (previous: typeof ticket) => previous && { ...previous, ...updated });
      if (!payload.typeChanged) {
        setStatusChanged("");
        setNote("");
      }
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ticket", id] }),
        ...["tickets-mine", "tickets-company", "tickets-system"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] })),
      ]);
    },
    onSettled: () => { updating.current = false; },
  });

  function save(payload: UpdateTicketPayload) {
    if (!canManage || !accessToken || updating.current) return;
    updating.current = true;
    update.mutate(payload);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (!statusChanged && !trimmedNote) return;
    save({ ...(statusChanged && { statusChanged }), ...(trimmedNote && { note: trimmedNote }) });
  }

  if (isLoading) return <LoadingState label="Loading ticket…" />;
  if (!ticket) return (
    <DetailPageTemplate header={{ title: "Ticket", breadcrumbs: [previous, { label: "Details" }] }}>
      <ErrorState description={error?.message ?? "Ticket not found"} onRetry={() => void refetch()} />
    </DetailPageTemplate>
  );

  return (
    <DetailPageTemplate
      header={{ title: ticket.subject, breadcrumbs: [previous, { label: "Ticket detail" }] }}
      status={ticket.status}
      statusLabel={STATUS_LABELS[ticket.status]}
      details={[
        { label: "Type", value: <TypePill type={ticket.type} /> },
        { label: "Module", value: moduleLabel(ticket.module) },
        { label: "Raised by", value: `${ticket.raisedBy.firstName} ${ticket.raisedBy.lastName}` },
        { label: "Department", value: ticket.department },
        { label: "Raised", value: formatDateTime(ticket.createdAt) },
      ]}
      activity={ticket.updates.map((entry) => ({
        id: entry.id,
        title: [
          entry.statusChanged ? `Status changed to ${STATUS_LABELS[entry.statusChanged]}` : "",
          entry.typeChanged ? `Type changed to ${TYPE_LABELS[entry.typeChanged]}` : "",
        ].filter(Boolean).join(" · ") || "Note added",
        dateTime: entry.createdAt,
        timeLabel: formatDateTime(entry.createdAt),
        actor: `${entry.updatedBy.firstName} ${entry.updatedBy.lastName}`,
        description: entry.note ? <p className="whitespace-pre-wrap">{entry.note}</p> : undefined,
      }))}
    >
      <SectionCard title="Description">
        <p className="whitespace-pre-wrap break-words">{ticket.message}</p>
      </SectionCard>
      {error && <ErrorState title="Unable to refresh ticket" description={error.message} onRetry={() => void refetch()} />}
      {canManage && (
        <SectionCard title="Manage Ticket">
          <form onSubmit={submit} aria-label="Manage Ticket" aria-busy={update.isPending} className="space-y-4">
            <FormField label="Update Status">
              <NativeSelect
                value={statusChanged}
                disabled={update.isPending}
                className="w-full"
                onChange={(event) => setStatusChanged(event.target.value as TicketStatus | "")}
              >
                <option value="">No change</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Note to raiser (optional)">
              <Textarea
                rows={3}
                value={note}
                disabled={update.isPending}
                placeholder="Add context or a resolution note…"
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
            {update.error && <p role="alert" className="text-danger">{update.error.message}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={update.isPending || (!statusChanged && !note.trim())}>
                {update.isPending ? "Saving…" : "Save Update"}
              </Button>
              {ticket.type === "COMPANY_TICKET" && (
                <Button type="button" variant="outline" onClick={() => save({ typeChanged: "SYSTEM_TICKET" })} disabled={update.isPending}>
                  <ArrowUpCircle aria-hidden="true" /> Escalate to System Ticket
                </Button>
              )}
            </div>
          </form>
        </SectionCard>
      )}
    </DetailPageTemplate>
  );
}

export default function TicketDetailPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <Suspense fallback={<LoadingState label="Loading ticket…" />}>
        <TicketDetailContent />
      </Suspense>
    </ProtectedRoute>
  );
}
