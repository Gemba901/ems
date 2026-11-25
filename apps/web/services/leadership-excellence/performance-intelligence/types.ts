import type { KpiDefinition, Pillar } from "../performance-planning/types";

export interface IntelligenceFilters {
  cycle?: string;
  startDate?: string;
  endDate?: string;
  departmentId?: string;
  personId?: string;
  pillar?: Pillar;
  alignment?: "Q" | "C" | "D" | "S" | "M" | "T" | "OTHER";
  scope?: "MY" | "DEPARTMENT" | "ORGANIZATION";
  search?: string;
}
export type IntelligencePeriodStatus =
  | "VERIFIED"
  | "SUBMITTED"
  | "DRAFT"
  | "RETURNED"
  | "MISSING"
  | "NOT_DUE"
  | "NOT_SCHEDULED";
export type IntelligenceFavourability =
  | "FAVOURABLE"
  | "UNFAVOURABLE"
  | "ON_TARGET"
  | "UNKNOWN";
export interface IntelligencePeriod {
  id: string;
  label: string;
  start: string;
  end: string;
  dueDate: string;
  due: boolean;
  submissionTime: string | null;
  submissionTimeZone: string | null;
  scheduled: boolean;
  partial: boolean;
  sourceResultId: string | null;
  officialResultId: string | null;
  status: IntelligencePeriodStatus;
  /** Previous verified result survives an unverified correction. */
  correctionPending: boolean;
  officialActual: number | null;
  provisionalActual: number | null;
  inputA: number | null;
  inputB: number | null;
  verifiedAt: string | null;
  target: number | null;
  upper: number | null;
  gap: number | null;
  favourability: IntelligenceFavourability;
}
export interface IntelligenceCoverage {
  scheduled: number;
  due: number;
  verified: number;
  submitted: number;
  missing: number;
  notDue: number;
  notScheduled: number;
  correctionPending: number;
  partial: boolean;
}
export interface IntelligenceMeasure {
  key: string;
  source: "AREA_04_KPI" | "AREA_03_MEASURED_RESULT";
  documentId: string;
  itemId: string;
  assignmentId: string | null;
  version: number;
  current: boolean;
  effectiveDate: string;
  cycle: string;
  scope: string;
  departmentId: string;
  departmentName: string;
  personId: string;
  personName: string;
  goalKey: string;
  goalTitle: string;
  code: string;
  name: string;
  pillar: Pillar | "";
  alignments: string[];
  unit: string;
  direction: string;
  aggregation: string;
  /** Exact immutable approved definition; programme measures have no KPI definition. */
  definition: KpiDefinition | null;
  measurementDefinition: string;
  measurementSource: string;
  officialActual: number | null;
  comparableTarget: number | null;
  comparableUpper: number | null;
  gap: number | null;
  favourability: IntelligenceFavourability;
  comparisonNote: string;
  coverage: IntelligenceCoverage;
  periods: IntelligencePeriod[];
  /** Chronological verified points only; versions and unlike measures never combined. */
  trend: {
    periodId: string;
    start: string;
    end: string;
    actual: number;
    target: number | null;
    verifiedAt: string;
    resultId: string;
  }[];
  sourceHref: string;
}
export interface IntelligenceView {
  generatedAt: string;
  today: string;
  revisions: { planning: number; execution: number };
  filters: IntelligenceFilters & {
    scope: "MY" | "DEPARTMENT" | "ORGANIZATION";
  };
  access: {
    scopeLabel: string;
    canViewDepartment: boolean;
    canViewOrganization: boolean;
  };
  options: {
    cycles: string[];
    departments: { id: string; name: string }[];
    people: { id: string; name: string; departmentId: string | null }[];
    pillars: { code: Pillar; name: string }[];
    alignments: string[];
  };
  summary: {
    kpis: number;
    companyMeasures: number;
    departmentMeasures: number;
    individualMeasures: number;
    verifiedPeriods: number;
    submittedPeriods: number;
    missingPeriods: number;
    correctionPending: number;
    atOrAboveTarget: number;
    belowTarget: number;
    incomparable: number;
    actions: number;
    overdueActions: number;
    openSupport: number;
    unacknowledgedSupport: number;
    overallScore: null;
  };
  /** Employee KPI numbers never stand in for independently measured company results. */
  kpis: IntelligenceMeasure[];
  measuredResults: IntelligenceMeasure[];
  actions: {
    key: string;
    documentId: string;
    goalKey: string;
    goalTitle: string;
    title: string;
    ownerId: string;
    ownerName: string;
    dueDate: string;
    status: string;
    progress: number;
    overdue: boolean;
    sourceHref: string;
  }[];
  support: {
    id: string;
    goalKey: string;
    goalTitle: string;
    title: string;
    assignedToId: string;
    assignedToName: string;
    dueDate: string;
    status: string;
    acknowledgedAt: string | null;
    overdue: boolean;
    sourceHref: string;
  }[];
  notes: string[];
}
