import { TicketStatus, TicketType } from "@/services/tickets.service";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  ARCHIVED: "Archived",
};

export const STATUS_DOT: Record<TicketStatus, string> = {
  OPEN: "bg-amber-500",
  IN_PROGRESS: "bg-blue-500",
  RESOLVED: "bg-emerald-600",
  ARCHIVED: "bg-slate-400",
};

export const STATUS_BADGE: Record<TicketStatus, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ARCHIVED: "bg-slate-100 text-slate-600 border-slate-200",
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
  DWMS: "DWMS",
  CALENDAR: "Calendar",
  OTHER: "Other",
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

export function StatusPill({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
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
