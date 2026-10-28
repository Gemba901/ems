/** Shared display tones, not workflow/authorization rules.
 * Sources: Prisma lifecycle enums, frontend status/state unions and derived
 * attendance/audit/ingestion states. Tests detect new unmapped enum members.
 * ACTIVE is informational (ongoing); CANCELLED preserves Steel's danger tone.
 */
export type StatusTone = "success" | "warning" | "info" | "danger" | "neutral";

export const STATUS_TONE_CLASSES: Readonly<Record<StatusTone, string>> =
  Object.freeze({
    success: "bg-success-subtle text-success",
    warning: "bg-warning-subtle text-warning",
    info: "bg-info-subtle text-info",
    danger: "bg-danger-subtle text-danger",
    neutral: "bg-neutral-subtle text-neutral",
  });

export const STATUS_TONE_MAP = Object.freeze({
  ABSCONDED: "danger",
  ABSENT: "danger",
  ACCEPTED: "success",
  ACTIVE: "info",
  APPROVAL_PENDING: "warning",
  APPROVED: "success",
  APPROVED_FOR_IMPLEMENTATION: "success",
  ARCHIVED: "neutral",
  AVAILABLE: "success",
  AWAITING_PARENT: "warning",
  AWAITING_VERIFICATION: "warning",
  BLACKLISTED: "danger",
  CANCELLED: "danger",
  CAPTURED: "success",
  CLOCKED_IN: "success",
  CLOCKED_OUT: "success",
  CLOSED: "success",
  COMPLETED: "success",
  CONFIRMED: "success",
  CREATED: "success",
  CONTRACT_ENDED: "neutral",
  DAY_OFF: "neutral",
  DECIDED: "success",
  DECLINED: "danger",
  DONE: "success",
  DONE_WITH_EXCEPTION: "warning",
  DOWN: "danger",
  DRAFT: "neutral",
  DUE_SOON: "warning",
  DUE_TODAY: "warning",
  ERROR: "danger",
  EXPIRED: "danger",
  FAILED: "danger",
  GOOD_WORK_IN_PROGRESS: "info",
  HOLIDAY: "neutral",
  IMPLEMENTED: "success",
  IMPRACTICAL: "danger",
  INACTIVE: "neutral",
  INSIDE: "success",
  IN_IMPLEMENTATION: "info",
  IN_PROGRESS: "info",
  LEAVE: "neutral",
  LESS_THAN_50: "warning",
  LOW_ACCURACY: "warning",
  MAINTENANCE: "warning",
  MELTING: "info",
  MISSED: "danger",
  MISSING: "warning",
  MOVED_TO_SGA: "info",
  NEVER_AUDITED: "warning",
  NOT_APPLICABLE: "neutral",
  NOT_AVAILABLE: "warning",
  NOT_DONE: "warning",
  NOT_IN: "warning",
  NOT_JOINED: "neutral",
  NOT_STARTED: "neutral",
  NO_APPROVED_PLACE: "warning",
  NO_LOCATION: "warning",
  ONBOARDING: "info",
  ON_HOLD: "warning",
  ON_LEAVE: "neutral",
  ON_TRACK: "success",
  OPEN: "info",
  OUTSIDE: "danger",
  OVERDUE: "danger",
  PARTIAL: "warning",
  PARTLY_DONE: "warning",
  PENDING: "warning",
  PENDING_HOD_APPROVAL: "warning",
  PENDING_HOD_PRE_REVIEW: "warning",
  PENDING_VERIFICATION: "warning",
  PLANNED: "neutral",
  PO_ISSUED: "info",
  PRESENT: "success",
  PREVIOUSLY_IMPLEMENTED: "success",
  PROBATION: "warning",
  PROCESSING: "info",
  PROVISIONING: "info",
  QUEUED: "neutral",
  READY: "success",
  REJECTED: "danger",
  RELEASED: "success",
  RESIGNED: "neutral",
  RESOLVED: "success",
  RETIRED: "neutral",
  RETURNED_FOR_REVISION: "warning",
  RETURNED_FOR_REWORK: "warning",
  SAVED_FOR_LATER: "neutral",
  SELECTED_FOR_SGA: "info",
  SHIFTED_TO_SGA: "info",
  SLOW_PROGRESS: "warning",
  SUBMITTED: "info",
  SUPERSEDED: "neutral",
  SUSPENDED: "danger",
  TENTATIVE: "warning",
  TERMINATED: "danger",
  TODAY: "info",
  TODO: "neutral",
  UNDER_CONSULTATION: "info",
  UNDER_REVIEW: "info",
  UPCOMING: "neutral",
  VERIFIED: "success",
  VERIFIED_CLOSED: "success",
  VERY_SLOW_WORK_IN_PROGRESS: "warning",
  WAITING_FOR_REVIEW: "warning",
  WORK_IN_PROGRESS: "info",
} as const satisfies Record<string, StatusTone>);

export type KnownStatus = keyof typeof STATUS_TONE_MAP;

/** API enums are uppercase; tolerate legacy casing and surrounding whitespace.
 * Unknown/untrusted strings use neutral, including Object prototype names.
 */
export function statusToTone(status: string | null | undefined): StatusTone {
  if (typeof status !== "string") return "neutral";
  const key = status.trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(STATUS_TONE_MAP, key)
    ? STATUS_TONE_MAP[key as KnownStatus]
    : "neutral";
}

export function statusBadgeClass(status: string | null | undefined): string {
  return STATUS_TONE_CLASSES[statusToTone(status)];
}
