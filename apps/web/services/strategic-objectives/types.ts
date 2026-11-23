export type PillarCode = "LEX" | "PEX" | "OPX" | "CMX" | "SGEX" | "FPEX";
export type Alignment =
  | "Quality"
  | "Cost"
  | "Delivery"
  | "Safety"
  | "Morale"
  | "Technology";
export type DemoRole = "LEADERSHIP" | "APPROVER" | "READER";
export type RecordStatus = "Draft" | "Approved" | "Revised";
export type SmartDimension =
  | "Specific"
  | "Measurable"
  | "Achievable"
  | "Relevant"
  | "Time-bound";

export interface Pillar {
  code: PillarCode;
  name: string;
  description: string;
}
export interface Department {
  id: string;
  name: string;
}
export interface Employee {
  id: string;
  name: string;
  departmentId: string;
  position: string;
}
export interface PlanningPeriod {
  id: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
}
export interface Dependencies {
  pillars: Pillar[];
  departments: Department[];
  employees: Employee[];
  planningPeriods: PlanningPeriod[];
}
export interface DemoSession {
  role: DemoRole;
  employeeId: string;
  name: string;
  canEdit: boolean;
  canApprove: boolean;
}

export interface ObjectiveData {
  title: string;
  meaning: string;
  primaryPillarCode: PillarCode | null;
  alignments: Alignment[];
  ownerId: string | null;
  planningPeriodId: string | null;
}
export interface GoalData {
  resultStatement: string;
  measure: string;
  baseline: number | null;
  target: number | null;
  unit: string;
  ownerId: string | null;
  deadline: string;
  contributingDepartmentIds: string[];
  // Optional explanatory prose; these five boxes are never required.
  smartExplanations: Partial<Record<SmartDimension, string>>;
  // Human judgement cannot be inferred reliably from text or a numeric target.
  smartConfirmations: {
    specific: boolean;
    achievable: boolean;
    relevant: boolean;
  };
}
export interface Version<T> {
  number: number;
  status: RecordStatus;
  data: T;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  approvedAt: string | null;
  approvedBy: string | null;
  effectiveDate: string | null;
  changeReason: string | null;
}
export interface AuditEntry {
  action: "Created" | "Saved draft" | "Approved" | "Revision started";
  actorId: string;
  at: string;
  version: number;
}
export interface PlanRecord<T> {
  id: string;
  code: string;
  versions: Version<T>[];
  audit: AuditEntry[];
}
export type ObjectiveRecord = PlanRecord<ObjectiveData>;
export type GoalRecord = PlanRecord<GoalData> & { objectiveId: string };
export interface RecordView<T> {
  id: string;
  code: string;
  current: Version<T>;
  history: Version<T>[];
  audit: AuditEntry[];
}
export type GoalView = RecordView<GoalData> & { objectiveId: string };
export type ObjectiveView = RecordView<ObjectiveData> & { goals: GoalView[] };
export interface ApprovedCompanyGoal {
  id: string;
  code: string;
  objectiveId: string;
  objectiveCode: string;
  objectiveTitle: string;
  version: number;
  data: GoalData;
}
export interface MockState {
  objectives: ObjectiveRecord[];
  goals: GoalRecord[];
}
export interface SmartCheck {
  dimension: SmartDimension;
  ready: boolean;
  message: string;
}
export type ValidationErrors = Record<string, string>;

// Screens depend on this Promise-based contract, not the mock implementation.
export interface StrategicObjectivesService {
  getSession(): Promise<DemoSession>;
  setDemoRole(role: DemoRole): Promise<DemoSession>;
  getObjectives(): Promise<ObjectiveView[]>;
  createObjective(input?: Partial<ObjectiveData>): Promise<ObjectiveView>;
  saveObjective(
    id: string,
    input: Partial<ObjectiveData>,
    expectedVersion: number,
  ): Promise<ObjectiveView>;
  approveObjective(id: string, expectedVersion: number): Promise<ObjectiveView>;
  saveGoal(
    objectiveId: string,
    input: Partial<GoalData>,
    id?: string,
    expectedVersion?: number,
  ): Promise<GoalView>;
  approveGoal(id: string, expectedVersion: number): Promise<GoalView>;
  reviseObjective(
    id: string,
    reason: string,
    effectiveDate: string,
  ): Promise<ObjectiveView>;
  reviseGoal(
    id: string,
    reason: string,
    effectiveDate: string,
  ): Promise<GoalView>;
  getApprovedCompanyGoals(
    departmentId?: string,
  ): Promise<ApprovedCompanyGoal[]>;
  getPillars(): Promise<Pillar[]>;
  getDepartments(): Promise<Department[]>;
  getEmployees(): Promise<Employee[]>;
  getPlanningPeriods(): Promise<PlanningPeriod[]>;
}
