import type { TicketStatus, TicketType } from "@/services/tickets.service";

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

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
