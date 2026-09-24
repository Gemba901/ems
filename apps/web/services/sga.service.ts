import { apiClient } from "@/lib/api-client";
const API_URL = "/api";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface SgaDraftMissingItem {
  key: string;
  label: string;
  step: number;
}

// Thrown when submit-for-HOD-approval is refused because the draft is incomplete.
export class SgaIncompleteError extends Error {
  constructor(message: string, public missing: SgaDraftMissingItem[]) {
    super(message);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    if (Array.isArray(error.missing)) {
      throw new SgaIncompleteError(error.message, error.missing);
    }
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export type SgaStatus =
  | "DRAFT"
  | "PENDING_HOD_APPROVAL"
  | "RETURNED_FOR_REVISION"
  | "REJECTED"
  | "IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "RETURNED_FOR_REWORK"
  | "VERIFIED_CLOSED";

export type SgaStartingReason =
  | "QUALITY_PROBLEM_OR_IMPROVEMENT"
  | "COST_REDUCTION_OR_FINANCIAL_LOSS"
  | "DELIVERY_DELAY_OR_PROCESS_FLOW"
  | "SAFETY_OR_ENVIRONMENTAL_IMPROVEMENT"
  | "PRODUCTIVITY_OR_CAPACITY_IMPROVEMENT"
  | "MORALE_TEAMWORK_OR_WORK_DIFFICULTY"
  | "TECHNOLOGY_OR_AUTOMATION_IMPROVEMENT"
  | "SYSTEMS_INFORMATION_OR_DATA_REPORTING_IMPROVEMENT"
  | "INVENTORY_OR_WIP_REDUCTION"
  | "MACHINE_BREAKDOWN_OR_EQUIPMENT_PERFORMANCE"
  | "SMED_CHANGEOVER_TIME_REDUCTION"
  | "EXTERNAL_CUSTOMER_REQUIREMENT"
  | "EXTERNAL_CUSTOMER_COMPLAINT"
  | "INTERNAL_CUSTOMER_OR_CROSS_FUNCTIONAL_REQUIREMENT"
  | "ALERT_OR_ABNORMALITY_REQUIRING_TEAM_PROJECT"
  | "AUDIT_FINDING_OR_GEMBA_WALK_OBSERVATION"
  | "MANAGEMENT_IMPROVEMENT_PRIORITY"
  | "DAILY_KAIZEN_UPGRADED_TO_SGA"
  | "OTHER";

export type SgaReferenceApplicability = "APPLICABLE" | "NOT_APPLICABLE" | "REFERENCE_NOT_FOUND";

export type SgaReferenceType =
  | "ISO_STANDARD_OR_CLAUSE"
  | "SOP_OR_WORK_INSTRUCTION"
  | "AUDIT_REPORT_OR_FINDING"
  | "CUSTOMER_SPECIFICATION"
  | "REGULATORY_OR_STATUTORY_REQUIREMENT"
  | "OTHER";

export type SgaQcdsmtCategory = "QUALITY" | "COST" | "DELIVERY" | "SAFETY" | "MORALE" | "TECHNOLOGY";

export type SgaUnit =
  | "SECONDS"
  | "HOURS"
  | "MINUTES"
  | "PIECES"
  | "KILOGRAMS"
  | "TONNES"
  | "METRES"
  | "LITRES"
  | "PERCENTAGE"
  | "CURRENCY"
  | "OTHER";

export type SgaWaste =
  | "TRANSPORTATION"
  | "INVENTORY"
  | "MOTION"
  | "WAITING"
  | "OVERPRODUCTION"
  | "OVERPROCESSING"
  | "DEFECTS"
  | "NOT_APPLICABLE";

export type SgaHodDecision = "PENDING" | "APPROVED" | "RETURNED" | "REJECTED";

export type SgaMeetingFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM";

export type SgaWeekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export type SgaRootCauseTool = "FISHBONE_5M" | "WHY_WHY" | "PARETO" | "PROCESS_OBSERVATION" | "DATA_TREND" | "OTHER";

export type SgaFishboneCategory = "PEOPLE" | "MACHINE" | "MATERIAL" | "METHOD" | "MEASUREMENT" | "ENVIRONMENT_OTHER";

export type SgaWhyWhyDecision = "MORE_INVESTIGATION_REQUIRED" | "ROOT_CAUSE_CONFIRMED" | "NOT_ROOT_CAUSE";

export type SgaImplementationStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD";

export type SgaVerificationStage = "AFFECTED_DEPARTMENT" | "HOD" | "STEERING_COMMITTEE" | "FINANCE";

export type SgaVerificationDecision = "PENDING" | "VERIFIED" | "RETURN" | "NOT_APPLICABLE";

export type SgaBenefitPeriod = "PER_DAY" | "PER_WEEK" | "PER_MONTH" | "PER_YEAR" | "ONE_TIME";

export interface SgaEmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  department?: { id: string; name: string } | null;
}

export interface SgaPersonSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SgaReview {
  id: string;
  statusChanged: SgaStatus;
  note: string | null;
  createdAt: string;
  reviewer: SgaPersonSummary;
}

export interface SgaQcdsmtImpact {
  id: string;
  sgaId: string;
  category: SgaQcdsmtCategory;
  description: string | null;
  whatIsMeasured: string;
  baselineValue: string | null;
  targetValue: string | null;
  unit: SgaUnit;
  otherUnitLabel: string | null;
  currency: string | null;
  expectedBenefit: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SgaWasteImpact {
  id: string;
  sgaId: string;
  waste: SgaWaste;
  description: string | null;
  whatIsMeasured: string;
  baselineValue: string | null;
  targetValue: string | null;
  unit: SgaUnit;
  otherUnitLabel: string | null;
  currency: string | null;
  expectedBenefit: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SgaMeasure {
  id: string;
  sgaId: string;
  whatIsMeasured: string;
  baselineValue: string | null;
  targetValue: string | null;
  finalResultValue: string | null;
  unit: SgaUnit;
  otherUnitLabel: string | null;
  linkedQcdsmt: SgaQcdsmtCategory | null;
  linkedWaste: SgaWaste | null;
  createdAt: string;
  updatedAt: string;
}

export interface SgaFishboneCause {
  id: string;
  sgaId: string;
  category: SgaFishboneCategory;
  description: string;
  createdAt: string;
}

export interface SgaWhyWhyChain {
  id: string;
  sgaId: string;
  causeToInvestigate: string;
  linked5mCategory: SgaFishboneCategory | null;
  whys: string[];
  evidence: string | null;
  finalDecision: SgaWhyWhyDecision;
  createdAt: string;
  updatedAt: string;
}

export interface SgaQcdsmtBenefit {
  id: string;
  sgaId: string;
  category: SgaQcdsmtCategory;
  whatWasAchieved: string;
  createdAt: string;
  updatedAt: string;
}

export interface SgaMeetingReport {
  id: string;
  sgaId: string;
  meetingNumber: number;
  meetingDate: string;
  durationMinutes: number | null;
  attendeeIds: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SgaActionStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export interface SgaActionItem {
  id: string;
  sgaId: string;
  confirmedRootCause: string;
  improvementAction: string;
  responsiblePersonId: string | null;
  dueDate: string | null;
  status: SgaActionStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  responsiblePerson: SgaPersonSummary | null;
}

export interface SgaVerification {
  id: string;
  sgaId: string;
  stage: SgaVerificationStage;
  decision: SgaVerificationDecision;
  remarks: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedBy: SgaPersonSummary | null;
}

export interface Sga {
  id: string;
  organizationId: string;
  employeeId: string;
  status: SgaStatus;

  // Step 1 §1: reason
  startingReason: SgaStartingReason | null;
  startingReasonOther: string | null;
  referenceApplicability: SgaReferenceApplicability | null;
  referenceType: SgaReferenceType | null;
  referenceNumber: string | null;

  // Step 1 §2: SGA information and problem
  title: string | null;
  problemDescription: string | null;
  startDate: string | null;
  targetCompletionDate: string | null;
  mainDepartmentId: string | null;
  workArea: string | null;
  beforeFileUrls: string[];

  // Step 2 §4: team
  ownerId: string | null;

  // Step 2 §5: meeting plan
  meetingFrequency: SgaMeetingFrequency | null;
  meetingFrequencyCustomText: string | null;
  meetingDay: SgaWeekday | null;
  meetingTime: string | null;
  meetingEndTime: string | null;
  meetingDurationMinutes: number | null;
  meetingLocation: string | null;

  // Step 2 §6: resources, investment, HOD approval
  requiredResources: string | null;
  expectedBenefitSummary: string | null;
  approximateInvestmentAmount: string | null;
  approximateInvestmentCurrency: string | null;
  hodDecision: SgaHodDecision;
  hodRemarks: string | null;
  hodDecisionById: string | null;
  hodDecisionAt: string | null;

  // Step 3 §7: current condition
  evidenceSource: string | null;
  immediateControlNeeded: boolean;

  // Step 3 §8: root cause analysis
  rootCauseTools: SgaRootCauseTool[];
  otherAnalysisNotes: string | null;
  otherAnalysisFileUrls: string[];

  // Step 4 §11: implementation
  implementationSummary: string | null;
  afterFileUrls: string[];
  actualImplementationCost: string | null;
  actualImplementationCostCurrency: string | null;
  implementationStatus: SgaImplementationStatus;

  // Step 5 §13: benefits and sustainability
  wasteReductionAchieved: string | null;
  financialLossBeforeImprovement: string | null;
  verifiedGrossBenefit: string | null;
  benefitPeriod: SgaBenefitPeriod | null;
  effectivenessConfirmationPeriod: string | null;
  sopUpdated: boolean;
  employeesTrained: boolean;
  followUpCheckPlanned: boolean;
  appliedElsewhere: boolean;
  lessonsLearned: string | null;

  // Step 6 §14: verify and close
  verifyingDepartmentId: string | null;
  departmentRepId: string | null;

  createdAt: string;
  updatedAt: string;

  employee: SgaEmployeeSummary;
  mainDepartment: { id: string; name: string } | null;
  otherDepartments: { id: string; name: string }[];
  owner: SgaPersonSummary | null;
  teamMembers: SgaPersonSummary[];
  hodDecisionBy: SgaPersonSummary | null;
  verifyingDepartment: { id: string; name: string } | null;
  departmentRep: SgaPersonSummary | null;
  qcdsmtImpacts: SgaQcdsmtImpact[];
  wasteImpacts: SgaWasteImpact[];
  measures: SgaMeasure[];
  fishboneCauses: SgaFishboneCause[];
  whyWhyChains: SgaWhyWhyChain[];
  meetingReports: SgaMeetingReport[];
  actionItems: SgaActionItem[];
  qcdsmtBenefits: SgaQcdsmtBenefit[];
  verifications: SgaVerification[];
  reviews: SgaReview[];
}

// Step 1 §1
export interface CreateSgaPayload {
  problemDescription?: string;
  title?: string;
  startingReason?: SgaStartingReason;
  mainDepartmentId?: string;
  workArea?: string;
  beforeFileUrls?: string[];
}

export interface UpdateSgaReasonPayload {
  startingReason?: SgaStartingReason;
  startingReasonOther?: string;
  referenceApplicability?: SgaReferenceApplicability;
  referenceType?: SgaReferenceType;
  referenceNumber?: string;
}

// Step 1 §2
export interface UpdateSgaInfoPayload {
  title?: string;
  problemDescription?: string;
  startDate?: string;
  targetCompletionDate?: string;
  mainDepartmentId?: string;
  otherDepartmentIds?: string[];
  workArea?: string;
  beforeFileUrls?: string[];
}

// Step 1 §3
export interface SgaQcdsmtImpactItemPayload {
  category: SgaQcdsmtCategory;
  description?: string;
  whatIsMeasured: string;
  baselineValue?: string;
  targetValue?: string;
  unit: SgaUnit;
  otherUnitLabel?: string;
  currency?: string;
  expectedBenefit?: string;
}

export interface SgaWasteImpactItemPayload {
  waste: SgaWaste;
  description?: string;
  whatIsMeasured?: string;
  baselineValue?: string;
  targetValue?: string;
  unit?: SgaUnit;
  otherUnitLabel?: string;
  currency?: string;
  expectedBenefit?: string;
}

export interface UpdateSgaImpactPayload {
  impacts: SgaQcdsmtImpactItemPayload[];
  wasteImpacts?: SgaWasteImpactItemPayload[];
}

// Step 2 §4
export interface SgaTeamCandidate {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

export interface UpdateSgaTeamPayload {
  ownerId?: string;
  teamMemberIds?: string[];
}

// Step 2 §5
export interface UpdateSgaMeetingPlanPayload {
  meetingFrequency?: SgaMeetingFrequency;
  meetingFrequencyCustomText?: string;
  meetingDay?: SgaWeekday;
  meetingTime?: string;
  meetingEndTime?: string;
  meetingDurationMinutes?: number;
  meetingLocation?: string;
}

// Step 2 §6
export interface UpdateSgaResourcesPayload {
  requiredResources?: string;
  expectedBenefitSummary?: string;
  approximateInvestmentAmount?: number;
  approximateInvestmentCurrency?: string;
}

export interface SubmitSgaHodApprovalPayload {
  decision: "APPROVED" | "RETURNED" | "REJECTED";
  remarks?: string;
}

// Step 3 §7
export interface SgaMeasureItemPayload {
  id?: string;
  whatIsMeasured: string;
  baselineValue?: string;
  targetValue?: string;
  finalResultValue?: string;
  unit: SgaUnit;
  otherUnitLabel?: string;
  linkedQcdsmt?: SgaQcdsmtCategory;
  linkedWaste?: SgaWaste;
}

export interface UpdateSgaConditionPayload {
  evidenceSource?: string;
  immediateControlNeeded: boolean;
  measures?: SgaMeasureItemPayload[];
}

// Step 3 §8
export interface SgaFishboneCauseItemPayload {
  id?: string;
  category: SgaFishboneCategory;
  description: string;
}

export interface SgaWhyWhyChainItemPayload {
  id?: string;
  causeToInvestigate: string;
  linked5mCategory?: SgaFishboneCategory;
  whys?: string[];
  evidence?: string;
  finalDecision?: SgaWhyWhyDecision;
}

export interface UpdateSgaRootCausePayload {
  rootCauseTools?: SgaRootCauseTool[];
  otherAnalysisNotes?: string;
  otherAnalysisFileUrls?: string[];
  fishboneCauses?: SgaFishboneCauseItemPayload[];
  whyWhyChains?: SgaWhyWhyChainItemPayload[];
}

// Step 3 §9
export interface CreateSgaMeetingReportPayload {
  meetingNumber: number;
  meetingDate: string;
  durationMinutes?: number;
  attendeeIds?: string[];
  notes?: string;
}

export interface UpdateSgaMeetingReportPayload {
  meetingDate?: string;
  durationMinutes?: number;
  attendeeIds?: string[];
  notes?: string;
}

// Step 4 §10
export interface SgaActionItemPayload {
  id?: string;
  confirmedRootCause: string;
  improvementAction: string;
  responsiblePersonId?: string;
  dueDate?: string;
}

export interface UpdateSgaActionPlanPayload {
  actionItems: SgaActionItemPayload[];
}

// Step 4 §11
export interface UpdateSgaImplementationPayload {
  implementationSummary?: string;
  afterFileUrls?: string[];
  actualImplementationCost?: number;
  actualImplementationCostCurrency?: string;
  implementationStatus: SgaImplementationStatus;
}

// Step 5 §12
export interface UpdateSgaResultMeasureItemPayload {
  id?: string;
  whatIsMeasured: string;
  baselineValue?: string;
  targetValue?: string;
  finalResultValue?: string;
  unit: SgaUnit;
  otherUnitLabel?: string;
  linkedQcdsmt?: SgaQcdsmtCategory;
  linkedWaste?: SgaWaste;
}

export interface UpdateSgaResultsPayload {
  measures: UpdateSgaResultMeasureItemPayload[];
}

// Step 5 §13
export interface SgaQcdsmtBenefitItemPayload {
  category: SgaQcdsmtCategory;
  whatWasAchieved: string;
}

export interface UpdateSgaBenefitsPayload {
  qcdsmtBenefits?: SgaQcdsmtBenefitItemPayload[];
  wasteReductionAchieved?: string;
  financialLossBeforeImprovement?: number;
  verifiedGrossBenefit?: number;
  benefitPeriod?: SgaBenefitPeriod;
  effectivenessConfirmationPeriod?: string;
  sopUpdated: boolean;
  employeesTrained: boolean;
  followUpCheckPlanned: boolean;
  appliedElsewhere: boolean;
  lessonsLearned?: string;
}

// Step 6 §14
export interface UpdateSgaVerifyingDepartmentPayload {
  verifyingDepartmentId: string;
  departmentRepId?: string;
}

export interface SubmitSgaVerificationStagePayload {
  stage: SgaVerificationStage;
  decision: "VERIFIED" | "RETURN";
  remarks?: string;
}

export const SgaService = {
  async create(data: CreateSgaPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async delete(id: string, token: string): Promise<{ id: string }> {
    const res = await apiClient(`${API_URL}/sga/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    return handleResponse<{ id: string }>(res);
  },

  async getAll(token: string): Promise<Sga[]> {
    const res = await apiClient(`${API_URL}/sga`, { headers: authHeaders(token) }, token);
    return handleResponse<Sga[]>(res);
  },

  async getMine(token: string): Promise<Sga[]> {
    const res = await apiClient(`${API_URL}/sga/me`, { headers: authHeaders(token) }, token);
    return handleResponse<Sga[]>(res);
  },

  async getPendingVerification(token: string): Promise<Sga[]> {
    const res = await apiClient(`${API_URL}/sga/pending-verification`, { headers: authHeaders(token) }, token);
    return handleResponse<Sga[]>(res);
  },

  async getByDepartment(departmentId: string, token: string): Promise<Sga[]> {
    const res = await apiClient(`${API_URL}/sga/department/${departmentId}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<Sga[]>(res);
  },

  async getById(id: string, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<Sga>(res);
  },

  async getHistory(id: string, token: string): Promise<SgaReview[]> {
    const res = await apiClient(`${API_URL}/sga/${id}/history`, { headers: authHeaders(token) }, token);
    return handleResponse<SgaReview[]>(res);
  },

  async updateReason(id: string, data: UpdateSgaReasonPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/reason`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateInfo(id: string, data: UpdateSgaInfoPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/info`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateImpact(id: string, data: UpdateSgaImpactPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/impact`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async getTeamCandidates(id: string, token: string, departmentIds?: string[]): Promise<SgaTeamCandidate[]> {
    const query = departmentIds?.length ? `?departmentIds=${departmentIds.join(",")}` : "";
    const res = await apiClient(`${API_URL}/sga/${id}/team-candidates${query}`, { headers: authHeaders(token) }, token);
    return handleResponse<SgaTeamCandidate[]>(res);
  },

  async updateTeam(id: string, data: UpdateSgaTeamPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/team`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateMeetingPlan(id: string, data: UpdateSgaMeetingPlanPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/meeting-plan`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateResources(id: string, data: UpdateSgaResourcesPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/resources`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async submitForHodApproval(id: string, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/submit-for-hod-approval`, {
      method: "PATCH",
      headers: authHeaders(token),
    }, token);
    return handleResponse<Sga>(res);
  },

  async submitHodApproval(id: string, data: SubmitSgaHodApprovalPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/hod-approval`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateCondition(id: string, data: UpdateSgaConditionPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/condition`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateRootCause(id: string, data: UpdateSgaRootCausePayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/root-cause`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async createMeetingReport(id: string, data: CreateSgaMeetingReportPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/meeting-reports`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateMeetingReport(id: string, reportId: string, data: UpdateSgaMeetingReportPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/meeting-reports/${reportId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async deleteMeetingReport(id: string, reportId: string, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/meeting-reports/${reportId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateActionPlan(id: string, data: UpdateSgaActionPlanPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/action-plan`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateActionItemStatus(id: string, itemId: string, status: SgaActionStatus, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/action-items/${itemId}/status`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateImplementation(id: string, data: UpdateSgaImplementationPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/implementation`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateResults(id: string, data: UpdateSgaResultsPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/results`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateBenefits(id: string, data: UpdateSgaBenefitsPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/benefits`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async updateVerifyingDepartment(id: string, data: UpdateSgaVerifyingDepartmentPayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/verifying-department`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },

  async submitForVerification(id: string, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/submit-for-verification`, {
      method: "PATCH",
      headers: authHeaders(token),
    }, token);
    return handleResponse<Sga>(res);
  },

  async submitVerificationStage(id: string, data: SubmitSgaVerificationStagePayload, token: string): Promise<Sga> {
    const res = await apiClient(`${API_URL}/sga/${id}/verify`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Sga>(res);
  },
};
