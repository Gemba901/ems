import { StatusBadge } from "@/components/patterns/StatusBadge";
import { TicketStatus, TicketType } from "@/services/tickets.service";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  ARCHIVED: "Archived",
};

export const TYPE_LABELS: Record<TicketType, string> = {
  SYSTEM_TICKET: "System",
  COMPANY_TICKET: "Company",
};

export const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "ARCHIVED"];

export const MODULE_LABELS: Record<string, string> = {
  SIMS: "Suggestions (SIMS)",
  LEAVE: "Leave",
  ATTENDANCE: "Attendance",
  HR: "HR",
  EMS: "Employee Records",
  DWMS: "RTW",
  CALENDAR: "Calendar",
  OTHER: "Other",
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

export function StatusPill({ status }: { status: TicketStatus }) {
  return <StatusBadge status={status} label={STATUS_LABELS[status]} />;
}

export function TypePill({ type }: { type: TicketType }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
      type === "SYSTEM_TICKET" ? "border-purple-200 bg-purple-50 text-purple-700" : "border-slate-200 bg-white text-slate-600"
    }`}>
      {TYPE_LABELS[type]}
    </span>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
