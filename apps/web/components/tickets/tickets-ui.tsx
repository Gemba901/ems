import { StatusBadge } from "@/components/patterns/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/tickets";
import type { TicketStatus, TicketType } from "@/services/tickets.service";

export function StatusPill({ status }: { status: TicketStatus }) {
  return <StatusBadge status={status} label={STATUS_LABELS[status]} />;
}

export function TypePill({ type }: { type: TicketType }) {
  return <Badge variant={type === "SYSTEM_TICKET" ? "info" : "neutral"}>{TYPE_LABELS[type]}</Badge>;
}
