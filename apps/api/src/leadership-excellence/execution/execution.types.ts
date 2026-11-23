import type {
  Assignment,
  DeliveryAction,
  Goal,
  KpiDefinition,
  Objective,
  PlanningActor,
  PlanningPerson,
  TargetPeriod,
} from '../performance-planning/planning.types';

export interface ExecutionHistory {
  at: string;
  by: string;
  name: string;
  event: string;
  detail: string;
}
export interface ExecutionGoal {
  key: string;
  documentId: string;
  version: number;
  cycle: string;
  kind: 'COMPANY' | 'DEPARTMENT' | 'TEAM' | 'POSITION' | 'INDIVIDUAL';
  departmentId: string;
  scopeId: string;
  planTitle: string;
  itemKind: 'OBJECTIVE' | 'GOAL';
  item: Goal | Objective;
  parentKey: string | null;
  /** Minimal approved parent summary; never contains confidential SWOT. */
  parent: { code: string; title: string; kind: string } | null;
  personal: boolean;
  canRequestSupport: boolean;
  current: boolean;
}
export interface ExecutionAssignment {
  key: string;
  documentId: string;
  version: number;
  cycle: string;
  departmentId: string;
  goalKey: string;
  goalTitle: string;
  scope: string;
  current: boolean;
  effectiveDate: string;
  assignment: Assignment;
  definition: KpiDefinition;
  periods: TargetPeriod[];
  /** New observations allowed here; existing historical observations keep their pinned version. */
  entryPeriodIds: string[];
  canEnter: boolean;
  canVerify: boolean;
}
export interface ExecutionAction {
  key: string;
  documentId: string;
  version: number;
  cycle: string;
  departmentId: string;
  goalKey: string;
  goalTitle: string;
  action: DeliveryAction;
  canUpdate: boolean;
  canCheck: boolean;
}
export interface ExecutionResult {
  id: string;
  assignmentKey: string;
  periodId: string;
  periodStart?: string;
  periodEnd?: string;
  inputA: number | null;
  inputB: number | null;
  actual: number | null;
  note: string;
  evidence: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'RETURNED';
  updatedAt: string;
  updatedBy: string;
  submittedAt: string | null;
  verificationNote: string;
  /** A correction leaves the previous official result intact until Area 05 verifies. */
  official: {
    actual: number;
    inputA: number | null;
    inputB: number | null;
    verifiedAt: string;
    verifiedBy: string;
  } | null;
  history: ExecutionHistory[];
}
export interface ExecutionActionUpdate {
  actionKey: string;
  status:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'BLOCKED'
    | 'PENDING_CHECK'
    | 'COMPLETED';
  progress: number;
  note: string;
  evidence: string;
  delayReason: string;
  updatedAt: string;
  updatedBy: string;
  history: ExecutionHistory[];
}
export interface ExecutionSupportRequest {
  id: string;
  goalKey: string;
  actionKey: string | null;
  title: string;
  request: string;
  requestorId: string;
  assignedToId: string;
  dueDate: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  response: string;
  createdAt: string;
  /** First acceptance by the assigned recipient; absent on older records. */
  acknowledgement?: { at: string; by: string; name: string } | null;
  history: ExecutionHistory[];
  canAcknowledge?: boolean;
  canRespond?: boolean;
  canClose?: boolean;
  /** Read-only projection context for support assignees without plan access. */
  cycle?: string;
  goalTitle?: string;
}
export interface ExecutionState {
  schema: 1;
  results: ExecutionResult[];
  actionUpdates: ExecutionActionUpdate[];
  supportRequests: ExecutionSupportRequest[];
}
export interface ExecutionView extends ExecutionState {
  revision: number;
  planningRevision: number;
  today: string;
  actor: PlanningActor;
  canViewDepartment: boolean;
  references: {
    departments: { id: string; name: string }[];
    people: PlanningPerson[];
  };
  goals: ExecutionGoal[];
  assignments: ExecutionAssignment[];
  actions: ExecutionAction[];
}
export interface ExecutionCommand {
  expectedRevision: number;
  action:
    | 'SAVE_RESULTS'
    | 'SUBMIT_RESULTS'
    | 'UPDATE_ACTION'
    | 'CHECK_ACTION'
    | 'CREATE_SUPPORT'
    | 'ACKNOWLEDGE_SUPPORT'
    | 'UPDATE_SUPPORT';
  payload: Record<string, unknown>;
}
