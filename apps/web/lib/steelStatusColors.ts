// Semantic status colors for the Steel Manufacturing module (P01-P06).
//
// Process identity color (STEEL_PROCESSES[code].color) answers "which
// process is this" — P05 is red because Melting is red, full stop. This
// file answers a completely different question, "is this record OK right
// now", and must never be mixed with process identity. Before this file
// existed, every list/table/panel across P01-P06 hand-rolled its own
// STATUS_STYLES map; they'd all converged on the same five colors by
// convention but had already started drifting (P05's furnace panel used
// red for both MELTING — a normal active state — and DOWN — an actual
// problem, conflating "busy" with "broken" purely because red happened to
// be lying around). Centralizing removes that drift risk.
export type SemanticStatus = "SUCCESS" | "WARNING" | "ERROR" | "INFO" | "NEUTRAL";

export const SEMANTIC_BADGE_CLASSES: Record<SemanticStatus, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700",
  WARNING: "bg-amber-50 text-amber-700",
  ERROR: "bg-red-50 text-red-700",
  INFO: "bg-blue-50 text-blue-700",
  NEUTRAL: "bg-slate-100 text-slate-600",
};

// Every real backend status string used across P01-P06's record statuses
// (SteelPlanOverallStatus, SteelSourcingStatus, SteelIntakeStatus,
// SteelChargeStatus, SteelMeltingStatus, SteelHeatApprovalStatus) plus
// Furnace.status and the P05 dashboard's derived furnace display status.
// Values are the record's actual enum members — nothing invented.
export const STATUS_SEMANTIC_MAP: Record<string, SemanticStatus> = {
  // Common lifecycle statuses (P01-P06)
  DRAFT: "NEUTRAL",
  IN_PROGRESS: "INFO",
  ON_HOLD: "WARNING",
  CLOSED: "SUCCESS",
  RELEASED: "SUCCESS",
  CANCELLED: "ERROR",
  REJECTED: "ERROR",
  // P02 sourcing-specific
  PO_ISSUED: "INFO",
  // Furnace master data (P05)
  READY: "SUCCESS",
  MAINTENANCE: "WARNING",
  DOWN: "ERROR",
  RETIRED: "NEUTRAL",
  // P05 dashboard-derived furnace display status (never stored — see FurnaceStatusPanel)
  MELTING: "INFO",
};

export function statusToSemantic(status: string): SemanticStatus {
  return STATUS_SEMANTIC_MAP[status] ?? "NEUTRAL";
}

/** Tailwind classes for a status Badge — the one function every process's list/table should call instead of a local STATUS_STYLES map. */
export function statusBadgeClass(status: string): string {
  return SEMANTIC_BADGE_CLASSES[statusToSemantic(status)];
}
