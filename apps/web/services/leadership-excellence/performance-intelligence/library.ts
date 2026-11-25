import type { Kra, KpiDefinition } from "../performance-planning/types";

export interface LibraryVersion {
  version: number;
  definition: KpiDefinition;
  kra: Kra;
  approvedAt: string;
  approvedBy: string;
  approvedByName: string;
  approvedByRole: string;
  effectiveDate: string;
  reason: string;
}
export interface LibraryEntry {
  definition: KpiDefinition;
  status: "REFERENCE" | "DRAFT" | "IN_REVIEW" | "APPROVED";
  approvedVersion?: number;
  activeVersion?: number;
  effectiveDate?: string;
  revisionReason: string;
  approverId: string;
  versions: LibraryVersion[];
  history: {
    id: string;
    at: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    action: string;
    detail: string;
  }[];
  permissions: {
    canEdit: boolean;
    canSubmit: boolean;
    canApprove: boolean;
    canReturn: boolean;
    canRevise: boolean;
    canAdapt: boolean;
  };
}
export interface LibraryView {
  revision: number;
  today: string;
  canEdit: boolean;
  canApprove: boolean;
  approvers: { id: string; name: string }[];
  kras: Kra[];
  entries: LibraryEntry[];
}
export interface LibraryCommand {
  expectedRevision: number;
  action: "SAVE_DRAFT" | "SUBMIT" | "APPROVE" | "RETURN" | "REVISE";
  definitionId?: string;
  payload: Record<string, unknown>;
}
