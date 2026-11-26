"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { ListPageTemplate } from "@/components/templates/ListPageTemplate";
import type { DataTableColumn } from "@/components/patterns/DataTable";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime, moduleLabel, StatusPill, STATUS_LABELS, STATUS_OPTIONS } from "@/components/tickets/tickets-ui";
import { TicketsService, type Ticket } from "@/services/tickets.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

const columns: DataTableColumn<Ticket>[] = [
  {
    id: "subject",
    header: "Subject",
    cell: (ticket) => (
      <Link
        href={`/tickets/${ticket.id}`}
        className="block min-w-32 max-w-lg whitespace-normal break-words font-medium text-primary hover:underline focus-visible:outline-ring"
      >
        {ticket.subject}
      </Link>
    ),
  },
  { id: "module", header: "Module", cell: (ticket) => moduleLabel(ticket.module) },
  { id: "status", header: "Status", cell: (ticket) => <StatusPill status={ticket.status} /> },
  {
    id: "raised",
    header: "Raised",
    cell: (ticket) => formatDateTime(ticket.createdAt),
    sortValue: (ticket) => new Date(ticket.createdAt).getTime(),
  },
];

export default function MyTicketsPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <MyTicketsList />
    </ProtectedRoute>
  );
}

function MyTicketsList() {
  const { accessToken } = useAuthStore();
  const { data: tickets = [], isLoading, error, refetch } = useQuery({
    queryKey: ["tickets-mine"],
    queryFn: () => TicketsService.getMine(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <ListPageTemplate
      header={{
        title: "My Tickets",
        description: "Raise an issue or request and track its progress.",
        actions: (
          <Link href="/tickets/new" className={buttonVariants()}>
            <Plus aria-hidden="true" /> Raise a Ticket
          </Link>
        ),
      }}
      table={{
        caption: "Tickets you raised",
        rows: tickets,
        columns,
        getRowId: (ticket) => ticket.id,
        searchText: (ticket) => `${ticket.subject} ${moduleLabel(ticket.module)}`,
        filters: [{
          id: "status",
          label: "Status",
          options: STATUS_OPTIONS.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
        }],
        matchesFilters: (ticket, values) => !values.filters.status || ticket.status === values.filters.status,
        loading: isLoading,
        error: error?.message,
        onRetry: () => void refetch(),
        emptyTitle: tickets.length === 0 ? "You haven’t raised any tickets yet" : "No tickets match your filters",
      }}
    />
  );
}
