"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { FormField } from "@/components/patterns/FormField";
import { FormPageTemplate } from "@/components/templates/FormPageTemplate";
import { MODULE_LABELS } from "@/components/tickets/tickets-ui";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TicketsService, TICKET_MODULES, type CreateTicketPayload } from "@/services/tickets.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

const SUBJECT_MAX = 150;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

export default function NewTicketPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <NewTicketForm />
    </ProtectedRoute>
  );
}

function NewTicketForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const submitting = useRef(false);

  const [module, setModule] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string>();

  const create = useMutation({
    mutationFn: ({ payload, token }: { payload: CreateTicketPayload; token: string }) =>
      TicketsService.create(payload, token),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["tickets-mine"] });
      router.push(`/tickets/${created.id}`);
    },
    onError: (cause) => {
      submitting.current = false;
      setError(cause instanceof Error && cause.message ? cause.message : "Failed to raise ticket");
    },
  });

  const messageLength = message.trim().length;
  const canSubmit = !!accessToken && !!module && !!department.trim() && !!subject.trim() && messageLength >= MESSAGE_MIN;
  const locked = create.isPending || create.isSuccess;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !accessToken || submitting.current) return;
    submitting.current = true;
    setError(undefined);
    create.mutate({
      token: accessToken,
      payload: { module, subject: subject.trim(), message: message.trim(), department: department.trim() },
    });
  }

  return (
    <FormPageTemplate
      header={{
        title: "Raise a Ticket",
        description: "Describe the issue or request. An administrator will follow up.",
        breadcrumbs: [{ label: "My Tickets", href: "/tickets" }, { label: "Raise a Ticket" }],
      }}
      sections={[
        {
          id: "ticket-details",
          title: "Ticket details",
          content: (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Which area does this concern?" required>
                  <NativeSelect
                    value={module}
                    disabled={locked}
                    className="w-full"
                    onChange={(event) => { setModule(event.target.value); setError(undefined); }}
                  >
                    <option value="">Select an area…</option>
                    {TICKET_MODULES.map((key) => (
                      <option key={key} value={key}>{MODULE_LABELS[key]}</option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Your Department" required>
                  <Input
                    value={department}
                    disabled={locked}
                    placeholder="e.g. Production, HR, Finance"
                    onChange={(event) => { setDepartment(event.target.value); setError(undefined); }}
                  />
                </FormField>
              </div>
              <FormField label="Subject" required description={`${subject.length}/${SUBJECT_MAX} characters`}>
                <Input
                  value={subject}
                  disabled={locked}
                  maxLength={SUBJECT_MAX}
                  placeholder="Brief summary of the issue"
                  onChange={(event) => { setSubject(event.target.value.slice(0, SUBJECT_MAX)); setError(undefined); }}
                />
              </FormField>
              <FormField
                label="Details"
                required
                description={
                  <>
                    {message.length}/{MESSAGE_MAX} characters. Minimum {MESSAGE_MIN}.
                    {message.length > 0 && messageLength < MESSAGE_MIN && (
                      <span className="ml-1 text-warning">{MESSAGE_MIN - messageLength} more characters needed.</span>
                    )}
                  </>
                }
              >
                <Textarea
                  rows={6}
                  value={message}
                  disabled={locked}
                  maxLength={MESSAGE_MAX}
                  placeholder="Describe what’s happening, when it started, and any steps you’ve tried."
                  onChange={(event) => { setMessage(event.target.value.slice(0, MESSAGE_MAX)); setError(undefined); }}
                />
              </FormField>
            </div>
          ),
        },
      ]}
      error={error}
      onSubmit={handleSubmit}
      actions={{
        submitLabel: "Submit Ticket",
        pending: locked,
        disabled: !canSubmit,
        onCancel: () => router.push("/tickets"),
      }}
    />
  );
}
