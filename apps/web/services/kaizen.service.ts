import { apiClient } from "@/lib/api-client";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export type KaizenStatus =
  | "DRAFT"
  | "PENDING_HOD_PRE_REVIEW"
  | "RETURNED_FOR_REVISION"
  | "REJECTED"
  | "MOVED_TO_SGA"
  | "IN_IMPLEMENTATION"
  | "PENDING_VERIFICATION"
  | "RETURNED_FOR_REWORK"
  | "VERIFIED_CLOSED";

export type KaizenTrigger =
  | "PROBLEM_NOTICED"
  | "IMPROVEMENT_OPPORTUNITY_NOTICED"
  | "ALERT_ACTION_REQUIRED"
  | "ABNORMALITY_ACTION_REQUIRED"
  | "EMPLOYEE_SUGGESTION_OR_IDEA"
  | "AUDIT_OBSERVATION"
  | "GEMBA_WALK_OBSERVATION"
  | "CUSTOMER_COMPLAINT_OR_FEEDBACK"
  | "MANAGEMENT_INSTRUCTION_OR_FEEDBACK"
  | "REPEAT_PROBLEM"
  | "OTHER";

export type KaizenReferenceApplicability = "APPLICABLE" | "NOT_APPLICABLE" | "REFERENCE_NOT_FOUND";

export type KaizenQcdsmtCategory = "QUALITY" | "COST" | "DELIVERY" | "SAFETY" | "MORALE" | "TECHNOLOGY";

export type KaizenUnit =
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

export type KaizenWaste =
  | "TRANSPORTATION"
  | "INVENTORY"
  | "MOTION"
  | "WAITING"
  | "OVERPRODUCTION"
  | "OVERPROCESSING"
  | "DEFECTS"
  | "NOT_APPLICABLE";

export type KaizenHodPreReviewDecision = "PENDING" | "APPROVE" | "RETURN" | "REJECT" | "MOVE_TO_SGA";

export type KaizenVerificationStage = "HOD" | "STEERING_COMMITTEE" | "FINANCE";

export type KaizenVerificationDecision = "PENDING" | "VERIFIED" | "RETURN" | "NOT_APPLICABLE";

export interface KaizenEmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  department?: { id: string; name: string } | null;
}

export interface KaizenReview {
  id: string;
  statusChanged: KaizenStatus;
  note: string | null;
  createdAt: string;
  reviewer: { id: string; firstName: string; lastName: string };
}

export interface KaizenQcdsmtImpact {
  id: string;
  kaizenId: string;
  category: KaizenQcdsmtCategory;
  whatIsMeasured: string;
  beforeValue: string | null;
  afterValue: string | null;
  unit: KaizenUnit;
  otherUnitLabel: string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KaizenWasteImpact {
  id: string;
  kaizenId: string;
  waste: KaizenWaste;
  whatIsMeasured: string;
  beforeValue: string | null;
  afterValue: string | null;
  unit: KaizenUnit;
  otherUnitLabel: string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KaizenVerification {
  id: string;
  kaizenId: string;
  stage: KaizenVerificationStage;
  decision: KaizenVerificationDecision;
  remarks: string | null;
  verifiedBenefitAmount: string | null;
  verifiedBenefitCurrency: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface Kaizen {
  id: string;
  organizationId: string;
  employeeId: string;
  departmentId: string;
  status: KaizenStatus;

  // Part 1: reason
  title: string | null;
  trigger: KaizenTrigger | null;
  triggerOther: string | null;

  // Part 2: related reference
  referenceValue: string | null;
  referenceApplicability: KaizenReferenceApplicability | null;

  // Part 3: condition or opportunity
  conditionDescription: string;
  conditionEvidenceUrls: string[];

  // Part 4: basic daily kaizen information
  startDate: string | null;
  targetCompletionDate: string | null;
  kaizenOwnerId: string | null;

  // Part 7: required materials and estimated cost
  requiredMaterials: string | null;
  estimatedCost: string | null;
  estimatedCostCurrency: string | null;

  // Part 8: HOD review before implementation
  hodPreReviewDecision: KaizenHodPreReviewDecision;
  hodPreReviewRemarks: string | null;
  hodPreReviewById: string | null;
  hodPreReviewAt: string | null;

  // Part 9: implementation and evidence
  actionTaken: string | null;
  afterPhotoUrls: string[];
  resultSaving: string | null;

  linkedSgaId: string | null;

  createdAt: string;
  updatedAt: string;

  employee: KaizenEmployeeSummary;
  department: { id: string; name: string } | null;
  kaizenOwner: { id: string; firstName: string; lastName: string } | null;
  hodPreReviewBy: { id: string; firstName: string; lastName: string } | null;
  teamMembers: { id: string; firstName: string; lastName: string }[];
  qcdsmtImpacts: KaizenQcdsmtImpact[];
  wasteImpacts: KaizenWasteImpact[];
  verifications: KaizenVerification[];
  reviews: KaizenReview[];
}

// Part 1
export interface CreateKaizenReasonPayload {
  trigger: KaizenTrigger;
  triggerOther?: string;
}

// Part 2
export interface UpdateKaizenReferencePayload {
  referenceValue?: string;
  referenceApplicability?: KaizenReferenceApplicability;
}

// Part 3
export interface UpdateKaizenConditionPayload {
  conditionDescription: string;
  conditionEvidenceUrls: string[];
}

// Part 4
export interface UpdateKaizenBasicInfoPayload {
  title: string;
  startDate: string;
  targetCompletionDate: string;
  kaizenOwnerId: string;
  teamMemberIds?: string[];
}

// Part 5
export interface KaizenQcdsmtImpactItemPayload {
  category: KaizenQcdsmtCategory;
  whatIsMeasured: string;
  beforeValue?: string;
  afterValue?: string;
  unit: KaizenUnit;
  otherUnitLabel?: string;
  currency?: string;
}

export interface UpdateKaizenQcdsmtImpactPayload {
  impacts: KaizenQcdsmtImpactItemPayload[];
}

// Part 6
export interface KaizenWasteImpactItemPayload {
  waste: KaizenWaste;
  whatIsMeasured: string;
  beforeValue?: string;
  afterValue?: string;
  unit: KaizenUnit;
  otherUnitLabel?: string;
  currency?: string;
}

export interface UpdateKaizenWastePayload {
  impacts: KaizenWasteImpactItemPayload[];
}

// Part 7
export interface UpdateKaizenImplementationPlanPayload {
  requiredMaterials: string;
  estimatedCost?: string;
  estimatedCostCurrency?: string;
}

// Part 8
export interface SubmitHodPreReviewPayload {
  decision: "APPROVE" | "RETURN" | "REJECT" | "MOVE_TO_SGA";
  remarks?: string;
}

// Part 9
export interface UpdateKaizenImplementationPayload {
  actionTaken: string;
  afterPhotoUrls: string[];
  resultSaving?: string;
}

// Part 10
export interface SubmitVerificationStagePayload {
  stage: KaizenVerificationStage;
  decision: "VERIFIED" | "RETURN";
  remarks?: string;
  verifiedBenefitAmount?: string;
  verifiedBenefitCurrency?: string;
}

export const KaizenService = {
  async create(data: CreateKaizenReasonPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async getAll(token: string): Promise<Kaizen[]> {
    const res = await apiClient(`${API_URL}/kaizen`, { headers: authHeaders(token) }, token);
    return handleResponse<Kaizen[]>(res);
  },

  async getMine(token: string): Promise<Kaizen[]> {
    const res = await apiClient(`${API_URL}/kaizen/me`, { headers: authHeaders(token) }, token);
    return handleResponse<Kaizen[]>(res);
  },

  async getPendingVerification(token: string): Promise<Kaizen[]> {
    const res = await apiClient(`${API_URL}/kaizen/pending-verification`, { headers: authHeaders(token) }, token);
    return handleResponse<Kaizen[]>(res);
  },

  async getByDepartment(departmentId: string, token: string): Promise<Kaizen[]> {
    const res = await apiClient(`${API_URL}/kaizen/department/${departmentId}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<Kaizen[]>(res);
  },

  async getById(id: string, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<Kaizen>(res);
  },

  async getHistory(id: string, token: string): Promise<KaizenReview[]> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/history`, { headers: authHeaders(token) }, token);
    return handleResponse<KaizenReview[]>(res);
  },

  async updateReference(id: string, data: UpdateKaizenReferencePayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/reference`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async updateCondition(id: string, data: UpdateKaizenConditionPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/condition`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async updateBasicInfo(id: string, data: UpdateKaizenBasicInfoPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/basic-info`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async updateQcdsmtImpact(id: string, data: UpdateKaizenQcdsmtImpactPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/qcdsmt-impact`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async updateWaste(id: string, data: UpdateKaizenWastePayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/waste`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async updateImplementationPlan(id: string, data: UpdateKaizenImplementationPlanPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/implementation-plan`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async submitForHodPreReview(id: string, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/submit-for-hod-review`, {
      method: "PATCH",
      headers: authHeaders(token),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async submitHodPreReview(id: string, data: SubmitHodPreReviewPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/hod-pre-review`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async updateImplementation(id: string, data: UpdateKaizenImplementationPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/implementation`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async submitForVerification(id: string, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/submit-for-verification`, {
      method: "PATCH",
      headers: authHeaders(token),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async submitVerificationStage(id: string, data: SubmitVerificationStagePayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/verification-stage`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },
};
