"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import type { DataTableColumn } from "@/components/patterns/DataTable";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { ListPageTemplate } from "@/components/templates/ListPageTemplate";
import { Button } from "@/components/ui/button";
import { formatDateTime, moduleLabel, STATUS_LABELS, STATUS_OPTIONS } from "@/lib/tickets";
import { TicketsService, type Ticket } from "@/services/tickets.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

type Queue = "company" | "system";
const queues = [{ id: "company", label: "Company" }, { id: "system", label: "System" }] as const;

function raiser(ticket: Ticket) {
  return `${ticket.raisedBy.firstName} ${ticket.raisedBy.lastName}`;
}

function columns(queue: Queue): DataTableColumn<Ticket>[] {
  return [
    {
      id: "subject",
      header: "Subject",
      cell: (ticket) => (
        <Link
          href={`/tickets/${ticket.id}?support=1&queue=${queue}`}
          className="block min-w-32 max-w-lg whitespace-normal break-words font-medium text-primary hover:underline focus-visible:outline-ring"
        >
          {ticket.subject}
        </Link>
      ),
    },
    { id: "module", header: "Module", cell: (ticket) => moduleLabel(ticket.module) },
    {
      id: "raiser",
      header: "Raised by",
      cell: (ticket) => (
        <>
          {raiser(ticket)}
          {ticket.department && <p className="text-caption text-muted-foreground">{ticket.department}</p>}
        </>
      ),
    },
    { id: "status", header: "Status", cell: (ticket) => <StatusBadge status={ticket.status} label={STATUS_LABELS[ticket.status]} /> },
    {
      id: "raised",
      header: "Raised",
      cell: (ticket) => formatDateTime(ticket.createdAt),
      sortValue: (ticket) => new Date(ticket.createdAt).getTime(),
    },
  ];
}

function SupportQueue() {
  const { accessToken, user } = useAuthStore();
  const canViewSystem = user?.isAdminOrg === true && user.roleLevel === Role.SUPER_ADMIN;
  const [selectedQueue, setSelectedQueue] = useState<Queue>("company");
  const queue = canViewSystem ? selectedQueue : "company";
  const { data: tickets = [], isLoading, error, refetch } = useQuery({
    queryKey: [`tickets-${queue}`],
    queryFn: () => queue === "system" ? TicketsService.getSystemTickets(accessToken!) : TicketsService.getCompanyTickets(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <ListPageTemplate
      key={queue}
      header={{
        title: "Tickets",
        description: "Review and resolve tickets raised by your team.",
        breadcrumbs: [{ label: "Settings", href: "/settings" }, { label: "Support Queue" }],
      }}
      beforeTable={canViewSystem && (
        <div role="group" aria-label="Ticket queue" className="flex flex-wrap gap-2">
          {queues.map(({ id, label }) => (
            <Button key={id} type="button" aria-pressed={queue === id} variant={queue === id ? "default" : "outline"} onClick={() => setSelectedQueue(id)}>
              {label}
            </Button>
          ))}
        </div>
      )}
      table={{
        caption: queue === "company" ? "Company tickets" : "System tickets",
        rows: tickets,
        columns: columns(queue),
        getRowId: (ticket) => ticket.id,
        searchText: (ticket) => `${ticket.subject} ${moduleLabel(ticket.module)} ${raiser(ticket)} ${ticket.department ?? ""}`,
        filters: [{
          id: "status",
          label: "Status",
          options: STATUS_OPTIONS.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
        }],
        matchesFilters: (ticket, values) => !values.filters.status || ticket.status === values.filters.status,
        loading: isLoading,
        error: error?.message,
        onRetry: () => void refetch(),
        emptyTitle: tickets.length ? "No tickets match your filters" : `No ${queue} tickets yet`,
      }}
    />
  );
}

export default function TicketsSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}>
      <SupportQueue />
    </ProtectedRoute>
  );
}
