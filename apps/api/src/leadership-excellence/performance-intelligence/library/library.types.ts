import type {
  KpiDefinition,
  Kra,
} from '../../performance-planning/planning.types';

export interface LibraryActor {
  userId: string;
  name: string;
  role: string;
}
export interface LibraryHistory {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  detail: string;
}
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
export interface DefinitionLibraryRecord {
  definitionId: string;
  draft: KpiDefinition;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
  approverId: string;
  revisionReason: string;
  effectiveDate: string;
  versions: LibraryVersion[];
  history: LibraryHistory[];
}
export interface DefinitionLibrary {
  schema: 1;
  records: DefinitionLibraryRecord[];
}
export interface LibraryPermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canRevise: boolean;
  canAdapt: boolean;
}
export interface LibraryEntry {
  definition: KpiDefinition;
  status: 'REFERENCE' | DefinitionLibraryRecord['status'];
  approvedVersion?: number;
  activeVersion?: number;
  effectiveDate?: string;
  approverId: string;
  revisionReason: string;
  versions: LibraryVersion[];
  history: LibraryHistory[];
  permissions: LibraryPermissions;
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
  action: 'SAVE_DRAFT' | 'SUBMIT' | 'APPROVE' | 'RETURN' | 'REVISE';
  definitionId?: string;
  payload: Record<string, unknown>;
}
export interface LibraryContext {
  actor: LibraryActor;
  approvers: { id: string; name: string }[];
  today: string;
  at: string;
}
